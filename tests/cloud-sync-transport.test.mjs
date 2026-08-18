import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/cloud-sync-transport.js", import.meta.url), "utf8");

function loadTransport() {
  const context = { URL, URLSearchParams, Date, Error, Promise, console };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.transport = {
    normalizeCloudSyncConfig, normalizeCloudSyncRedirectUrl, normalizeCloudSyncSession, createCloudSyncSession,
    requestSupabaseMagicLink, hasSupabaseMagicLinkCallback, cleanSupabaseMagicLinkCallbackUrl,
    parseSupabaseMagicLinkSession, refreshSupabaseCloudSession,
    fetchSupabaseSyncDocuments, invokeSupabaseSyncOperation, requestSupabaseJson
  };`, context);
  return context.transport;
}

function validConfig() {
  return {
    projectUrl: "https://study-example.supabase.co",
    publishableKey: `sb_publishable_${"a".repeat(24)}`,
    email: "learner@example.com",
  };
}

test("configuration accepts only hosted HTTPS Supabase and a publishable key", () => {
  const transport = loadTransport();
  assert.equal(transport.normalizeCloudSyncConfig(validConfig()).ready, true);
  assert.equal(transport.normalizeCloudSyncConfig({ ...validConfig(), projectUrl: "http://study-example.supabase.co" }).ready, false);
  assert.equal(transport.normalizeCloudSyncConfig({ ...validConfig(), projectUrl: "https://example.com" }).ready, false);
  assert.equal(transport.normalizeCloudSyncConfig({ ...validConfig(), projectUrl: "https://supabase.co" }).ready, false);
  assert.equal(transport.normalizeCloudSyncConfig({ ...validConfig(), projectUrl: "https://study-example.supabase.co:444" }).ready, false);
  assert.equal(transport.normalizeCloudSyncConfig({ ...validConfig(), publishableKey: `sb_secret_${"b".repeat(24)}` }).ready, false);
  assert.equal(transport.normalizeCloudSyncConfig({ ...validConfig(), publishableKey: "legacy-anon-placeholder" }).ready, false);
});

test("Magic Link request sends the exact callback and only the publishable application header", async () => {
  const transport = loadTransport();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await transport.requestSupabaseMagicLink(
    validConfig(), "Learner@Example.com", "https://dashboard.example.com/study/index.html#old", fetchImpl,
  );
  assert.equal(calls[0].url, "https://study-example.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fdashboard.example.com%2Fstudy%2Findex.html");
  assert.equal(calls[0].options.headers.apikey, validConfig().publishableKey);
  assert.equal(Object.hasOwn(calls[0].options.headers, "Authorization"), false);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "learner@example.com", create_user: true });
});

test("Magic Link callback creates a bounded session and returns a token-free URL", () => {
  const transport = loadTransport();
  const callback = "https://dashboard.example.com/study/?view=today#access_token=user-access-placeholder&refresh_token=refresh-placeholder&expires_in=3600&token_type=bearer&type=magiclink";
  assert.equal(transport.hasSupabaseMagicLinkCallback(callback), true);
  const result = transport.parseSupabaseMagicLinkSession(callback, "learner@example.com", 1000);
  assert.equal(result.session.email, "learner@example.com");
  assert.equal(result.session.expiresAt, 3601000);
  assert.equal(result.cleanUrl, "https://dashboard.example.com/study/?view=today");
  assert.doesNotMatch(result.cleanUrl, /access_token|refresh_token|placeholder/);
});

test("Magic Link callback rejects incomplete or error responses without echoing credentials", () => {
  const transport = loadTransport();
  assert.throws(
    () => transport.parseSupabaseMagicLinkSession(
      "https://dashboard.example.com/#error=access_denied&error_description=user-access-placeholder", "learner@example.com", 1000,
    ),
    (error) => /无效或已过期/.test(error.message) && !/placeholder/.test(error.message),
  );
  assert.throws(
    () => transport.parseSupabaseMagicLinkSession(
      "https://dashboard.example.com/#access_token=user-access-placeholder&expires_in=3600", "learner@example.com", 1000,
    ),
    (error) => /缺少有效会话/.test(error.message) && !/placeholder/.test(error.message),
  );
});

test("redirect URL accepts HTTPS and local development HTTP only", () => {
  const transport = loadTransport();
  assert.equal(transport.normalizeCloudSyncRedirectUrl("https://dashboard.example.com/path#token"), "https://dashboard.example.com/path");
  assert.equal(transport.normalizeCloudSyncRedirectUrl("http://127.0.0.1:8000/index.html"), "http://127.0.0.1:8000/index.html");
  assert.equal(transport.normalizeCloudSyncRedirectUrl("http://dashboard.example.com/path"), "");
  assert.equal(transport.normalizeCloudSyncRedirectUrl("https://user:pass@dashboard.example.com/path"), "");
});

test("database reads and RPC writes carry the user JWT separately from the publishable key", async () => {
  const transport = loadTransport();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => [] };
  };
  await transport.fetchSupabaseSyncDocuments(validConfig(), "user-jwt-placeholder", fetchImpl);
  await transport.invokeSupabaseSyncOperation(validConfig(), "user-jwt-placeholder", { operationId: "op-1" }, fetchImpl);
  assert.match(calls[0].url, /\/rest\/v1\/study_sync_documents\?select=/);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer user-jwt-placeholder");
  assert.equal(calls[0].options.headers.apikey, validConfig().publishableKey);
  assert.equal(calls[1].url, "https://study-example.supabase.co/rest/v1/rpc/apply_study_sync_operation");
  assert.deepEqual(JSON.parse(calls[1].options.body), { operation: { operationId: "op-1" } });
});

test("transport failures remain generic and never echo response credentials", async () => {
  const transport = loadTransport();
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: "user-access-placeholder sb_secret_should-not-echo" }),
  });
  await assert.rejects(
    () => transport.requestSupabaseJson(validConfig(), "/rest/v1/private", { fetchImpl, accessToken: "user-access-placeholder" }),
    (error) => /登录已失效/.test(error.message) && !/placeholder|sb_secret/.test(error.message),
  );
});

test("runtime keeps sessions out of localStorage and cloud configuration out of backups", () => {
  const runtime = fs.readFileSync(new URL("../js/cloud-sync.js", import.meta.url), "utf8");
  const safety = fs.readFileSync(new URL("../js/data-safety.js", import.meta.url), "utf8");
  const migrations = fs.readFileSync(new URL("../js/migrations.js", import.meta.url), "utf8");
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(runtime, /sessionStorage\.setItem\(cloudSyncSessionKey/);
  assert.doesNotMatch(runtime, /localStorage\.setItem\(cloudSyncSessionKey/);
  assert.match(runtime, /downloadJsonBackup\(\)[\s\S]*cloud-sync-device-bootstrap-v1/);
  assert.match(runtime, /remoteDocuments\.length[\s\S]*seedCloudSyncOutboxFromCurrentSnapshot/);
  assert.match(runtime, /history\.replaceState\(null, document\.title, cleanUrl\)/);
  assert.match(runtime, /consumeCloudSyncMagicLinkCallback\(\)[\s\S]*scheduleCloudSyncAfterLocalChange\(200\)/);
  assert.doesNotMatch(`${runtime}\n${index}`, /cloudSyncOtp|verifySupabaseEmailOtp|邮件验证码/);
  assert.match(index, /sendCloudSyncMagicLinkBtn[\s\S]*发送登录链接/);
  assert.match(safety, /excludedDeviceConfigKeys = new Set\(\["studyCloudSyncConfig"\]\)/);
  assert.match(migrations, /excludedDeviceConfigKeys = new Set\(\["studyCloudSyncConfig"\]\)/);
  assert.match(index, /cloud-sync-transport\.js\?v=magic-link-v158[\s\S]*cloud-sync\.js\?v=magic-link-v158/);
  assert.match(worker, /study-dashboard-magic-link-v158/);
  assert.doesNotMatch(`${runtime}\n${index}`, /sb_secret_[A-Za-z0-9_-]{20,}|service_role_[A-Za-z0-9_-]{20,}/);
});
