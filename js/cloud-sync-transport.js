// Supabase browser transport. Uses only publishable keys and never persists sessions here.
const CLOUD_SYNC_CONFIG_SCHEMA_VERSION = 1;

function cloudTransportText(value) { return String(value == null ? "" : value).trim(); }

function normalizeSupabaseProjectUrl(value) {
  try {
    const url = new URL(cloudTransportText(value));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash
      || hostname === "supabase.co" || !hostname.endsWith(".supabase.co")) return "";
    if (url.pathname.replace(/\/+$/, "")) return "";
    return `${url.origin}`;
  } catch { return ""; }
}

function normalizeSupabasePublishableKey(value) {
  const key = cloudTransportText(value);
  return /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key) ? key : "";
}

function normalizeCloudSyncEmail(value) {
  const email = cloudTransportText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : "";
}

function normalizeCloudSyncRedirectUrl(value) {
  try {
    const url = new URL(cloudTransportText(value));
    const hostname = url.hostname.toLowerCase();
    const localHttpHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && localHttpHost))
      || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function normalizeCloudSyncConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const projectUrl = normalizeSupabaseProjectUrl(source.projectUrl);
  const publishableKey = normalizeSupabasePublishableKey(source.publishableKey);
  const email = normalizeCloudSyncEmail(source.email);
  return {
    schemaVersion: CLOUD_SYNC_CONFIG_SCHEMA_VERSION,
    projectUrl,
    publishableKey,
    email,
    ready: Boolean(projectUrl && publishableKey && email),
  };
}

function normalizeCloudSyncSession(value, nowMilliseconds = Date.now()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const accessToken = cloudTransportText(source.accessToken || source.access_token);
  const refreshToken = cloudTransportText(source.refreshToken || source.refresh_token);
  const expiresAt = Number(source.expiresAt);
  const email = normalizeCloudSyncEmail(source.email || source.user?.email);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || expiresAt <= Number(nowMilliseconds) || !email) return null;
  return { schemaVersion: 1, accessToken, refreshToken, expiresAt, email };
}

function createCloudSyncSession(authResponse, email, nowMilliseconds = Date.now()) {
  const source = authResponse && typeof authResponse === "object" && !Array.isArray(authResponse) ? authResponse : {};
  const expiresIn = Math.floor(Number(source.expires_in));
  return normalizeCloudSyncSession({
    accessToken: source.access_token,
    refreshToken: source.refresh_token,
    expiresAt: Number(nowMilliseconds) + expiresIn * 1000,
    email: source.user?.email || email,
  }, nowMilliseconds);
}

function cloudTransportError(status) {
  if (status === 401 || status === 403) return new Error("登录已失效或无权访问，请重新登录。");
  if (status === 429) return new Error("登录邮件或同步请求过于频繁，请稍后再试。");
  if (status >= 500) return new Error("云端暂时不可用，本机记录已保留，可稍后重试。");
  return new Error(`云端请求未通过校验（HTTP ${status}）。`);
}

async function requestSupabaseJson(configValue, path, options = {}) {
  const config = normalizeCloudSyncConfig(configValue);
  if (!config.ready) throw new Error("Supabase 项目配置不完整。");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("当前浏览器不支持云端请求。");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: config.publishableKey,
  };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  let response;
  try {
    response = await fetchImpl(`${config.projectUrl}${path}`, {
      method: options.method || "POST",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("当前无法连接云端，本机记录已保留。");
  }
  if (!response || response.ok !== true) throw cloudTransportError(Number(response && response.status) || 0);
  if (Number(response.status) === 204) return null;
  try { return await response.json(); } catch { return null; }
}

function requestSupabaseMagicLink(config, email, redirectTo, fetchImpl) {
  const normalizedEmail = normalizeCloudSyncEmail(email);
  const normalizedRedirect = normalizeCloudSyncRedirectUrl(redirectTo);
  if (!normalizedEmail) return Promise.reject(new Error("请输入有效邮箱。"));
  if (!normalizedRedirect) return Promise.reject(new Error("当前页面地址不能接收登录链接，请使用 HTTPS 页面。"));
  return requestSupabaseJson(config, `/auth/v1/otp?redirect_to=${encodeURIComponent(normalizedRedirect)}`, {
    fetchImpl,
    body: { email: normalizedEmail, create_user: true },
  });
}

function hasSupabaseMagicLinkCallback(value) {
  try {
    const url = new URL(cloudTransportText(value));
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    return params.has("access_token") || params.has("refresh_token") || params.has("error") || params.has("error_description");
  } catch { return false; }
}

function cleanSupabaseMagicLinkCallbackUrl(value) {
  try {
    const url = new URL(cloudTransportText(value));
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function parseSupabaseMagicLinkSession(value, email, nowMilliseconds = Date.now()) {
  let url;
  try { url = new URL(cloudTransportText(value)); } catch { throw new Error("登录链接地址无效，请重新发送登录链接。"); }
  const params = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (params.has("error") || params.has("error_description")) {
    throw new Error("登录链接无效或已过期，请重新发送登录链接。");
  }
  const accessToken = cloudTransportText(params.get("access_token"));
  const refreshToken = cloudTransportText(params.get("refresh_token"));
  const normalizedEmail = normalizeCloudSyncEmail(email);
  const expiresAtSeconds = Number(params.get("expires_at"));
  const expiresInSeconds = Math.floor(Number(params.get("expires_in")));
  const expiresAt = Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0
    ? expiresAtSeconds * 1000
    : Number(nowMilliseconds) + expiresInSeconds * 1000;
  const session = normalizeCloudSyncSession({ accessToken, refreshToken, expiresAt, email: normalizedEmail }, nowMilliseconds);
  if (!session) throw new Error("登录链接缺少有效会话，请重新发送登录链接。");
  return { session, cleanUrl: cleanSupabaseMagicLinkCallbackUrl(url.href) };
}

async function refreshSupabaseCloudSession(config, refreshToken, fetchImpl, nowMilliseconds = Date.now()) {
  const token = cloudTransportText(refreshToken);
  if (!token) throw new Error("当前登录已过期，请重新发送登录链接。");
  const response = await requestSupabaseJson(config, "/auth/v1/token?grant_type=refresh_token", {
    fetchImpl,
    body: { refresh_token: token },
  });
  const session = createCloudSyncSession(response, normalizeCloudSyncConfig(config).email, nowMilliseconds);
  if (!session) throw new Error("登录续期失败，请重新发送登录链接。");
  return session;
}

function fetchSupabaseSyncDocuments(config, accessToken, fetchImpl) {
  return requestSupabaseJson(config,
    "/rest/v1/study_sync_documents?select=document_key,payload,content_fingerprint,revision,updated_at&order=document_key.asc",
    { fetchImpl, accessToken, method: "GET" });
}

function invokeSupabaseSyncOperation(config, accessToken, operation, fetchImpl) {
  return requestSupabaseJson(config, "/rest/v1/rpc/apply_study_sync_operation", {
    fetchImpl,
    accessToken,
    body: { operation },
  });
}

async function signOutSupabaseCloudSession(config, accessToken, fetchImpl) {
  if (!cloudTransportText(accessToken)) return null;
  return requestSupabaseJson(config, "/auth/v1/logout", { fetchImpl, accessToken });
}
