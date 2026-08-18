import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const coreSource = fs.readFileSync(new URL("../js/offline-sync-core.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(`${coreSource}\nglobalThis.core = {
  OFFLINE_SYNC_CAPTURE_KEYS, isOfflineSyncCaptureKey, offlineSyncFingerprint,
  normalizeOfflineSyncQueue, enqueueOfflineSyncMutation, buildOfflineSyncUploadBatch,
  summarizeOfflineSyncQueue
};`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));

function mutation(overrides = {}) {
  return {
    key: "review-history",
    beforeValue: "[]",
    afterValue: '[{"date":"2026-08-18"}]',
    deviceId: "device-ipad-test",
    now: "2026-08-18T08:00:00.000Z",
    ...overrides,
  };
}

test("sync capture is restricted to durable learning data", () => {
  assert.equal(core.isOfflineSyncCaptureKey("review-history"), true);
  assert.equal(core.isOfflineSyncCaptureKey("studyWeeklyImprovementRecords"), true);
  assert.equal(core.isOfflineSyncCaptureKey("studyFocusTimerState"), false);
  assert.equal(core.isOfflineSyncCaptureKey("studyUiPreferences"), false);
  assert.equal(core.isOfflineSyncCaptureKey("studyMigrationRollback"), false);
  assert.equal(new Set(plain(core.OFFLINE_SYNC_CAPTURE_KEYS)).size, core.OFFLINE_SYNC_CAPTURE_KEYS.length);
});

test("a durable write creates one pending idempotent operation without mutating input", () => {
  const queue = [];
  const before = JSON.stringify(queue);
  const result = plain(core.enqueueOfflineSyncMutation(queue, mutation()));
  assert.equal(JSON.stringify(queue), before);
  assert.equal(result.changed, true);
  assert.equal(result.reason, "queued");
  assert.equal(result.queue.length, 1);
  assert.equal(result.operation.status, "pending");
  assert.equal(result.operation.kind, "replace-key");
  assert.equal(result.operation.baseFingerprint, core.offlineSyncFingerprint("[]"));
  assert.equal(result.operation.baseRemoteRevision, 0);
  assert.equal(result.operation.contentFingerprint, core.offlineSyncFingerprint(mutation().afterValue));
  assert.match(result.operation.operationId, /^device-ipad-test:/);
});

test("repeated writes to one key coalesce to the latest payload and preserve the original base", () => {
  const first = plain(core.enqueueOfflineSyncMutation([], mutation({ baseRemoteRevision: 4 })));
  const second = plain(core.enqueueOfflineSyncMutation(first.queue, mutation({
    beforeValue: mutation().afterValue,
    afterValue: '[{"date":"2026-08-18"},{"date":"2026-08-19"}]',
    now: "2026-08-18T09:00:00.000Z",
  })));
  assert.equal(second.reason, "coalesced");
  assert.equal(second.queue.length, 1);
  assert.equal(second.operation.localRevision, 2);
  assert.equal(second.operation.createdAt, "2026-08-18T08:00:00.000Z");
  assert.equal(second.operation.updatedAt, "2026-08-18T09:00:00.000Z");
  assert.equal(second.operation.baseFingerprint, first.operation.baseFingerprint);
  assert.equal(second.operation.baseRemoteRevision, 4);
});

test("unchanged untracked and invalid writes never enter the outbox", () => {
  assert.equal(core.enqueueOfflineSyncMutation([], mutation({ afterValue: "[]" })).changed, false);
  assert.equal(core.enqueueOfflineSyncMutation([], mutation({ key: "studyFocusTimerState" })).reason, "not-syncable");
  assert.equal(core.enqueueOfflineSyncMutation([], mutation({ deviceId: "" })).reason, "invalid-metadata");
});

test("normalization fails closed and keeps only the latest valid operation per key", () => {
  const first = plain(core.enqueueOfflineSyncMutation([], mutation())).operation;
  const second = plain(core.enqueueOfflineSyncMutation([first], mutation({
    afterValue: '[{"date":"2026-08-19"}]',
    now: "2026-08-18T10:00:00.000Z",
  }))).operation;
  const normalized = plain(core.normalizeOfflineSyncQueue([
    null,
    { key: "review-history", payload: "malformed" },
    first,
    second,
    { ...second, key: "studyFocusTimerState" },
  ]));
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].operationId, second.operationId);
});

test("upload batches are cloned bounded pending operations and leave conflicts queued", () => {
  const history = plain(core.enqueueOfflineSyncMutation([], mutation())).operation;
  const plans = plain(core.enqueueOfflineSyncMutation([history], mutation({
    key: "studyDailyPlans", beforeValue: "{}", afterValue: '{"2026-08-18":{}}', now: "2026-08-18T09:00:00.000Z",
  }))).operation;
  const conflict = { ...plans, status: "conflict" };
  const queue = [history, conflict];
  const batch = plain(core.buildOfflineSyncUploadBatch(queue, 1));
  assert.equal(batch.length, 1);
  assert.equal(batch[0].key, "review-history");
  batch[0].payload = "changed";
  assert.notEqual(queue[0].payload, "changed");
  assert.deepEqual(plain(core.summarizeOfflineSyncQueue(queue)), {
    total: 2, pending: 1, uploading: 0, conflict: 1, keys: ["review-history", "studyDailyPlans"],
  });
});

test("page manifest storage hook and cache expose the iPad offline-first foundation", () => {
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const storage = fs.readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");
  const migrations = fs.readFileSync(new URL("../js/migrations.js", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const style = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /id="offlineSyncStatus"/);
  assert.match(index, /安装到 iPad/);
  assert.match(index, /offline-sync-core\.js\?v=magic-link-v158[\s\S]*cloud-sync-core\.js\?v=magic-link-v158[\s\S]*cloud-sync-transport\.js\?v=magic-link-v158[\s\S]*storage\.js\?v=offline-sync-v155/);
  assert.match(index, /offline-sync\.js\?v=magic-link-v158[\s\S]*cloud-sync\.js\?v=magic-link-v158[\s\S]*app\.js\?v=magic-link-v158/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons[0].src, "./study-dashboard-icon.svg");
  assert.match(worker, /study-dashboard-magic-link-v158/);
  assert.match(worker, /offline-sync-core\.js\?v=magic-link-v158/);
  assert.match(worker, /cloud-sync-core\.js\?v=magic-link-v158/);
  assert.match(worker, /cloud-sync-transport\.js\?v=magic-link-v158/);
  assert.match(worker, /offline-sync\.js\?v=magic-link-v158/);
  assert.match(worker, /cloud-sync\.js\?v=magic-link-v158/);
  assert.match(storage, /captureOfflineSyncWrite\(key, beforeValue, afterValue\)/);
  assert.match(migrations, /captureOfflineSyncTransaction\(changes\)/);
  assert.match(app, /initOfflineSync\(\)[\s\S]*initCloudSync\(\)/);
  assert.match(style, /@media \(max-width: 900px\)[\s\S]*\.button \{ min-height: 44px; \}[\s\S]*font-size: 16px/);
  const safety = fs.readFileSync(new URL("../js/data-safety.js", import.meta.url), "utf8");
  assert.match(safety, /deviceLocalSyncKeys = new Set\(\["studySyncDevice", "studySyncOutbox", "studySyncMeta", "studyCloudSyncConfig"\]\)/);
  assert.match(safety, /restorableEntries = entries\.filter/);
});

test("browser adapter captures only post-initialization learning writes in isolated storage", () => {
  const storageSource = fs.readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");
  const adapterSource = fs.readFileSync(new URL("../js/offline-sync.js", import.meta.url), "utf8");
  const values = new Map();
  const localStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
  const browserContext = {
    console,
    localStorage,
    document: { querySelectorAll: () => [], querySelector: () => null },
    navigator: { onLine: false },
    window: { addEventListener() {} },
    setStatus() {},
    Math,
    Date,
  };
  vm.createContext(browserContext);
  vm.runInContext(`${coreSource}\n${storageSource}\n${adapterSource}\nwriteJson("review-history", []);
    offlineSyncCaptureEnabled = true;
    writeJson("review-history", [{ date: "2026-08-18" }]);
    writeJson("studyFocusTimerState", { running: true });
    captureOfflineSyncTransaction([{ key: "studyDailyPlans", beforeValue: "{}", afterValue: "{\\"2026-08-18\\":{}}" }]);
    globalThis.result = { queue: readOfflineSyncOutbox(), device: readOfflineSyncDevice() };`, browserContext);
  const result = plain(browserContext.result);
  assert.equal(result.queue.length, 2);
  assert.deepEqual(result.queue.map((item) => item.key).sort(), ["review-history", "studyDailyPlans"]);
  assert.equal(result.queue.some((item) => item.key === "studyFocusTimerState"), false);
  assert.match(result.device.deviceId, /^device-/);
  assert.equal(JSON.parse(localStorage.getItem("review-history")).length, 1);
});

test("service worker serves the cached dashboard when an iPad navigation is offline", async () => {
  const workerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const listeners = {};
  const workerContext = {
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
  vm.createContext(workerContext);
  vm.runInContext(workerSource, workerContext);
  let responsePromise = null;
  listeners.fetch({
    request: { method: "GET", url: "https://study.example/today", mode: "navigate" },
    respondWith(value) { responsePromise = value; },
  });
  assert.equal(await responsePromise, "cached-dashboard");
});
