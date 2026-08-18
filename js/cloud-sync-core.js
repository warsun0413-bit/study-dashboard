// Provider-neutral cloud synchronization protocol. Pure functions only.
const CLOUD_SYNC_PROTOCOL_VERSION = 1;
const CLOUD_SYNC_UPLOAD_STATUSES = Object.freeze(["applied", "already-applied", "conflict", "rejected", "retryable-error"]);

function cloudSyncArray(value) { return Array.isArray(value) ? value : []; }
function cloudSyncText(value) { return String(value == null ? "" : value).trim(); }
function cloudSyncRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}
function cloudSyncClone(value) { return JSON.parse(JSON.stringify(value)); }

function normalizeCloudSyncMeta(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const documents = source.documents && typeof source.documents === "object" && !Array.isArray(source.documents) ? source.documents : {};
  const normalizedDocuments = {};
  Object.entries(documents).forEach(([key, document]) => {
    if (typeof isOfflineSyncCaptureKey === "function" && !isOfflineSyncCaptureKey(key)) return;
    const remoteRevision = cloudSyncRevision(document && document.remoteRevision);
    if (remoteRevision === null) return;
    normalizedDocuments[key] = {
      remoteRevision,
      remoteFingerprint: cloudSyncText(document.remoteFingerprint),
      localFingerprint: cloudSyncText(document.localFingerprint),
      syncedAt: cloudSyncText(document.syncedAt),
    };
  });
  return {
    schemaVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    documents: normalizedDocuments,
    lastPullCursor: cloudSyncText(source.lastPullCursor),
    updatedAt: cloudSyncText(source.updatedAt),
  };
}

function buildCloudSyncUploadRequest(queue, device, options = {}) {
  const deviceId = cloudSyncText(device && device.deviceId);
  if (!deviceId) throw new Error("同步设备标识无效。");
  const operations = buildOfflineSyncUploadBatch(queue, options.limit || 25).map((operation) => ({
    schemaVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    operationId: operation.operationId,
    deviceId,
    kind: operation.kind,
    key: operation.key,
    payload: operation.payload,
    contentFingerprint: operation.contentFingerprint,
    baseRemoteRevision: operation.baseRemoteRevision,
    clientUpdatedAt: operation.updatedAt,
  }));
  return {
    schemaVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    deviceId,
    operations,
    pullCursor: cloudSyncText(options.pullCursor),
  };
}

function normalizeCloudSyncUploadResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const operationId = cloudSyncText(value.operationId);
  const key = cloudSyncText(value.key);
  const status = cloudSyncText(value.status);
  const remoteRevision = cloudSyncRevision(value.remoteRevision);
  if (!operationId || !key || !CLOUD_SYNC_UPLOAD_STATUSES.includes(status) || remoteRevision === null
    || (typeof isOfflineSyncCaptureKey === "function" && !isOfflineSyncCaptureKey(key))) return null;
  return {
    operationId,
    key,
    status,
    remoteRevision,
    remoteFingerprint: cloudSyncText(value.remoteFingerprint),
    message: cloudSyncText(value.message).slice(0, 300),
  };
}

