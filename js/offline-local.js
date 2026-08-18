// Local-only offline storage and install helpers. No cloud transport or upload queue.
let deferredOfflineInstallPrompt = null;

function getOfflineConnectionState() {
  return typeof navigator === "undefined" || navigator.onLine !== false ? "online" : "offline";
}

async function readOfflineStorageProtection() {
  if (!navigator.storage || typeof navigator.storage.persisted !== "function") return "unsupported";
  try { return await navigator.storage.persisted() ? "persistent" : "best-effort"; } catch { return "unknown"; }
}

async function renderOfflineStorageStatus() {
  const container = document.querySelector("#offlineStorageStatus");
  const detail = document.querySelector("#offlineStorageDetail");
  const protectButton = document.querySelector("#protectOfflineStorageBtn");
  if (!container || !detail || !protectButton) return;
  const connection = getOfflineConnectionState();
  const protection = await readOfflineStorageProtection();
  container.dataset.connection = connection;
  container.textContent = connection === "offline" ? "离线可记录" : "本机记录正常";
  const protectionText = protection === "persistent" ? "本机持久存储已保护"
    : protection === "best-effort" ? "建议启用本机存储保护" : "浏览器按本机规则保存";
  detail.textContent = `${protectionText}；跨设备请使用完整 JSON 备份与恢复。`;
  protectButton.hidden = protection === "persistent" || protection === "unsupported";
}

async function requestOfflineStorageProtection() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    setStatus("#offlineStorageActionStatus", "当前浏览器不支持主动申请持久存储，请保留完整 JSON 备份。", true);
    return false;
  }
  try {
    const granted = await navigator.storage.persist();
    setStatus("#offlineStorageActionStatus", granted ? "本机离线存储保护已启用。" : "浏览器未授予持久存储；记录仍保存在本机，请定期备份。", !granted);
    await renderOfflineStorageStatus();
    return granted;
  } catch (error) {
    setStatus("#offlineStorageActionStatus", error.message || "无法申请本机存储保护。", true);
    return false;
  }
}

async function installOfflineDashboard() {
  if (!deferredOfflineInstallPrompt) {
    const isIPad = /iPad/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1);
    setStatus("#offlineStorageActionStatus", isIPad
      ? "请在 Safari 点“分享”按钮，再选择“添加到主屏幕”。"
      : "请用浏览器菜单选择“安装应用”或“添加到主屏幕”。");
    return false;
  }
  deferredOfflineInstallPrompt.prompt();
  const choice = await deferredOfflineInstallPrompt.userChoice;
  deferredOfflineInstallPrompt = null;
  document.querySelector("#installOfflineDashboardBtn").hidden = true;
  setStatus("#offlineStorageActionStatus", choice.outcome === "accepted" ? "学习面板已加入安装流程。" : "已取消安装，仍可继续在浏览器使用。", choice.outcome !== "accepted");
  return choice.outcome === "accepted";
}

function initOfflineStorage() {
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
  if (isStandalone) document.querySelector("#installOfflineDashboardBtn").hidden = true;
  document.querySelector("#protectOfflineStorageBtn").addEventListener("click", requestOfflineStorageProtection);
  document.querySelector("#installOfflineDashboardBtn").addEventListener("click", installOfflineDashboard);
  window.addEventListener("online", renderOfflineStorageStatus);
  window.addEventListener("offline", renderOfflineStorageStatus);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredOfflineInstallPrompt = event;
    document.querySelector("#installOfflineDashboardBtn").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredOfflineInstallPrompt = null;
    document.querySelector("#installOfflineDashboardBtn").hidden = true;
  });
  renderOfflineStorageStatus();
}
