import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { legacyStorageFixture } from "./fixtures/legacy-backup-fixture.mjs";

const context = {
  console,
  appDataSchemaVersionKey: "appDataSchemaVersion",
  currentAppDataSchemaVersion: "7.3",
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
assert.equal(first.values.appDataSchemaVersion, "7.3");
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "today-1"), false);
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "offlineAiPromptDraft"), false);
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "completed-today"), false);
assert.equal(JSON.parse(first.values.legacyBackup).fields["completed-today"].value, "仍由当前版本读取");
assert.equal(JSON.parse(first.values.legacyBackup).fields["completed-today"].status, "deprecated");
assert.equal(JSON.parse(first.values.legacyBackup).fields["today-1"].value, "done");
assert.equal(JSON.parse(first.values.studyFocusSessions).length, 2);
assert.equal(first.values.studyFocusSessions, legacyStorageFixture.studyFocusSessions);
assert.equal(JSON.parse(first.values.studyErrorLog).length, 50);
assert.equal(JSON.parse(first.values.studyFocusSeconds)["2026-07-18"], 0);
assert.equal(first.values.lastActiveDate, "2026-07-18");
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

console.log("P0_MIGRATION_TEST_OK");
