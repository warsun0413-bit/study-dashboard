// Browser runtime for authenticated Supabase synchronization.
const cloudSyncConfigKey = "studyCloudSyncConfig";
const cloudSyncSessionKey = "studyCloudSyncSession";
let cloudSyncInFlight = false;
let cloudSyncTimerId = null;
let cloudSyncBootstrapDocuments = [];
let cloudSyncLastSummary = "";

function readCloudSyncConfig() {
  return normalizeCloudSyncConfig(readJson(cloudSyncConfigKey, null));
}

function writeCloudSyncConfig(configValue) {
  const config = normalizeCloudSyncConfig(configValue);
  if (!config.ready) throw new Error("请填写有效的 Supabase 项目地址、Publishable key 和邮箱。");
  localStorage.setItem(cloudSyncConfigKey, JSON.stringify({
    schemaVersion: config.schemaVersion,
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    email: config.email,
  }));
  return config;
}

function readCloudSyncSessionRaw() {
  try { return JSON.parse(sessionStorage.getItem(cloudSyncSessionKey) || "null"); } catch { return null; }
}

function readCloudSyncSession() {
  return normalizeCloudSyncSession(readCloudSyncSessionRaw());
}

function hasCloudSyncSession() {
  return Boolean(normalizeCloudSyncSession(readCloudSyncSessionRaw(), 0));
}

function writeCloudSyncSession(session) {
  const normalized = normalizeCloudSyncSession(session);
  if (!normalized) throw new Error("登录会话无效。");
  sessionStorage.setItem(cloudSyncSessionKey, JSON.stringify(normalized));
  return normalized;
}

function clearCloudSyncSession() {
  try { sessionStorage.removeItem(cloudSyncSessionKey); } catch {}
}

async function getValidCloudSyncSession() {
  const config = readCloudSyncConfig();
  const raw = normalizeCloudSyncSession(readCloudSyncSessionRaw(), 0);
  if (!config.ready || !raw) throw new Error("请先完成云端配置和邮箱登录。");
  if (raw.expiresAt > Date.now() + 60000) return raw;
  try {
    return writeCloudSyncSession(await refreshSupabaseCloudSession(config, raw.refreshToken));
  } catch (error) {
    clearCloudSyncSession();
    throw error;
  }
}

function getCloudSyncUiState() {
  const config = readCloudSyncConfig();
  const rawSession = normalizeCloudSyncSession(readCloudSyncSessionRaw(), 0);
  return {
    configReady: config.ready,
    signedIn: Boolean(rawSession),
    email: rawSession?.email || config.email,
    syncing: cloudSyncInFlight,
    requiresBootstrap: cloudSyncBootstrapDocuments.length > 0,
    lastSummary: cloudSyncLastSummary,
  };
}

function renderCloudSyncControls() {
  const setup = document.querySelector("#cloudSyncSetup");
  if (!setup) return;
  const config = readCloudSyncConfig();
  const state = getCloudSyncUiState();
  if (setup.dataset.initialized !== "true") {
    document.querySelector("#cloudSyncProjectUrl").value = config.projectUrl;
    document.querySelector("#cloudSyncPublishableKey").value = config.publishableKey;
    document.querySelector("#cloudSyncEmail").value = config.email;
    setup.dataset.initialized = "true";
  }
  document.querySelector("#sendCloudSyncMagicLinkBtn").disabled = !config.ready || state.signedIn || cloudSyncInFlight;
  document.querySelector("#signOutCloudSyncBtn").hidden = !state.signedIn;
  document.querySelector("#initializeCloudDeviceBtn").hidden = !state.requiresBootstrap;
  const uploadButton = document.querySelector("#uploadOfflineSyncBtn");
  uploadButton.disabled = cloudSyncInFlight || getOfflineConnectionState() === "offline";
  uploadButton.textContent = state.signedIn ? (cloudSyncInFlight ? "同步中…" : "立即同步") : "连接云端";
}

function readCloudSyncFormConfig() {
  return {
    projectUrl: document.querySelector("#cloudSyncProjectUrl").value,
    publishableKey: document.querySelector("#cloudSyncPublishableKey").value,
    email: document.querySelector("#cloudSyncEmail").value,
  };
}

function saveCloudSyncFormConfig() {
  const previous = readCloudSyncConfig();
  const config = writeCloudSyncConfig(readCloudSyncFormConfig());
  if (previous.projectUrl !== config.projectUrl || previous.publishableKey !== config.publishableKey || previous.email !== config.email) {
    clearCloudSyncSession();
    cloudSyncBootstrapDocuments = [];
  }
  setStatus("#offlineSyncActionStatus", "云端设备配置已保存；Publishable key 不会进入学习备份。 ");
  renderCloudSyncControls();
  renderOfflineSyncStatus();
  return config;
}

