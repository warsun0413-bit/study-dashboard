// Browser adapter for the offline-first outbox. Cloud transport is optional and separately authenticated.
const offlineSyncOutboxKey = "studySyncOutbox";
const offlineSyncDeviceKey = "studySyncDevice";
const offlineSyncMetaKey = "studySyncMeta";
let offlineSyncCaptureEnabled = false;
let deferredOfflineInstallPrompt = null;

function createOfflineSyncDeviceId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return `device-${globalThis.crypto.randomUUID()}`;
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readOfflineSyncDevice() {
  const stored = readJson(offlineSyncDeviceKey, null);
  if (stored && stored.schemaVersion === 1 && String(stored.deviceId || "").trim()) return stored;
  const device = { schemaVersion: 1, deviceId: createOfflineSyncDeviceId(), createdAt: new Date().toISOString() };
  localStorage.setItem(offlineSyncDeviceKey, JSON.stringify(device));
  return device;
}

function readOfflineSyncOutbox() {
  return normalizeOfflineSyncQueue(readJson(offlineSyncOutboxKey, []));
}

function readOfflineSyncMeta() {
  const stored = readJson(offlineSyncMetaKey, null);
  return stored && stored.schemaVersion === 1 && stored.documents && typeof stored.documents === "object"
    ? stored : { schemaVersion: 1, documents: {}, lastPullCursor: "", updatedAt: "" };
}

function getOfflineSyncRemoteRevision(key) {
  const revision = Number(readOfflineSyncMeta().documents[String(key || "")]?.remoteRevision);
  return Number.isInteger(revision) && revision > 0 ? revision : 0;
}

function captureOfflineSyncWrite(key, beforeValue, afterValue) {
  if (!offlineSyncCaptureEnabled) return false;
  const result = enqueueOfflineSyncMutation(readOfflineSyncOutbox(), {
    key,
    beforeValue,
    afterValue,
    deviceId: readOfflineSyncDevice().deviceId,
    baseRemoteRevision: getOfflineSyncRemoteRevision(key),
    now: new Date().toISOString(),
  });
  if (!result.changed) return false;
  localStorage.setItem(offlineSyncOutboxKey, JSON.stringify(result.queue));
  renderOfflineSyncStatus();
  if (typeof scheduleCloudSyncAfterLocalChange === "function") scheduleCloudSyncAfterLocalChange();
  return true;
}

function captureOfflineSyncTransaction(changes) {
  if (!offlineSyncCaptureEnabled || !Array.isArray(changes)) return 0;
  let queue = readOfflineSyncOutbox();
  let changedCount = 0;
  const deviceId = readOfflineSyncDevice().deviceId;
  const meta = readOfflineSyncMeta();
  changes.forEach((change) => {
    const result = enqueueOfflineSyncMutation(queue, {
      key: change && change.key,
      beforeValue: change && change.beforeValue,
      afterValue: change && change.afterValue,
      deviceId,
      baseRemoteRevision: Math.max(0, Math.floor(Number(meta.documents?.[change && change.key]?.remoteRevision) || 0)),
      now: new Date().toISOString(),
    });
    queue = result.queue;
    if (result.changed) changedCount += 1;
  });
  if (changedCount) localStorage.setItem(offlineSyncOutboxKey, JSON.stringify(queue));
  renderOfflineSyncStatus();
  if (changedCount && typeof scheduleCloudSyncAfterLocalChange === "function") scheduleCloudSyncAfterLocalChange();
  return changedCount;
}

function getOfflineConnectionState() {
  return typeof navigator === "undefined" || navigator.onLine !== false ? "online" : "offline";
}

async function readOfflineStorageProtection() {
  if (!navigator.storage || typeof navigator.storage.persisted !== "function") return "unsupported";
  try { return await navigator.storage.persisted() ? "persistent" : "best-effort"; } catch { return "unknown"; }
}

