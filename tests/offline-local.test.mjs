import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("page keeps local offline protection and removes all cloud synchronization controls", () => {
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const storage = fs.readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");
  const migrations = fs.readFileSync(new URL("../js/migrations.js", import.meta.url), "utf8");
  const safety = fs.readFileSync(new URL("../js/data-safety.js", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /id="offlineStorageStatus"/);
  assert.match(index, /保护本机记录/);
  assert.match(index, /安装到 iPad/);
  assert.match(index, /跨设备请使用完整 JSON 备份与恢复/);
  assert.match(index, /offline-local\.js\?v=local-offline-v159[\s\S]*app\.js\?v=local-offline-v159/);
  assert.doesNotMatch(index, /cloudSync|连接云端|云端同步设置|Supabase|Magic Link|待上传/);
  assert.doesNotMatch(worker, /cloud-sync|offline-sync-core|supabase-sync-schema|magic-link-v158/);
  assert.match(worker, /study-dashboard-local-offline-v159/);
  assert.match(worker, /offline-local\.js\?v=local-offline-v159/);
  assert.match(app, /initOfflineStorage\(\)/);
  assert.doesNotMatch(app, /initCloudSync|initOfflineSync/);
  assert.doesNotMatch(storage, /captureOfflineSync|skipSyncCapture/);
  assert.doesNotMatch(migrations, /captureOfflineSync/);
  assert.match(safety, /deviceLocalSyncKeys = new Set\(\["studySyncDevice", "studySyncOutbox", "studySyncMeta", "studyCloudSyncConfig"\]\)/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons[0].src, "./study-dashboard-icon.svg");
});

test("local offline adapter reports storage state without creating upload metadata", async () => {
  const source = fs.readFileSync(new URL("../js/offline-local.js", import.meta.url), "utf8");
  const elements = new Map([
    ["#offlineStorageStatus", { dataset: {}, textContent: "" }],
    ["#offlineStorageDetail", { textContent: "" }],
    ["#protectOfflineStorageBtn", { hidden: false, addEventListener() {} }],
    ["#installOfflineDashboardBtn", { hidden: false, addEventListener() {} }],
  ]);
  const localStorage = {
    length: 0,
    getItem() { return null; },
    setItem() { throw new Error("local-only status must not write"); },
  };
  const context = {
    console,
    localStorage,
    navigator: {
      onLine: false,
      standalone: false,
      userAgent: "iPad",
      platform: "MacIntel",
      maxTouchPoints: 5,
      storage: { persisted: async () => true },
    },
    document: { querySelector: (selector) => elements.get(selector) || null },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    setStatus() {},
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nrenderOfflineStorageStatus().then(() => { globalThis.done = true; });`, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.done, true);
  assert.equal(elements.get("#offlineStorageStatus").textContent, "离线可记录");
  assert.match(elements.get("#offlineStorageDetail").textContent, /持久存储已保护/);
  assert.equal(elements.get("#protectOfflineStorageBtn").hidden, true);
});

test("service worker serves the cached dashboard when an iPad navigation is offline", async () => {
  const source = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const listeners = {};
  const context = {
    URL,
    Promise,
    self: {
      location: { origin: "https://study.example" },
      addEventListener(type, listener) { listeners[type] = listener; },
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: {
      match: async (key) => key === "./index.html" ? "cached-dashboard" : null,
      open: async () => ({ addAll: async () => {} }),
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => { throw new Error("offline"); },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  let responsePromise = null;
  listeners.fetch({
    request: { method: "GET", url: "https://study.example/today", mode: "navigate" },
    respondWith(value) { responsePromise = value; },
  });
  assert.equal(await responsePromise, "cached-dashboard");
});
