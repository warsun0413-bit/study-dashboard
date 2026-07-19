import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { legacyStorageFixture } from "./fixtures/legacy-backup-fixture.mjs";

const retiredKeys = [
  "completed-today", "unfinished-today", "delayed-tasks", "learned-today", "tomorrow-priority",
  "today-1", "today-2", "today-3", "today-4", "today-5", "today-6",
  "english-1", "english-2", "english-3", "major-1", "major-2", "major-3", "offlineAiPromptDraft",
];
const scannedLegacyKeys = [...retiredKeys, "lastActiveDate"];

const context = {
  console,
  appDataSchemaVersionKey: "appDataSchemaVersion",
  currentAppDataSchemaVersion: "8.0",
  historyKey: "review-history",
  dailyPlansKey: "studyDailyPlans",
  planPhaseTemplatesKey: "studyPlanPhaseTemplates",
  planWindowStateKey: "studyPlanWindowState",
  planMigrationBackupsKey: "studyPlanMigrationBackups",
  focusMinutesKey: "studyFocusSeconds",
  taskFocusSecondsKey: "studyTaskFocusSeconds",
  focusSessionsKey: "studyFocusSessions",
  manualTimeRecordsKey: "studyManualTimeRecords",
  reviewQueueKey: "reviewQueue",
  professionalResultsKey: "studyProfessionalResults",
  legacyBackupKey: "legacyBackup",
  migrationStateKey: "studyMigrationState",
  migrationReportsKey: "studyMigrationReports",
  migrationRollbackKey: "studyMigrationRollback",
  errorLogKey: "studyErrorLog",
  uiPreferencesKey: "studyUiPreferences",
};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8")}
${fs.readFileSync(new URL("../js/p0-final-core.js", import.meta.url), "utf8")}
${fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8")}
${fs.readFileSync(new URL("../js/migrations.js", import.meta.url), "utf8")}
globalThis.runFixtureMigration = (snapshot, options) => migrateStorageSnapshot(snapshot, options);
globalThis.buildFixtureChanges = (before, after) => buildStorageChanges(before, after);
globalThis.applyFixtureTransaction = (snapshot, operationId) => applyStorageSnapshotTransaction(snapshot, operationId, false);`, context);

const first = context.runFixtureMigration(legacyStorageFixture, { now: "2026-07-18T12:00:00.000Z", todayKey: "2026-07-18", source: "test" });
assert.equal(first.values.appDataSchemaVersion, "8.0");
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "today-1"), false);
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "offlineAiPromptDraft"), false);
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "completed-today"), false);
assert.equal(JSON.parse(first.values.legacyBackup).fields["completed-today"].value, "仍由当前版本读取");
assert.equal(JSON.parse(first.values.legacyBackup).fields["completed-today"].status, "deprecated");
assert.equal(JSON.parse(first.values.legacyBackup).fields["today-1"].value, "done");
retiredKeys.filter((key) => Object.prototype.hasOwnProperty.call(legacyStorageFixture, key)).forEach((key) => {
  const archived = JSON.parse(first.values.legacyBackup).fields[key];
  assert.equal(archived.value, legacyStorageFixture[key]);
  assert.equal(archived.status, "deprecated");
  assert.ok(archived.migratedAt);
  assert.equal(Object.prototype.hasOwnProperty.call(first.values, key), false);
});
assert.equal(JSON.parse(first.values.studyFocusSessions).length, 2);
assert.equal(first.values.studyFocusSessions, legacyStorageFixture.studyFocusSessions);
assert.equal(first.values.studyErrorLog, legacyStorageFixture.studyErrorLog);
assert.equal(JSON.parse(first.values.studyErrorLog).length, JSON.parse(legacyStorageFixture.studyErrorLog).length);
assert.equal(JSON.parse(first.values.studyFocusSeconds)["2026-07-18"], 0);
assert.equal(first.values.lastActiveDate, "2026-07-18");
assert.equal(JSON.parse(first.values.legacyBackup).fields.lastActiveDate.value, legacyStorageFixture.lastActiveDate);
assert.equal(JSON.parse(first.values.legacyBackup).fields.lastActiveDate.status, "deprecated");
assert.equal(first.report.beforeCounts.historyRecords, first.report.afterCounts.historyRecords);
assert.equal(first.report.beforeCounts.manualTimeRecords, first.report.afterCounts.manualTimeRecords);
assert.equal(JSON.parse(first.values.studyProfessionalResults).schemaVersion, 1);
assert.equal(Array.isArray(JSON.parse(first.values.reviewQueue)), true);
assert.equal(Array.isArray(JSON.parse(first.values.studyErrorLog)), true);
assert.ok(context.buildFixtureChanges(legacyStorageFixture, first.values).length > 0);

const second = context.runFixtureMigration(first.values, { now: "2026-07-18T12:05:00.000Z", todayKey: "2026-07-18", source: "test" });
assert.equal(second.report.status, "skipped");
assert.deepEqual(second.values, first.values);
assert.equal(context.buildFixtureChanges(first.values, second.values).length, 0);

const invalidHistoryFixture = { ...legacyStorageFixture, "review-history": JSON.stringify({ date: "2026-07-17" }) };
assert.throws(
  () => context.runFixtureMigration(invalidHistoryFixture, { now: "2026-07-18T12:10:00.000Z", todayKey: "2026-07-18", source: "test" }),
  /review-history 不是数组/,
);

class ThrowingStorage {
  constructor(values) { this.values = new Map(Object.entries(values)); this.failed = false; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  removeItem(key) { this.values.delete(key); }
  setItem(key, value) {
    if (key === "b" && !this.failed) { this.failed = true; throw new Error("simulated-write-failure"); }
    this.values.set(key, String(value));
  }
}
const failingStorage = new ThrowingStorage({ a: "old-a", b: "old-b" });
context.localStorage = failingStorage;
assert.throws(() => context.applyFixtureTransaction({ a: "new-a", b: "new-b" }, "test-rollback"), /simulated-write-failure/);
assert.equal(failingStorage.getItem("a"), "old-a");
assert.equal(failingStorage.getItem("b"), "old-b");

const runtimeFiles = ["js/app.js", "js/storage.js", "js/tasks.js", "js/review.js", "js/p0-final.js", "js/p0-final-core.js", "js/study-time.js", "js/focus-timer.js"];
const runtimeSource = runtimeFiles.filter(fs.existsSync).map((file) => fs.readFileSync(file, "utf8")).join("\n");
scannedLegacyKeys.forEach((key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.doesNotMatch(runtimeSource, new RegExp(`localStorage\\.(?:getItem|setItem)\\(\\s*[\"']${escaped}[\"']`), `${key} remains a runtime storage source`);
});

const futureOnly = context.runFixtureMigration({
  studyDailyPlans: JSON.stringify({ "2026-07-20": { tasks: [{ taskId: "future", status: "completed", actualResult: { note: "未来记录" } }] } }),
  lastActiveDate: "2026-07-20",
}, { now: "2026-07-19T02:00:00.000Z", todayKey: "2026-07-19", source: "future-only-test", force: true });
assert.equal(Object.prototype.hasOwnProperty.call(futureOnly.values, "lastActiveDate"), false);
assert.equal(futureOnly.report.lastActiveDateAfter, "");

console.log("P0_MIGRATION_TEST_OK");
