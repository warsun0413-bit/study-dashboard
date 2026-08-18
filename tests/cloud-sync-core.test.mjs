import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const offlineSource = fs.readFileSync(new URL("../js/offline-sync-core.js", import.meta.url), "utf8");
const cloudSource = fs.readFileSync(new URL("../js/cloud-sync-core.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(`${offlineSource}\n${cloudSource}\nglobalThis.core = {
  offlineSyncFingerprint, enqueueOfflineSyncMutation, buildCloudSyncUploadRequest,
  normalizeCloudSyncMeta, reconcileCloudSyncUploadResults, planCloudSyncPull
};`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));

function queuedOperation(options = {}) {
  return plain(core.enqueueOfflineSyncMutation([], {
    key: options.key || "review-history",
    beforeValue: options.beforeValue ?? "[]",
    afterValue: options.afterValue || '[{"date":"2026-08-18"}]',
    deviceId: "device-ipad",
    baseRemoteRevision: options.baseRemoteRevision ?? 0,
    now: "2026-08-18T08:00:00.000Z",
  })).operation;
}

test("upload request carries idempotency identity and the server revision baseline", () => {
  const operation = queuedOperation({ baseRemoteRevision: 7 });
  const request = plain(core.buildCloudSyncUploadRequest([operation], { deviceId: "device-ipad" }, { pullCursor: "cursor-1" }));
  assert.equal(request.schemaVersion, 1);
  assert.equal(request.operations.length, 1);
  assert.equal(request.operations[0].operationId, operation.operationId);
  assert.equal(request.operations[0].baseRemoteRevision, 7);
  assert.equal(request.operations[0].payload, operation.payload);
  assert.equal(request.pullCursor, "cursor-1");
});

test("an applied or replayed operation leaves the outbox and freezes its remote revision", () => {
  ["applied", "already-applied"].forEach((status) => {
    const operation = queuedOperation();
    const result = plain(core.reconcileCloudSyncUploadResults([operation], {}, [{
      operationId: operation.operationId,
      key: operation.key,
      status,
      remoteRevision: 1,
      remoteFingerprint: "server-sha256",
    }], "2026-08-18T09:00:00.000Z"));
    assert.equal(result.queue.length, 0);
    assert.equal(result.applied.length, 1);
    assert.deepEqual(result.meta.documents[operation.key], {
      remoteRevision: 1,
      remoteFingerprint: "server-sha256",
      localFingerprint: operation.contentFingerprint,
      syncedAt: "2026-08-18T09:00:00.000Z",
    });
  });
});

test("a newer local save made during upload stays queued on the acknowledged server revision", () => {
  const attempted = queuedOperation({ baseRemoteRevision: 3 });
  const concurrent = plain(core.enqueueOfflineSyncMutation([attempted], {
    key: attempted.key,
    beforeValue: attempted.payload,
    afterValue: '[{"date":"2026-08-18","note":"newer local save"}]',
    deviceId: "device-ipad",
    baseRemoteRevision: 3,
    now: "2026-08-18T08:01:00.000Z",
  })).operation;
  const result = plain(core.reconcileCloudSyncUploadResults([concurrent], {}, [{
    operationId: attempted.operationId,
    key: attempted.key,
    status: "applied",
    remoteRevision: 4,
    remoteFingerprint: "server-revision-4",
  }], "2026-08-18T09:00:00.000Z", [attempted]));
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].operationId, concurrent.operationId);
  assert.equal(result.queue[0].baseRemoteRevision, 4);
  assert.equal(result.queue[0].status, "pending");
  assert.equal(result.meta.documents[attempted.key].localFingerprint, attempted.contentFingerprint);
});

test("revision conflicts remain local and are never treated as uploaded", () => {
  const operation = queuedOperation({ baseRemoteRevision: 2 });
  const result = plain(core.reconcileCloudSyncUploadResults([operation], {}, [{
    operationId: operation.operationId,
    key: operation.key,
    status: "conflict",
    remoteRevision: 3,
    remoteFingerprint: "remote-3",
    message: "remote revision changed",
  }]));
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].status, "conflict");
  assert.equal(result.queue[0].attempts, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.meta.documents[operation.key], undefined);
});

test("retryable errors preserve pending operations while invalid results do nothing", () => {
  const operation = queuedOperation();
  const retry = plain(core.reconcileCloudSyncUploadResults([operation], {}, [{
    operationId: operation.operationId,
    key: operation.key,
    status: "retryable-error",
    remoteRevision: 0,
    message: "network unavailable",
  }]));
  assert.equal(retry.queue[0].status, "pending");
  assert.equal(retry.queue[0].attempts, 1);
  const ignored = plain(core.reconcileCloudSyncUploadResults([operation], {}, [{ status: "applied" }]));
  assert.equal(ignored.queue.length, 1);
  assert.equal(ignored.queue[0].attempts, 0);
});

test("pull applies a newer remote document only when the known local baseline is unchanged", () => {
  const localValue = '[{"date":"2026-08-17"}]';
  const meta = { schemaVersion: 1, documents: {
    "review-history": { remoteRevision: 1, remoteFingerprint: "old-server", localFingerprint: core.offlineSyncFingerprint(localValue), syncedAt: "" },
  } };
  const plan = plain(core.planCloudSyncPull({ "review-history": localValue }, [{
    key: "review-history",
    payload: '[{"date":"2026-08-18"}]',
    remoteRevision: 2,
    remoteFingerprint: "new-server",
  }], [], meta));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.changes[0].beforeValue, localValue);
});

test("pull fails closed for untracked or pending local changes and never mutates input", () => {
  const local = { "review-history": '[{"date":"local"}]' };
  const remote = [{ key: "review-history", payload: '[{"date":"remote"}]', remoteRevision: 4, remoteFingerprint: "remote-4" }];
  const before = JSON.stringify({ local, remote });
  const untracked = plain(core.planCloudSyncPull(local, remote, [], {}));
  assert.equal(untracked.changes.length, 0);
  assert.equal(untracked.conflicts[0].reason, "untracked-local-change");
  const operation = queuedOperation({ beforeValue: "[]", afterValue: local["review-history"], baseRemoteRevision: 3 });
  const pending = plain(core.planCloudSyncPull(local, remote, [operation], {}));
  assert.equal(pending.changes.length, 0);
  assert.equal(pending.conflicts[0].reason, "pending-local-change");
  assert.equal(JSON.stringify({ local, remote }), before);
});

test("invalid remote payloads and non-learning keys are ignored", () => {
  const plan = plain(core.planCloudSyncPull({}, [
    { key: "review-history", payload: "not-json", remoteRevision: 1 },
    { key: "studyFocusTimerState", payload: "{}", remoteRevision: 1 },
    { key: "review-history", payload: "[]", remoteRevision: 0 },
  ], [], {}));
  assert.deepEqual(plan, { changes: [], conflicts: [] });
});

test("Supabase schema enforces authentication ownership idempotency and revision conflicts", () => {
  const sql = fs.readFileSync(new URL("../supabase-sync-schema.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /primary key \(user_id, operation_id\)/);
  assert.match(sql, /existing_document\.revision <> v_base_revision/);
  assert.match(sql, /'already-applied'/);
  assert.match(sql, /revoke all on function public\.apply_study_sync_operation\(jsonb\) from public, anon/);
  assert.match(sql, /revoke all on public\.study_sync_documents from public, anon/);
  assert.match(sql, /grant execute on function public\.apply_study_sync_operation\(jsonb\) to authenticated/);
  assert.match(sql, /studyWeeklyImprovementRecords/);
  assert.doesNotMatch(sql, /service_role|SUPABASE_SECRET|API_KEY/);
});

test("page exposes publishable-only cloud setup without embedding credentials", () => {
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(index, /id="cloudSyncProjectUrl"/);
  assert.match(index, /id="cloudSyncPublishableKey"/);
  assert.match(index, /不会接收 Secret 或 service_role 密钥/);
  assert.doesNotMatch(index, /sb_secret_[A-Za-z0-9_-]{20,}|sb_publishable_[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{8}/);
});