async function sendCloudSyncMagicLink() {
  try {
    const config = saveCloudSyncFormConfig();
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    await requestSupabaseMagicLink(config, config.email, redirectUrl);
    setStatus("#offlineSyncActionStatus", "登录链接已发送。请在同一设备打开邮件并点击链接，返回后会自动登录。 ");
  } catch (error) {
    setStatus("#offlineSyncActionStatus", error.message || "登录链接发送失败。", true);
  }
}

function consumeCloudSyncMagicLinkCallback() {
  const callbackUrl = window.location.href;
  if (!hasSupabaseMagicLinkCallback(callbackUrl)) return false;
  const cleanUrl = cleanSupabaseMagicLinkCallbackUrl(callbackUrl);
  if (cleanUrl) window.history.replaceState(null, document.title, cleanUrl);
  try {
    const config = readCloudSyncConfig();
    if (!config.ready) throw new Error("本设备尚未保存云端配置，请重新填写后发送登录链接。");
    const result = parseSupabaseMagicLinkSession(callbackUrl, config.email);
    writeCloudSyncSession(result.session);
    setStatus("#offlineSyncActionStatus", "登录成功，正在核对本机与云端记录。 ");
    return true;
  } catch (error) {
    clearCloudSyncSession();
    setStatus("#offlineSyncActionStatus", error.message || "登录链接验证失败。", true);
    return false;
  }
}

function seedCloudSyncOutboxFromCurrentSnapshot() {
  const snapshot = readRawStorageSnapshot();
  const deviceId = readOfflineSyncDevice().deviceId;
  let queue = readOfflineSyncOutbox();
  let seeded = 0;
  OFFLINE_SYNC_CAPTURE_KEYS.forEach((key) => {
    if (typeof snapshot[key] !== "string") return;
    const result = enqueueOfflineSyncMutation(queue, {
      key,
      beforeValue: null,
      afterValue: snapshot[key],
      deviceId,
      baseRemoteRevision: 0,
      now: new Date().toISOString(),
    });
    queue = result.queue;
    if (result.changed) seeded += 1;
  });
  if (seeded) localStorage.setItem(offlineSyncOutboxKey, JSON.stringify(queue));
  return seeded;
}

function writeCloudSyncReconciliation(reconciliation) {
  localStorage.setItem(offlineSyncOutboxKey, JSON.stringify(reconciliation.queue));
  localStorage.setItem(offlineSyncMetaKey, JSON.stringify(reconciliation.meta));
}

function refreshDashboardAfterCloudPull() {
  if (typeof renderTasks === "function") renderTasks();
  if (typeof loadReviewFields === "function") loadReviewFields();
  if (typeof renderDueReviews === "function") renderDueReviews();
  if (typeof renderManualStudyRecords === "function") renderManualStudyRecords();
  if (typeof renderStudyTimeSummary === "function") renderStudyTimeSummary();
  if (typeof renderHistory === "function") renderHistory();
  if (typeof renderRecentSevenDays === "function") renderRecentSevenDays();
  if (typeof renderExamStatsConfig === "function") renderExamStatsConfig();
  if (typeof renderExamStatsOverview === "function") renderExamStatsOverview();
  if (typeof renderAdmissionReadiness === "function") renderAdmissionReadiness();
  if (typeof renderWeeklyImprovement === "function") renderWeeklyImprovement();
}

function applySafeCloudPull(plan) {
  if (!plan.changes.length) return 0;
  if (typeof isExecutionSurfaceFocusProtected === "function" && isExecutionSurfaceFocusProtected()) {
    throw new Error("当前正在专注计时，云端下载已延后；暂停或完成本轮后再同步。");
  }
  const targetSnapshot = { ...readRawStorageSnapshot() };
  plan.changes.forEach((change) => { targetSnapshot[change.key] = change.afterValue; });
  const previousCapture = offlineSyncCaptureEnabled;
  offlineSyncCaptureEnabled = false;
  try {
    applyStorageSnapshotTransaction(targetSnapshot, "cloud-sync-pull-v1", false);
  } finally {
    offlineSyncCaptureEnabled = previousCapture;
  }
  const meta = normalizeCloudSyncMeta(readOfflineSyncMeta());
  const syncedAt = new Date().toISOString();
  plan.changes.forEach((change) => {
    meta.documents[change.key] = {
      remoteRevision: change.remoteRevision,
      remoteFingerprint: change.remoteFingerprint,
      localFingerprint: change.localFingerprint,
      syncedAt,
    };
  });
  meta.updatedAt = syncedAt;
  localStorage.setItem(offlineSyncMetaKey, JSON.stringify(meta));
  refreshDashboardAfterCloudPull();
  return plan.changes.length;
}