async function renderOfflineSyncStatus() {
  const container = document.querySelector("#offlineSyncStatus");
  const detail = document.querySelector("#offlineSyncDetail");
  const uploadButton = document.querySelector("#uploadOfflineSyncBtn");
  const protectButton = document.querySelector("#protectOfflineStorageBtn");
  if (!container || !detail || !uploadButton || !protectButton) return;
  const summary = summarizeOfflineSyncQueue(readOfflineSyncOutbox());
  const connection = getOfflineConnectionState();
  const protection = await readOfflineStorageProtection();
  const cloud = typeof getCloudSyncUiState === "function" ? getCloudSyncUiState() : { configReady: false, signedIn: false, syncing: false };
  container.dataset.connection = connection;
  container.textContent = connection === "offline" ? `离线可记录 · 待上传 ${summary.total} 项` : `本机记录正常 · 待上传 ${summary.total} 项`;
  const protectionText = protection === "persistent" ? "本机持久存储已保护"
    : protection === "best-effort" ? "建议启用本机存储保护" : "浏览器按本机规则保存";
  const cloudText = cloud.signedIn ? `已登录 ${cloud.email || "云端账户"}`
    : cloud.configReady ? "云端已配置，等待邮箱登录" : "云端尚未配置，不会上传数据";
  detail.textContent = `${protectionText}；${cloudText}。`;
  protectButton.hidden = protection === "persistent" || protection === "unsupported";
  uploadButton.disabled = connection === "offline" || cloud.syncing;
  uploadButton.textContent = cloud.signedIn ? (cloud.syncing ? "同步中…" : `立即同步${summary.total ? `（${summary.total}）` : ""}`) : "连接云端";
  if (typeof renderCloudSyncControls === "function") renderCloudSyncControls();
}

async function requestOfflineStorageProtection() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    setStatus("#offlineSyncActionStatus", "当前浏览器不支持主动申请持久存储，请保留完整JSON备份。", true);
    return false;
  }
  try {
    const granted = await navigator.storage.persist();
    setStatus("#offlineSyncActionStatus", granted ? "本机离线存储保护已启用。" : "浏览器未授予持久存储；记录仍保存在本机，请定期备份。", !granted);
    await renderOfflineSyncStatus();
    return granted;
  } catch (error) {
    setStatus("#offlineSyncActionStatus", error.message || "无法申请本机存储保护。", true);
    return false;
  }
}

async function installOfflineDashboard() {
  if (!deferredOfflineInstallPrompt) {
    const isIPad = /iPad/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1);
    setStatus("#offlineSyncActionStatus", isIPad
      ? "请在 Safari 点“分享”按钮，再选择“添加到主屏幕”。"
      : "请用浏览器菜单选择“安装应用”或“添加到主屏幕”。");
    return false;
  }
  deferredOfflineInstallPrompt.prompt();
  const choice = await deferredOfflineInstallPrompt.userChoice;
  deferredOfflineInstallPrompt = null;
  document.querySelector("#installOfflineDashboardBtn").hidden = true;
  setStatus("#offlineSyncActionStatus", choice.outcome === "accepted" ? "学习面板已加入安装流程。" : "已取消安装，仍可继续在浏览器使用。", choice.outcome !== "accepted");
  return choice.outcome === "accepted";
}

function initOfflineSync() {
  readOfflineSyncDevice();
  offlineSyncCaptureEnabled = true;
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
  if (isStandalone) document.querySelector("#installOfflineDashboardBtn").hidden = true;
  document.querySelector("#protectOfflineStorageBtn").addEventListener("click", requestOfflineStorageProtection);
  document.querySelector("#installOfflineDashboardBtn").addEventListener("click", installOfflineDashboard);
  window.addEventListener("online", renderOfflineSyncStatus);
  window.addEventListener("offline", renderOfflineSyncStatus);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredOfflineInstallPrompt = event;
    document.querySelector("#installOfflineDashboardBtn").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredOfflineInstallPrompt = null;
    document.querySelector("#installOfflineDashboardBtn").hidden = true;
  });
  renderOfflineSyncStatus();
}
