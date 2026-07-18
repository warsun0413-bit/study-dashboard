import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { legacyStorageFixture } from "./fixtures/legacy-backup-fixture.mjs";

const context = {
  console,
  appDataSchemaVersionKey: "appDataSchemaVersion",
  currentAppDataSchemaVersion: "7.1",
  historyKey: "review-history",
  dailyPlansKey: "studyDailyPlans",
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
vm.runInContext(`${fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8")}
${fs.readFileSync(new URL("../js/migrations.js", import.meta.url), "utf8")}
globalThis.runFixtureMigration = (snapshot, options) => migrateStorageSnapshot(snapshot, options);
globalThis.buildFixtureChanges = (before, after) => buildStorageChanges(before, after);`, context);

const first = context.runFixtureMigration(legacyStorageFixture, { now: "2026-07-18T12:00:00.000Z", source: "test" });
assert.equal(first.values.appDataSchemaVersion, "7.1");
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "today-1"), false);
assert.equal(Object.prototype.hasOwnProperty.call(first.values, "offlineAiPromptDraft"), false);
assert.equal(first.values["completed-today"], "仍由当前版本读取");
assert.equal(JSON.parse(first.values.legacyBackup).fields["today-1"].value, "done");
assert.equal(JSON.parse(first.values.studyFocusSessions).length, 1);
assert.equal(JSON.parse(first.values.studyErrorLog).length, 50);
assert.equal(JSON.parse(first.values.studyFocusSeconds)["2026-07-18"], 0);
assert.equal(first.values.lastActiveDate, "2026-07-18");
assert.equal(first.report.beforeCounts.historyRecords, first.report.afterCounts.historyRecords);
assert.equal(first.report.beforeCounts.manualTimeRecords, first.report.afterCounts.manualTimeRecords);
assert.equal(JSON.parse(first.values.studyProfessionalResults).schemaVersion, 1);
assert.equal(Array.isArray(JSON.parse(first.values.reviewQueue)), true);
assert.equal(Array.isArray(JSON.parse(first.values.studyErrorLog)), true);
assert.ok(context.buildFixtureChanges(legacyStorageFixture, first.values).length > 0);

const second = context.runFixtureMigration(first.values, { now: "2026-07-18T12:05:00.000Z", source: "test" });
assert.equal(second.report.status, "skipped");
assert.deepEqual(second.values, first.values);
assert.equal(context.buildFixtureChanges(first.values, second.values).length, 0);

const invalidHistoryFixture = { ...legacyStorageFixture, "review-history": JSON.stringify({ date: "2026-07-17" }) };
assert.throws(
  () => context.runFixtureMigration(invalidHistoryFixture, { now: "2026-07-18T12:10:00.000Z", source: "test" }),
  /review-history 不是数组/,
);

console.log("P0_MIGRATION_TEST_OK");