async function runCloudSyncNow(options = {}) {
  if (cloudSyncInFlight) return false;
  if (getOfflineConnectionState() === "offline") {
    setStatus("#offlineSyncActionStatus", "当前离线，记录已留在本机，联网后再上传。 ");
    return false;
  }
  const config = readCloudSyncConfig();
  if (!config.ready || !hasCloudSyncSession()) {
    document.querySelector("#cloudSyncSetup").open = true;
    setStatus("#offlineSyncActionStatus", "请先保存 Supabase 配置并用邮箱登录链接登录。 ");
    return false;
  }
  cloudSyncInFlight = true;
  cloudSyncLastSummary = "";
  renderCloudSyncControls();
  await renderOfflineSyncStatus();
  try {
    const session = await getValidCloudSyncSession();
    const remoteBefore = await fetchSupabaseSyncDocuments(config, session.accessToken);
    const remoteDocuments = Array.isArray(remoteBefore) ? remoteBefore : [];
    const meta = normalizeCloudSyncMeta(readOfflineSyncMeta());
    if (!Object.keys(meta.documents).length && remoteDocuments.length) {
      cloudSyncBootstrapDocuments = remoteDocuments.map(normalizeCloudSyncDocument).filter(Boolean);
      cloudSyncLastSummary = `云端已有 ${cloudSyncBootstrapDocuments.length} 个记录字段，需先确认初始化本设备。`;
      setStatus("#offlineSyncActionStatus", cloudSyncLastSummary, true);
      return false;
    }
    cloudSyncBootstrapDocuments = [];
    if (!remoteDocuments.length && !Object.keys(meta.documents).length) seedCloudSyncOutboxFromCurrentSnapshot();

    const uploadQueueSnapshot = readOfflineSyncOutbox();
    const request = buildCloudSyncUploadRequest(uploadQueueSnapshot, readOfflineSyncDevice(), { pullCursor: meta.lastPullCursor });
    const results = [];
    for (const operation of request.operations) {
      try {
        results.push(await invokeSupabaseSyncOperation(config, session.accessToken, operation));
      } catch (error) {
        results.push({
          operationId: operation.operationId, key: operation.key, status: "retryable-error",
          remoteRevision: operation.baseRemoteRevision, remoteFingerprint: "", message: error.message,
        });
      }
    }
    const reconciliation = reconcileCloudSyncUploadResults(
      readOfflineSyncOutbox(), readOfflineSyncMeta(), results, new Date().toISOString(), uploadQueueSnapshot,
    );
    writeCloudSyncReconciliation(reconciliation);
    const remoteAfter = await fetchSupabaseSyncDocuments(config, session.accessToken);
    const plan = planCloudSyncPull(readRawStorageSnapshot(), Array.isArray(remoteAfter) ? remoteAfter : [], reconciliation.queue, reconciliation.meta);
    const pulled = applySafeCloudPull(plan);
    const pending = summarizeOfflineSyncQueue(readOfflineSyncOutbox());
    cloudSyncLastSummary = `上传 ${reconciliation.applied.length} 项 · 下载 ${pulled} 项 · 待处理 ${pending.total} 项`;
    if (reconciliation.conflicts.length || plan.conflicts.length) {
      cloudSyncLastSummary += ` · 冲突 ${reconciliation.conflicts.length + plan.conflicts.length} 项`;
    }
    setStatus("#offlineSyncActionStatus", cloudSyncLastSummary, Boolean(reconciliation.conflicts.length || plan.conflicts.length));
    return true;
  } catch (error) {
    cloudSyncLastSummary = error.message || "同步失败，本机记录已保留。";
    setStatus("#offlineSyncActionStatus", cloudSyncLastSummary, true);
    return false;
  } finally {
    cloudSyncInFlight = false;
    renderCloudSyncControls();
    renderOfflineSyncStatus();
  }
}

