import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const expectedHash = "CF174162DD64010F628E721919B6E9AE67F0CDFC35526978CB2E94E0A426010C";
const fixturePath = [
  path.resolve("tests/fixtures/private/study-dashboard-full-backup-2026-07-18.json"),
  path.resolve("tests/fixtures/private/study-dashboard-full-backup-2026-07-18.json.json"),
].find(existsSync);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex").toUpperCase();

function makeMigrationContext() {
  const context = vm.createContext({
    console, Date,
    appDataSchemaVersionKey: "appDataSchemaVersion", currentAppDataSchemaVersion: "8.4", APP_VERSION: "8.4.0",
    historyKey: "review-history", dailyPlansKey: "studyDailyPlans",
    planPhaseTemplatesKey: "studyPlanPhaseTemplates", planWindowStateKey: "studyPlanWindowState", planMigrationBackupsKey: "studyPlanMigrationBackups",
    focusMinutesKey: "studyFocusSeconds", taskFocusSecondsKey: "studyTaskFocusSeconds", focusSessionsKey: "studyFocusSessions",
    manualTimeRecordsKey: "studyManualTimeRecords", dailyStudyTargetsKey: "studyDailyTargetSeconds", examStatsConfigKey: "studyExamStatsConfig",
    reviewQueueKey: "reviewQueue", professionalResultsKey: "studyProfessionalResults", legacyBackupKey: "legacyBackup",
    migrationStateKey: "studyMigrationState", migrationReportsKey: "studyMigrationReports", migrationRollbackKey: "studyMigrationRollback",
    errorLogKey: "studyErrorLog", uiPreferencesKey: "studyUiPreferences",
  });
  vm.runInContext(`${readFileSync(path.resolve("js/plan-window-core.js"), "utf8")}\n${readFileSync(path.resolve("js/p0-final-core.js"), "utf8")}\n${readFileSync(path.resolve("js/p0-results.js"), "utf8")}\n${readFileSync(path.resolve("js/migrations.js"), "utf8")}\nglobalThis.migrate = migrateStorageSnapshot;`, context);
  return context;
}

test("real backup migrates in memory with plan and focus invariants", () => {
  assert.ok(fixturePath, "private plan backup fixture is missing");
  const beforeFile = readFileSync(fixturePath);
  assert.equal(sha256(beforeFile), expectedHash);
  const backup = JSON.parse(beforeFile.toString("utf8"));
  const storage = backup.localStorage;
  const originalPlans = JSON.parse(storage.studyDailyPlans);
  const originalFocusTotals = JSON.parse(storage.studyFocusSeconds);
  const originalFocusTotal = Object.values(originalFocusTotals).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const originalSessions = storage.studyFocusSessions;
  const originalHistory = storage["review-history"];
  const context = makeMigrationContext();
  const first = context.migrate(storage, { now: "2026-07-18T12:00:00.000Z", todayKey: "2026-07-18", source: "private-fixture", force: true });
  const migratedPlans = JSON.parse(first.values.studyDailyPlans);
  const templates = JSON.parse(first.values.studyPlanPhaseTemplates);
  const backups = JSON.parse(first.values.studyPlanMigrationBackups);

  assert.equal(first.values.appDataSchemaVersion, "8.4");
  assert.equal(Object.keys(migratedPlans).length, 10);
  assert.equal(migratedPlans["2026-07-18"].currentTaskId, originalPlans["2026-07-18"].currentTaskId);
  const migratedTodayTasks = migratedPlans["2026-07-18"].tasks;
  const addedWords = migratedTodayTasks.find((task) => task.id === "plan-english-words");
  assert.equal(addedWords.time, "08:00—08:25");
  assert.equal(addedWords.status, "not-started");
  assert.deepEqual(
    migratedTodayTasks.filter((task) => task.id !== "plan-english-words").map((task) => [task.id, task.description, task.status, task.completed]),
    originalPlans["2026-07-18"].tasks.map((task) => [task.id, task.description, task.status, task.completed]),
  );
  assert.ok(migratedPlans["2026-07-18"].tasks.every((task) => task.date === "2026-07-18" && task.taskId && Array.isArray(task.actualResultRefs)));
  assert.ok(["2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"].every((date) => migratedPlans[date]));
  assert.equal(Object.keys(backups["p0-plan-window-v1"].farDailyPlans).length, 149);
  assert.equal(templates.length, 10);
  assert.deepEqual(templates.map((phase) => phase.phaseName), ["提速试行", "第一轮正式背诵冲刺", "第一轮全书封口", "第二轮主体", "第二轮验收", "母题化与主要限时训练", "全卷过渡与弱项修补", "单科180分钟模拟", "压缩回炉", "考前收束"]);
  assert.equal(first.values.studyFocusSessions, originalSessions);
  assert.equal(first.values["review-history"], originalHistory);
  assert.equal(Object.values(JSON.parse(first.values.studyFocusSeconds)).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0), originalFocusTotal);
  assert.equal(originalFocusTotal, 60906);

  const second = context.migrate(first.values, { now: "2026-07-18T12:05:00.000Z", todayKey: "2026-07-18", source: "private-fixture" });
  assert.equal(second.report.status, "skipped");
  assert.deepEqual(second.values, first.values);

  const restoredAgain = context.migrate(first.values, { now: "2026-07-18T12:00:00.000Z", todayKey: "2026-07-18", source: "backup-restore", force: true });
  ["studyDailyPlans", "studyPlanPhaseTemplates", "studyPlanMigrationBackups", "studyFocusSessions", "studyFocusSeconds", "studyTaskFocusSeconds", "review-history"].forEach((key) => {
    assert.equal(restoredAgain.values[key], first.values[key], `restore/export invariant changed: ${key}`);
  });
  assert.equal(sha256(readFileSync(fixturePath)), expectedHash);
});
