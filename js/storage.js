// v8.0 shared storage helpers. Existing learning records are preserved.
const APP_VERSION = "8.0.0";
const historyKey = "review-history";
const lastBackupKey = "lastBackupAt";
const lastFullBackupKey = "lastFullBackupAt";
const appDataSchemaVersionKey = "appDataSchemaVersion";
const currentAppDataSchemaVersion = "8.0";
const dailyPlansKey = "studyDailyPlans";
const planPhaseTemplatesKey = "studyPlanPhaseTemplates";
const planWindowStateKey = "studyPlanWindowState";
const planMigrationBackupsKey = "studyPlanMigrationBackups";
const focusMinutesKey = "studyFocusSeconds";
const taskFocusSecondsKey = "studyTaskFocusSeconds";
const focusTimerStateKey = "studyFocusTimerState";
const focusSessionsKey = "studyFocusSessions";
const focusRoundGoalKey = "studyFocusRoundGoal";
const focusThoughtsKey = "studyFocusThoughts";
const manualTimeRecordsKey = "studyManualTimeRecords";
const dailyStudyTargetsKey = "studyDailyTargetSeconds";
const examStatsConfigKey = "studyExamStatsConfig";
const importedPlanKey = "studyImportedPlan";
const reviewQueueKey = "reviewQueue";
const professionalResultsKey = "studyProfessionalResults";
const englishWordRecordsKey = "studyEnglishWordRecords";
const englishReadingRecordsKey = "studyEnglishReadingRecords";
const politicsRecordsKey = "studyPoliticsRecords";
const legacyBackupKey = "legacyBackup";
const migrationStateKey = "studyMigrationState";
const migrationReportsKey = "studyMigrationReports";
const migrationRollbackKey = "studyMigrationRollback";
const errorLogKey = "studyErrorLog";
const uiPreferencesKey = "studyUiPreferences";
const autoSaveFields = Array.from(document.querySelectorAll("[data-save]"));

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDisplayDate(date = new Date()) {
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureDataSchema() {
  const hadStoredData = localStorage.length > 0;
  // Only initialize missing core fields. Never delete or overwrite legacy data.
  if (localStorage.getItem(historyKey) === null) writeJson(historyKey, []);
  if (localStorage.getItem(dailyPlansKey) === null) writeJson(dailyPlansKey, {});
  if (localStorage.getItem(planPhaseTemplatesKey) === null) writeJson(planPhaseTemplatesKey, []);
  if (localStorage.getItem(planWindowStateKey) === null) writeJson(planWindowStateKey, makePlanWindowState(getDateKey()));
  if (localStorage.getItem(planMigrationBackupsKey) === null) writeJson(planMigrationBackupsKey, {});
  if (localStorage.getItem(focusMinutesKey) === null) writeJson(focusMinutesKey, {});
  if (localStorage.getItem(taskFocusSecondsKey) === null) writeJson(taskFocusSecondsKey, {});
  if (localStorage.getItem(focusSessionsKey) === null) writeJson(focusSessionsKey, []);
  if (localStorage.getItem(manualTimeRecordsKey) === null) writeJson(manualTimeRecordsKey, []);
  if (localStorage.getItem(dailyStudyTargetsKey) === null) writeJson(dailyStudyTargetsKey, {});
  if (localStorage.getItem(examStatsConfigKey) === null) writeJson(examStatsConfigKey, { startDate: "2026-07-18" });
  if (localStorage.getItem(reviewQueueKey) === null) writeJson(reviewQueueKey, []);
  if (localStorage.getItem(professionalResultsKey) === null) writeJson(professionalResultsKey, { schemaVersion: 1, days: {} });
  if (localStorage.getItem(englishWordRecordsKey) === null) writeJson(englishWordRecordsKey, []);
  if (localStorage.getItem(englishReadingRecordsKey) === null) writeJson(englishReadingRecordsKey, []);
  if (localStorage.getItem(politicsRecordsKey) === null) writeJson(politicsRecordsKey, []);
  if (localStorage.getItem(errorLogKey) === null) writeJson(errorLogKey, []);
  if (localStorage.getItem(uiPreferencesKey) === null) writeJson(uiPreferencesKey, {
    hideLowFrequencyModules: true,
    autoCollapseSystemTools: true,
    showAiUsageLog: false,
    showAiCostEstimate: false,
    showRecentCommands: false,
  });
  if (localStorage.getItem(appDataSchemaVersionKey) === null) {
    localStorage.setItem(appDataSchemaVersionKey, hadStoredData ? "6.0" : currentAppDataSchemaVersion);
  }
  if (!hadStoredData && localStorage.getItem(migrationStateKey) === null) {
    writeJson(migrationStateKey, {
      migrationId: P1_ENGLISH_POLITICS_MIGRATION_ID,
      status: "completed",
      source: "fresh-install",
      targetVersion: currentAppDataSchemaVersion,
      completedAt: new Date().toISOString(),
    });
  }
}
