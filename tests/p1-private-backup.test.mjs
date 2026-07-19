import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const expectedHash = "CF174162DD64010F628E721919B6E9AE67F0CDFC35526978CB2E94E0A426010C";
const fixturePath = [path.resolve("tests/fixtures/private/study-dashboard-full-backup-2026-07-18.json"), path.resolve("tests/fixtures/private/study-dashboard-full-backup-2026-07-18.json.json")].find(existsSync);
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex").toUpperCase();

function createContext() {
  const context = vm.createContext({
    console, Date, appDataSchemaVersionKey: "appDataSchemaVersion", currentAppDataSchemaVersion: "8.1", APP_VERSION: "8.1.0",
    historyKey: "review-history", dailyPlansKey: "studyDailyPlans", planPhaseTemplatesKey: "studyPlanPhaseTemplates", planWindowStateKey: "studyPlanWindowState", planMigrationBackupsKey: "studyPlanMigrationBackups",
    focusMinutesKey: "studyFocusSeconds", taskFocusSecondsKey: "studyTaskFocusSeconds", focusSessionsKey: "studyFocusSessions", manualTimeRecordsKey: "studyManualTimeRecords", dailyStudyTargetsKey: "studyDailyTargetSeconds", examStatsConfigKey: "studyExamStatsConfig",
    reviewQueueKey: "reviewQueue", professionalResultsKey: "studyProfessionalResults", englishWordRecordsKey: "studyEnglishWordRecords", englishReadingRecordsKey: "studyEnglishReadingRecords", politicsRecordsKey: "studyPoliticsRecords", outputRecordsKey: "studyOutputRecords",
    legacyBackupKey: "legacyBackup", migrationStateKey: "studyMigrationState", migrationReportsKey: "studyMigrationReports", migrationRollbackKey: "studyMigrationRollback", errorLogKey: "studyErrorLog", uiPreferencesKey: "studyUiPreferences",
  });
  vm.runInContext(`${readFileSync(path.resolve("js/plan-window-core.js"), "utf8")}\n${readFileSync(path.resolve("js/p0-final-core.js"), "utf8")}\n${readFileSync(path.resolve("js/p0-results.js"), "utf8")}\n${readFileSync(path.resolve("js/p1-results-core.js"), "utf8")}\n${readFileSync(path.resolve("js/migrations.js"), "utf8")}\nglobalThis.api={migrate:migrateStorageSnapshot};`, context);
  return context;
}

test("real P0 backup migrates to P1 with empty result stores and all trusted invariants", () => {
  assert.ok(fixturePath, "private fixture is missing");
  const before = readFileSync(fixturePath);
  assert.equal(hash(before), expectedHash);
  const original = JSON.parse(before.toString("utf8")).localStorage;
  const originalPlans = JSON.parse(original.studyDailyPlans);
  const context = createContext();
  const first = context.api.migrate(original, { force: true, source: "p1-private", todayKey: "2026-07-18", now: "2026-07-18T12:00:00.000Z" });
  assert.equal(first.values.appDataSchemaVersion, "8.1");
  assert.deepEqual(JSON.parse(first.values.studyEnglishWordRecords), []);
  assert.deepEqual(JSON.parse(first.values.studyEnglishReadingRecords), []);
  assert.deepEqual(JSON.parse(first.values.studyPoliticsRecords), []);
  assert.deepEqual(JSON.parse(first.values.studyOutputRecords), []);
  assert.equal(Object.values(JSON.parse(first.values.studyFocusSeconds)).reduce((sum, seconds) => sum + Number(seconds || 0), 0), 60906);
  assert.equal(first.values.studyFocusSessions, original.studyFocusSessions);
  assert.equal(JSON.parse(first.values.studyFocusSessions).length, 12);
  assert.equal(first.values.reviewQueue, original.reviewQueue);
  assert.equal(first.values.studyProfessionalResults || JSON.stringify({ schemaVersion: 1, days: {} }), original.studyProfessionalResults || JSON.stringify({ schemaVersion: 1, days: {} }));
  const plans = JSON.parse(first.values.studyDailyPlans);
  assert.equal(Object.keys(plans).filter((date) => date >= "2026-07-18").length, 7);
  assert.equal(JSON.parse(first.values.studyPlanPhaseTemplates).length, 10);
  assert.deepEqual(plans["2026-07-18"].tasks.map((task) => [task.id, task.status, task.completed]), originalPlans["2026-07-18"].tasks.map((task) => [task.id, task.status, task.completed]));
  const oldEnglish = originalPlans["2026-07-18"].tasks.find((task) => task.id === "plan-english");
  assert.equal(oldEnglish.status, "completed");
  assert.equal(JSON.parse(first.values.studyEnglishWordRecords).length + JSON.parse(first.values.studyEnglishReadingRecords).length, 0);
  const second = context.api.migrate(first.values, { source: "p1-private-repeat", todayKey: "2026-07-18", now: "2026-07-18T12:05:00.000Z" });
  assert.equal(second.report.status, "skipped");
  assert.deepEqual(second.values, first.values);
  assert.equal(hash(readFileSync(fixturePath)), expectedHash);
});