async function initializeCloudDeviceFromRemote() {
  if (!cloudSyncBootstrapDocuments.length) return false;
  const pending = summarizeOfflineSyncQueue(readOfflineSyncOutbox());
  const warning = `将先下载完整 JSON 备份，再用云端替换本设备 ${cloudSyncBootstrapDocuments.length} 个同步字段。`
    + (pending.total ? ` 本机还有 ${pending.total} 项待上传修改；与云端同字段的修改会被保留在备份中但不再上传。` : "")
    + " 是否继续？";
  if (!window.confirm(warning)) return false;
  downloadJsonBackup();
  const targetSnapshot = { ...readRawStorageSnapshot() };
  cloudSyncBootstrapDocuments.forEach((document) => { targetSnapshot[document.key] = document.payload; });
  const previousCapture = offlineSyncCaptureEnabled;
  offlineSyncCaptureEnabled = false;
  try {
    applyStorageSnapshotTransaction(targetSnapshot, "cloud-sync-device-bootstrap-v1", false);
  } finally {
    offlineSyncCaptureEnabled = previousCapture;
  }
  const remoteKeys = new Set(cloudSyncBootstrapDocuments.map((document) => document.key));
  const nextQueue = readOfflineSyncOutbox().filter((operation) => !remoteKeys.has(operation.key));
  const meta = normalizeCloudSyncMeta({});
  const syncedAt = new Date().toISOString();
  cloudSyncBootstrapDocuments.forEach((document) => {
    meta.documents[document.key] = {
      remoteRevision: document.remoteRevision,
      remoteFingerprint: document.remoteFingerprint,
      localFingerprint: offlineSyncFingerprint(document.payload),
      syncedAt,
    };
  });
  meta.updatedAt = syncedAt;
  localStorage.setItem(offlineSyncOutboxKey, JSON.stringify(nextQueue));
  localStorage.setItem(offlineSyncMetaKey, JSON.stringify(meta));
  cloudSyncBootstrapDocuments = [];
  cloudSyncLastSummary = "本设备已从云端完成初始化。";
  refreshDashboardAfterCloudPull();
  renderCloudSyncControls();
  renderOfflineSyncStatus();
  setStatus("#offlineSyncActionStatus", cloudSyncLastSummary);
  scheduleCloudSyncAfterLocalChange(300);
  return true;
}

async function signOutCloudSync() {
  const config = readCloudSyncConfig();
  const session = normalizeCloudSyncSession(readCloudSyncSessionRaw(), 0);
  clearCloudSyncSession();
  cloudSyncBootstrapDocuments = [];
  renderCloudSyncControls();
  renderOfflineSyncStatus();
  setStatus("#offlineSyncActionStatus", "已退出云端登录；本机记录和待上传队列均保留。 ");
  if (config.ready && session && getOfflineConnectionState() === "online") {
    try { await signOutSupabaseCloudSession(config, session.accessToken); } catch {}
  }
}

function scheduleCloudSyncAfterLocalChange(delay = 1500) {
  if (!readCloudSyncConfig().ready || !hasCloudSyncSession() || getOfflineConnectionState() === "offline") return false;
  if (cloudSyncTimerId !== null) window.clearTimeout(cloudSyncTimerId);
  cloudSyncTimerId = window.setTimeout(() => {
    cloudSyncTimerId = null;
    runCloudSyncNow({ reason: "local-change" });
  }, Math.max(200, Number(delay) || 1500));
  return true;
}

function initCloudSync() {
  const setup = document.querySelector("#cloudSyncSetup");
  if (!setup) return;
  document.querySelector("#saveCloudSyncConfigBtn").addEventListener("click", () => {
    try { saveCloudSyncFormConfig(); } catch (error) { setStatus("#offlineSyncActionStatus", error.message, true); }
  });
  document.querySelector("#sendCloudSyncMagicLinkBtn").addEventListener("click", sendCloudSyncMagicLink);
  document.querySelector("#initializeCloudDeviceBtn").addEventListener("click", initializeCloudDeviceFromRemote);
  document.querySelector("#signOutCloudSyncBtn").addEventListener("click", signOutCloudSync);
  document.querySelector("#uploadOfflineSyncBtn").addEventListener("click", () => {
    if (!readCloudSyncConfig().ready || !hasCloudSyncSession()) setup.open = true;
    runCloudSyncNow({ reason: "manual" });
  });
  window.addEventListener("online", () => scheduleCloudSyncAfterLocalChange(500));
  const signedInFromLink = consumeCloudSyncMagicLinkCallback();
  renderCloudSyncControls();
  if (signedInFromLink) scheduleCloudSyncAfterLocalChange(200);
  else if (readCloudSyncConfig().ready && hasCloudSyncSession()) scheduleCloudSyncAfterLocalChange(800);
}