function reconcileCloudSyncUploadResults(queue, meta, results, now = new Date().toISOString(), attemptedOperations = queue) {
  const normalizedQueue = normalizeOfflineSyncQueue(queue);
  const normalizedAttempts = normalizeOfflineSyncQueue(attemptedOperations);
  const normalizedMeta = normalizeCloudSyncMeta(meta);
  const resultById = new Map(cloudSyncArray(results).map(normalizeCloudSyncUploadResult).filter(Boolean)
    .map((result) => [result.operationId, result]));
  const acknowledgedByKey = new Map();
  const nextQueue = [];
  const applied = [];
  const conflicts = [];
  normalizedAttempts.forEach((operation) => {
    const result = resultById.get(operation.operationId);
    if (!result || result.key !== operation.key) return;
    acknowledgedByKey.set(operation.key, { operation, result });
    if (["applied", "already-applied"].includes(result.status)) {
      normalizedMeta.documents[operation.key] = {
        remoteRevision: result.remoteRevision,
        remoteFingerprint: result.remoteFingerprint,
        localFingerprint: operation.contentFingerprint,
        syncedAt: now,
      };
      applied.push({ key: operation.key, operationId: operation.operationId, status: result.status });
      return;
    }
    if (["conflict", "rejected"].includes(result.status)) {
      conflicts.push({
        key: operation.key,
        operationId: operation.operationId,
        remoteRevision: result.remoteRevision,
        message: result.message || "云端版本与本机基线不一致。",
      });
    }
  });
  normalizedQueue.forEach((operation) => {
    const acknowledged = acknowledgedByKey.get(operation.key);
    if (!acknowledged) {
      nextQueue.push(operation);
      return;
    }
    const { operation: attempted, result } = acknowledged;
    const sameOperation = operation.operationId === attempted.operationId;
    if (["applied", "already-applied"].includes(result.status)) {
      if (!sameOperation) {
        nextQueue.push({
          ...operation,
          baseFingerprint: attempted.contentFingerprint,
          baseRemoteRevision: result.remoteRevision,
          status: "pending",
          lastError: "",
        });
      }
      return;
    }
    const isConflict = ["conflict", "rejected"].includes(result.status);
    const retained = {
      ...operation,
      status: isConflict ? "conflict" : "pending",
      attempts: operation.attempts + (sameOperation ? 1 : 0),
      lastError: result.message || (isConflict ? "云端版本与本机基线不一致。" : "上传暂时失败，可重试。"),
    };
    nextQueue.push(retained);
  });
  normalizedMeta.updatedAt = now;
  return { queue: nextQueue, meta: normalizedMeta, applied, conflicts };
}

function normalizeCloudSyncDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const key = cloudSyncText(value.key || value.document_key);
  const payload = typeof value.payload === "string" ? value.payload : "";
  const remoteRevision = cloudSyncRevision(value.remoteRevision ?? value.revision);
  if (!key || !payload || remoteRevision === null || remoteRevision < 1
    || (typeof isOfflineSyncCaptureKey === "function" && !isOfflineSyncCaptureKey(key))) return null;
  try { JSON.parse(payload); } catch { return null; }
  return {
    key,
    payload,
    remoteRevision,
    remoteFingerprint: cloudSyncText(value.remoteFingerprint || value.content_fingerprint),
    updatedAt: cloudSyncText(value.updatedAt || value.updated_at),
  };
}

function planCloudSyncPull(localSnapshot, remoteDocuments, queue, meta) {
  const local = localSnapshot && typeof localSnapshot === "object" && !Array.isArray(localSnapshot) ? localSnapshot : {};
  const normalizedQueue = normalizeOfflineSyncQueue(queue);
  const normalizedMeta = normalizeCloudSyncMeta(meta);
  const pendingKeys = new Set(normalizedQueue.map((operation) => operation.key));
  const changes = [];
  const conflicts = [];
  cloudSyncArray(remoteDocuments).map(normalizeCloudSyncDocument).filter(Boolean).forEach((remote) => {
    const localValue = typeof local[remote.key] === "string" ? local[remote.key] : null;
    const known = normalizedMeta.documents[remote.key] || null;
    if (pendingKeys.has(remote.key)) {
      const pending = normalizedQueue.find((operation) => operation.key === remote.key);
      if (remote.remoteRevision !== pending.baseRemoteRevision) {
        conflicts.push({ key: remote.key, reason: "pending-local-change", remoteRevision: remote.remoteRevision });
      }
      return;
    }
    if (known && known.remoteRevision === remote.remoteRevision) return;
    const localFingerprint = localValue === null ? "" : offlineSyncFingerprint(localValue);
    const safeToApply = localValue === null || (known && known.localFingerprint === localFingerprint);
    if (!safeToApply) {
      conflicts.push({ key: remote.key, reason: "untracked-local-change", remoteRevision: remote.remoteRevision });
      return;
    }
    changes.push({
      key: remote.key,
      beforeValue: localValue,
      afterValue: remote.payload,
      remoteRevision: remote.remoteRevision,
      remoteFingerprint: remote.remoteFingerprint,
      localFingerprint: offlineSyncFingerprint(remote.payload),
    });
  });
  return { changes: cloudSyncClone(changes), conflicts: cloudSyncClone(conflicts) };
}
