// Offline-first sync queue primitives. Pure functions only; no storage or network writes.
const OFFLINE_SYNC_SCHEMA_VERSION = 1;
const OFFLINE_SYNC_OPERATION_KIND = "replace-key";
const OFFLINE_SYNC_CAPTURE_KEYS = Object.freeze([
  "review-history",
  "studyDailyPlans",
  "studyPlanPhaseTemplates",
  "studyPlanWindowState",
  "studyFocusSeconds",
  "studyTaskFocusSeconds",
  "studyFocusSessions",
  "studyManualTimeRecords",
  "studyDailyTargetSeconds",
  "studyExamStatsConfig",
  "studyAdmissionMockScores",
  "studyAdmissionAssessmentConfig",
  "studyImportedPlan",
  "reviewQueue",
  "studyProfessionalResults",
  "studyEnglishWordRecords",
  "studyEnglishReadingRecords",
  "studyPoliticsRecords",
  "studyOutputRecords",
  "studyAnkiCandidates",
  "studyExecutionModes",
  "studyDebtQueue",
  "studyWeeklyImprovementRecords",
]);

function offlineSyncArray(value) { return Array.isArray(value) ? value : []; }
function offlineSyncText(value) { return String(value == null ? "" : value).trim(); }
function offlineSyncTimestamp(value) {
  const text = offlineSyncText(value);
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : "";
}
function isOfflineSyncCaptureKey(key) { return OFFLINE_SYNC_CAPTURE_KEYS.includes(String(key || "")); }

function offlineSyncFingerprint(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  let first = 2166136261;
  let second = 2654435761;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 2246822519);
  }
  return `sync-v1-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function normalizeOfflineSyncOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const key = offlineSyncText(value.key);
  const deviceId = offlineSyncText(value.deviceId);
  const operationId = offlineSyncText(value.operationId);
  const createdAt = offlineSyncTimestamp(value.createdAt);
  const updatedAt = offlineSyncTimestamp(value.updatedAt);
  const payload = typeof value.payload === "string" ? value.payload : "";
  const localRevision = Number(value.localRevision);
  const baseRemoteRevision = Number(value.baseRemoteRevision ?? 0);
  if (Number(value.schemaVersion) !== OFFLINE_SYNC_SCHEMA_VERSION || value.kind !== OFFLINE_SYNC_OPERATION_KIND
    || !isOfflineSyncCaptureKey(key) || !deviceId || !operationId || !createdAt || !updatedAt
    || !payload || !Number.isInteger(localRevision) || localRevision < 1
    || !Number.isInteger(baseRemoteRevision) || baseRemoteRevision < 0) return null;
  return {
    schemaVersion: OFFLINE_SYNC_SCHEMA_VERSION,
    kind: OFFLINE_SYNC_OPERATION_KIND,
    operationId,
    deviceId,
    key,
    payload,
    baseFingerprint: offlineSyncText(value.baseFingerprint),
    baseRemoteRevision,
    contentFingerprint: offlineSyncFingerprint(payload),
    localRevision,
    createdAt,
    updatedAt,
    attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
    status: ["pending", "uploading", "conflict"].includes(value.status) ? value.status : "pending",
    lastError: offlineSyncText(value.lastError).slice(0, 300),
  };
}

function normalizeOfflineSyncQueue(value) {
  const latestByKey = new Map();
  offlineSyncArray(value).forEach((candidate) => {
    const operation = normalizeOfflineSyncOperation(candidate);
    if (!operation) return;
    const existing = latestByKey.get(operation.key);
    if (!existing || operation.localRevision > existing.localRevision
      || (operation.localRevision === existing.localRevision && operation.updatedAt > existing.updatedAt)) {
      latestByKey.set(operation.key, operation);
    }
  });
  return [...latestByKey.values()].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.key.localeCompare(right.key));
}

function enqueueOfflineSyncMutation(queue, mutation = {}) {
  const normalized = normalizeOfflineSyncQueue(queue);
  const key = offlineSyncText(mutation.key);
  if (!isOfflineSyncCaptureKey(key)) return { queue: normalized, changed: false, reason: "not-syncable" };
  const beforeValue = typeof mutation.beforeValue === "string" ? mutation.beforeValue : null;
  const afterValue = typeof mutation.afterValue === "string" ? mutation.afterValue : null;
  if (afterValue === null || beforeValue === afterValue) return { queue: normalized, changed: false, reason: "unchanged" };
  const deviceId = offlineSyncText(mutation.deviceId);
  const now = offlineSyncTimestamp(mutation.now);
  if (!deviceId || !now) return { queue: normalized, changed: false, reason: "invalid-metadata" };

  const existing = normalized.find((operation) => operation.key === key) || null;
  if (existing && existing.payload === afterValue) return { queue: normalized, changed: false, reason: "already-queued" };
  const localRevision = existing ? existing.localRevision + 1
    : normalized.reduce((maximum, operation) => Math.max(maximum, operation.localRevision), 0) + 1;
  const operation = {
    schemaVersion: OFFLINE_SYNC_SCHEMA_VERSION,
    kind: OFFLINE_SYNC_OPERATION_KIND,
    operationId: `${deviceId}:${localRevision}:${offlineSyncFingerprint(`${key}:${afterValue}`).slice(8)}`,
    deviceId,
    key,
    payload: afterValue,
    baseFingerprint: existing ? existing.baseFingerprint : (beforeValue === null ? "" : offlineSyncFingerprint(beforeValue)),
    baseRemoteRevision: existing ? existing.baseRemoteRevision : Math.max(0, Math.floor(Number(mutation.baseRemoteRevision) || 0)),
    contentFingerprint: offlineSyncFingerprint(afterValue),
    localRevision,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    attempts: 0,
    status: "pending",
    lastError: "",
  };
  const next = normalized.filter((item) => item.key !== key).concat(operation)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.key.localeCompare(right.key));
  return { queue: next, changed: true, reason: existing ? "coalesced" : "queued", operation };
}

function buildOfflineSyncUploadBatch(queue, limit = 25) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
  return normalizeOfflineSyncQueue(queue)
    .filter((operation) => operation.status === "pending")
    .slice(0, safeLimit)
    .map((operation) => JSON.parse(JSON.stringify(operation)));
}

function summarizeOfflineSyncQueue(queue) {
  return normalizeOfflineSyncQueue(queue).reduce((summary, operation) => {
    summary.total += 1;
    summary[operation.status] += 1;
    summary.keys.push(operation.key);
    return summary;
  }, { total: 0, pending: 0, uploading: 0, conflict: 0, keys: [] });
}
