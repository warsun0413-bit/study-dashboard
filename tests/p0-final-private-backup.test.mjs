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
    console, Date,
    appDataSchemaVersionKey: "appDataSchemaVersion", currentAppDataSchemaVersion: "8.0", APP_VERSION: "8.0.0",
    historyKey: "review-history", dailyPlansKey: "studyDailyPlans", planPhaseTemplatesKey: "studyPlanPhaseTemplates",
    planWindowStateKey: "studyPlanWindowState", planMigrationBackupsKey: "studyPlanMigrationBackups",
    focusMinutesKey: "studyFocusSeconds", taskFocusSecondsKey: "studyTaskFocusSeconds", focusSessionsKey: "studyFocusSessions",
    manualTimeRecordsKey: "studyManualTimeRecords", dailyStudyTargetsKey: "studyDailyTargetSeconds", examStatsConfigKey: "studyExamStatsConfig",
    reviewQueueKey: "reviewQueue", professionalResultsKey: "studyProfessionalResults", legacyBackupKey: "legacyBackup",
    migrationStateKey: "studyMigrationState", migrationReportsKey: "studyMigrationReports", migrationRollbackKey: "studyMigrationRollback",
    errorLogKey: "studyErrorLog", uiPreferencesKey: "studyUiPreferences",
  });
  vm.runInContext(`${readFileSync(path.resolve("js/plan-window-core.js"), "utf8")}\n${readFileSync(path.resolve("js/p0-final-core.js"), "utf8")}\n${readFileSync(path.resolve("js/p0-results.js"), "utf8")}\n${readFileSync(path.resolve("js/migrations.js"), "utf8")}\nglobalThis.api={migrate:migrateStorageSnapshot,snapshot:buildP0TodaySnapshot};`, context);
  return context;
}

function normalizedExport(values) {
  const copy = { ...values };
  ["studyMigrationReports", "studyMigrationState", "studyMigrationRollback", "lastBackupAt", "lastFullBackupAt"].forEach((key) => delete copy[key]);
  return copy;
}

test("real backup completes the P0 final migration, snapshot, restore, and normalized re-export chain", () => {
  assert.ok(fixturePath, "private P0 fixture is missing");
  const beforeFile = readFileSync(fixturePath);
  assert.equal(hash(beforeFile), expectedHash);
  const original = JSON.parse(beforeFile.toString("utf8")).localStorage;
  const originalPlans = JSON.parse(original.studyDailyPlans);
  const originalSessionsRaw = original.studyFocusSessions;
  const originalSessions = JSON.parse(originalSessionsRaw);
  const originalHistory = JSON.parse(original["review-history"]);
  const originalReviews = JSON.parse(original.reviewQueue);
  const originalProfessional = original.studyProfessionalResults
    ? JSON.parse(original.studyProfessionalResults)
    : { schemaVersion: 1, days: {} };
  const originalFocusTotal = Object.values(JSON.parse(original.studyFocusSeconds)).reduce((sum, seconds) => sum + Math.max(0, Number(seconds) || 0), 0);
  const context = createContext();
  const migrated = context.api.migrate(original, { force: true, source: "p0-final-private", todayKey: "2026-07-18", now: "2026-07-18T12:00:00.000Z" });
  const values = migrated.values;
  const plans = JSON.parse(values.studyDailyPlans);
  const legacy = JSON.parse(values.legacyBackup);
  const templates = JSON.parse(values.studyPlanPhaseTemplates);

  assert.equal(values.appDataSchemaVersion, "8.0");
  assert.equal(Object.keys(plans).length, 10);
  assert.equal(Object.keys(plans).filter((date) => date >= "2026-07-18").length, 7);
  assert.equal(templates.length, 10);
  assert.deepEqual(plans["2026-07-18"].tasks.map((task) => [task.id, task.status, task.completed]), originalPlans["2026-07-18"].tasks.map((task) => [task.id, task.status, task.completed]));
  assert.equal(values.studyFocusSessions, originalSessionsRaw);
  assert.equal(JSON.parse(values.studyFocusSessions).length, 12);
  assert.equal(originalSessions.filter((session) => Number(session && session.seconds) <= 0).length, 1);
  assert.equal(Object.values(JSON.parse(values.studyFocusSeconds)).reduce((sum, seconds) => sum + Math.max(0, Number(seconds) || 0), 0), 60906);
  assert.equal(originalFocusTotal, 60906);
  const retiredKeys = [
    "completed-today", "unfinished-today", "delayed-tasks", "learned-today", "tomorrow-priority",
    "today-1", "today-2", "today-3", "today-4", "today-5", "today-6",
    "english-1", "english-2", "english-3", "major-1", "major-2", "major-3", "offlineAiPromptDraft",
  ];
  retiredKeys.forEach((key) => {
    assert.equal(Object.prototype.hasOwnProperty.call(values, key), false, `${key} was not retired`);
    assert.equal(legacy.fields[key].status, "deprecated");
    assert.equal(legacy.fields[key].value, original[key]);
    assert.ok(legacy.fields[key].migratedAt);
  });
  assert.equal(legacy.schemaVersion, 1);
  assert.ok(legacy.migratedAt);
  assert.deepEqual(JSON.parse(values["review-history"]), originalHistory);
  assert.deepEqual(JSON.parse(values.reviewQueue), originalReviews);
  assert.deepEqual(JSON.parse(values.studyProfessionalResults), originalProfessional);
  assert.equal(values.lastActiveDate, "2026-07-18");

  const snapshot = context.api.snapshot({
    date: "2026-07-18", phaseTemplates: templates, dailyPlan: plans["2026-07-18"],
    effectiveStudySeconds: 21678, taskFocusSeconds: JSON.parse(values.studyTaskFocusSeconds)["2026-07-18"] || {},
    professionalStore: JSON.parse(values.studyProfessionalResults), reviewQueue: JSON.parse(values.reviewQueue), history: JSON.parse(values["review-history"]), dailyPlans: plans,
  });
  assert.equal(snapshot.type, "study-dashboard-today-snapshot");
  assert.equal(snapshot.tasks.completed.length, 5);
  assert.equal(snapshot.professionalProgress["722"].actualUnits.length, 0);
  assert.equal(snapshot.professionalProgress["844"].actualUnits.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.tomorrowPriority)), { value: "722", source: "tomorrow-plan" });

  const restored = context.api.migrate({ ...values }, { force: true, source: "backup-restore", todayKey: "2026-07-18", now: "2026-07-18T12:00:00.000Z" });
  assert.deepEqual(normalizedExport(restored.values), normalizedExport(values));
  assert.equal(restored.values.studyFocusSessions, originalSessionsRaw);
  assert.equal(restored.values.reviewQueue, values.reviewQueue);
  assert.equal(restored.values.studyProfessionalResults, values.studyProfessionalResults);
  assert.deepEqual(JSON.parse(restored.values.legacyBackup), legacy);
  assert.equal(hash(readFileSync(fixturePath)), expectedHash);
});
