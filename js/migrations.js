// Trusted-execution migration chain: preserve P0, then add P1 result containers without inference.
const P1_OUTPUT_REVIEW_MIGRATION_ID = "p1-output-review-types-v1";
const P1_ANKI_MIGRATION_ID = "p1-anki-candidates-v1";
const P1_EXECUTION_DEBT_MIGRATION_ID = "p1-execution-debt-v1";
const TRUSTED_EXECUTION_MIGRATION_ID = P1_EXECUTION_DEBT_MIGRATION_ID;
const MIGRATION_APP_SCHEMA_KEY = typeof appDataSchemaVersionKey === "string" ? appDataSchemaVersionKey : "appDataSchemaVersion";
const MIGRATION_CURRENT_SCHEMA_VERSION = typeof currentAppDataSchemaVersion === "string" ? currentAppDataSchemaVersion : "8.3";
const MIGRATION_APP_VERSION = typeof APP_VERSION === "string" ? APP_VERSION : "8.3.0";
const MIGRATION_HISTORY_KEY = typeof historyKey === "string" ? historyKey : "review-history";
const MIGRATION_DAILY_PLANS_KEY = typeof dailyPlansKey === "string" ? dailyPlansKey : "studyDailyPlans";
const MIGRATION_PLAN_PHASE_TEMPLATES_KEY = typeof planPhaseTemplatesKey === "string" ? planPhaseTemplatesKey : "studyPlanPhaseTemplates";
const MIGRATION_PLAN_WINDOW_STATE_KEY = typeof planWindowStateKey === "string" ? planWindowStateKey : "studyPlanWindowState";
const MIGRATION_PLAN_BACKUPS_KEY = typeof planMigrationBackupsKey === "string" ? planMigrationBackupsKey : "studyPlanMigrationBackups";
const MIGRATION_FOCUS_TOTALS_KEY = typeof focusMinutesKey === "string" ? focusMinutesKey : "studyFocusSeconds";
const MIGRATION_TASK_FOCUS_TOTALS_KEY = typeof taskFocusSecondsKey === "string" ? taskFocusSecondsKey : "studyTaskFocusSeconds";
const MIGRATION_FOCUS_SESSIONS_KEY = typeof focusSessionsKey === "string" ? focusSessionsKey : "studyFocusSessions";
const MIGRATION_MANUAL_TIME_KEY = typeof manualTimeRecordsKey === "string" ? manualTimeRecordsKey : "studyManualTimeRecords";
const MIGRATION_DAILY_TARGETS_KEY = typeof dailyStudyTargetsKey === "string" ? dailyStudyTargetsKey : "studyDailyTargetSeconds";
const MIGRATION_EXAM_CONFIG_KEY = typeof examStatsConfigKey === "string" ? examStatsConfigKey : "studyExamStatsConfig";
const MIGRATION_REVIEW_QUEUE_KEY = typeof reviewQueueKey === "string" ? reviewQueueKey : "reviewQueue";
const MIGRATION_PRO_RESULTS_KEY = typeof professionalResultsKey === "string" ? professionalResultsKey : "studyProfessionalResults";
const MIGRATION_ENGLISH_WORD_RECORDS_KEY = typeof englishWordRecordsKey === "string" ? englishWordRecordsKey : "studyEnglishWordRecords";
const MIGRATION_ENGLISH_READING_RECORDS_KEY = typeof englishReadingRecordsKey === "string" ? englishReadingRecordsKey : "studyEnglishReadingRecords";
const MIGRATION_POLITICS_RECORDS_KEY = typeof politicsRecordsKey === "string" ? politicsRecordsKey : "studyPoliticsRecords";
const MIGRATION_OUTPUT_RECORDS_KEY = typeof outputRecordsKey === "string" ? outputRecordsKey : "studyOutputRecords";
const MIGRATION_ANKI_CANDIDATES_KEY = typeof ankiCandidatesKey === "string" ? ankiCandidatesKey : "studyAnkiCandidates";
const MIGRATION_EXECUTION_MODES_KEY = typeof executionModesKey === "string" ? executionModesKey : "studyExecutionModes";
const MIGRATION_DEBT_QUEUE_KEY = typeof debtQueueKey === "string" ? debtQueueKey : "studyDebtQueue";
const MIGRATION_LEGACY_BACKUP_KEY = typeof legacyBackupKey === "string" ? legacyBackupKey : "legacyBackup";
const MIGRATION_STATE_KEY = typeof migrationStateKey === "string" ? migrationStateKey : "studyMigrationState";
const MIGRATION_REPORTS_KEY = typeof migrationReportsKey === "string" ? migrationReportsKey : "studyMigrationReports";
const MIGRATION_ROLLBACK_KEY = typeof migrationRollbackKey === "string" ? migrationRollbackKey : "studyMigrationRollback";
const MIGRATION_ERROR_LOG_KEY = typeof errorLogKey === "string" ? errorLogKey : "studyErrorLog";
const MIGRATION_UI_PREFS_KEY = typeof uiPreferencesKey === "string" ? uiPreferencesKey : "studyUiPreferences";
const DEPRECATED_LEGACY_FIELDS = Object.freeze({
  "completed-today": "review-history", "unfinished-today": "review-history", "delayed-tasks": "review-history",
  "learned-today": "review-history", "tomorrow-priority": "review-history",
  "today-1": "studyDailyPlans", "today-2": "studyDailyPlans", "today-3": "studyDailyPlans", "today-4": "studyDailyPlans", "today-5": "studyDailyPlans", "today-6": "studyDailyPlans",
  "english-1": "studyDailyPlans", "english-2": "studyDailyPlans", "english-3": "studyDailyPlans",
  "major-1": "studyDailyPlans", "major-2": "studyDailyPlans", "major-3": "studyDailyPlans",
  "daily-score": "review-history", "study-mode": "", focusModeState: "studyFocusTimerState",
  offlineAiPromptDraft: "", offlineAiAdviceRecords: "", deepseekUsageRecords: "", supportCards: "",
  essayRecords: "", essayCritiqueRecords: "", essayTrainingSessions: "", nankaiEssayQuestionBank: "",
  automatedTestRecords: "", regressionTestRecords: "", commandPaletteRecords: "", frontendErrorLogs: "studyErrorLog",
  userPreferences: "studyUiPreferences", collapsedSections: "studyUiPreferences",
});
const KNOWN_ERROR_LOG_KEYS = [MIGRATION_ERROR_LOG_KEY, "errorLogs", "errorLog", "errors", "appErrors", "systemErrorLogs"];
const DEFAULT_TRUSTED_UI_PREFERENCES = {
  hideLowFrequencyModules: true,
  autoCollapseSystemTools: true,
  showAiUsageLog: false,
  showAiCostEstimate: false,
  showRecentCommands: false,
};
let latestMigrationRuntimeReport = null;

function parseStoredJson(value, fallback) {
  try { return typeof value === "string" ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function isStoredObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRawStorageSnapshot() {
  const snapshot = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && key !== MIGRATION_ROLLBACK_KEY) snapshot[key] = localStorage.getItem(key);
  }
  return snapshot;
}

function normalizeDateTotals(value) {
  if (!isStoredObject(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([date, seconds]) => [date, Math.max(0, Math.floor(Number(seconds) || 0))]));
}

function normalizeTaskDateTotals(value) {
  if (!isStoredObject(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([date, totals]) => [date, normalizeDateTotals(totals)]));
}

function getMigrationCounts(values) {
  const history = parseStoredJson(values[MIGRATION_HISTORY_KEY], []);
  const plans = parseStoredJson(values[MIGRATION_DAILY_PLANS_KEY], {});
  const sessions = parseStoredJson(values[MIGRATION_FOCUS_SESSIONS_KEY], []);
  const manual = parseStoredJson(values[MIGRATION_MANUAL_TIME_KEY], []);
  const reviews = parseStoredJson(values[MIGRATION_REVIEW_QUEUE_KEY], []);
  const professional = parseStoredJson(values[MIGRATION_PRO_RESULTS_KEY], {});
  return {
    storageKeys: Object.keys(values).length,
    historyRecords: Array.isArray(history) ? history.length : 0,
    dailyPlans: isStoredObject(plans) ? Object.keys(plans).length : 0,
    focusSessions: Array.isArray(sessions) ? sessions.length : 0,
    manualTimeRecords: Array.isArray(manual) ? manual.length : 0,
    reviewQueue: Array.isArray(reviews) ? reviews.length : 0,
    professionalResultDays: isStoredObject(professional && professional.days)
      ? Object.keys(professional.days).length
      : isStoredObject(professional) ? Object.keys(professional).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)).length : 0,
    englishWordRecords: Array.isArray(parseStoredJson(values[MIGRATION_ENGLISH_WORD_RECORDS_KEY], [])) ? parseStoredJson(values[MIGRATION_ENGLISH_WORD_RECORDS_KEY], []).length : 0,
    englishReadingRecords: Array.isArray(parseStoredJson(values[MIGRATION_ENGLISH_READING_RECORDS_KEY], [])) ? parseStoredJson(values[MIGRATION_ENGLISH_READING_RECORDS_KEY], []).length : 0,
    politicsRecords: Array.isArray(parseStoredJson(values[MIGRATION_POLITICS_RECORDS_KEY], [])) ? parseStoredJson(values[MIGRATION_POLITICS_RECORDS_KEY], []).length : 0,
    outputRecords: Array.isArray(parseStoredJson(values[MIGRATION_OUTPUT_RECORDS_KEY], [])) ? parseStoredJson(values[MIGRATION_OUTPUT_RECORDS_KEY], []).length : 0,
    ankiCandidates: Array.isArray(parseStoredJson(values[MIGRATION_ANKI_CANDIDATES_KEY], [])) ? parseStoredJson(values[MIGRATION_ANKI_CANDIDATES_KEY], []).length : 0,
    debtRecords: Array.isArray(parseStoredJson(values[MIGRATION_DEBT_QUEUE_KEY], [])) ? parseStoredJson(values[MIGRATION_DEBT_QUEUE_KEY], []).length : 0,
  };
}

function getLatestActualDate(values, todayKey) {
  return getLatestP0FormalActivityDate({
    history: parseStoredJson(values[MIGRATION_HISTORY_KEY], []),
    focusTotals: parseStoredJson(values[MIGRATION_FOCUS_TOTALS_KEY], {}),
    taskFocusTotals: parseStoredJson(values[MIGRATION_TASK_FOCUS_TOTALS_KEY], {}),
    manualRecords: parseStoredJson(values[MIGRATION_MANUAL_TIME_KEY], []),
    focusSessions: parseStoredJson(values[MIGRATION_FOCUS_SESSIONS_KEY], []),
    professionalStore: parseStoredJson(values[MIGRATION_PRO_RESULTS_KEY], {}),
    reviewQueue: parseStoredJson(values[MIGRATION_REVIEW_QUEUE_KEY], []),
    dailyPlans: parseStoredJson(values[MIGRATION_DAILY_PLANS_KEY], {}),
  }, todayKey);
}

function migrateStorageSnapshot(snapshot, options = {}) {
  const now = options.now || new Date().toISOString();
  const todayKey = options.todayKey || getLocalPlanDateKey(new Date());
  const source = { ...(snapshot || {}) };
  delete source[MIGRATION_ROLLBACK_KEY];
  const existingState = parseStoredJson(source[MIGRATION_STATE_KEY], {});
  if (!options.force
    && source[MIGRATION_APP_SCHEMA_KEY] === MIGRATION_CURRENT_SCHEMA_VERSION
    && existingState.migrationId === TRUSTED_EXECUTION_MIGRATION_ID
    && existingState.status === "completed") {
    return {
      values: source,
      changedKeys: [],
      report: { migrationId: TRUSTED_EXECUTION_MIGRATION_ID, status: "skipped", reason: "already-completed", checkedAt: now },
    };
  }

  const values = { ...source };
  const beforeCounts = getMigrationCounts(source);
  const requireArrayOrDefault = (key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) { values[key] = "[]"; return []; }
    const parsed = parseStoredJson(values[key], null);
    if (!Array.isArray(parsed)) throw new Error(`迁移已停止：字段 ${key} 不是数组。`);
    return parsed;
  };
  const requireObjectOrDefault = (key, defaultValue = {}) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) { values[key] = JSON.stringify(defaultValue); return defaultValue; }
    const parsed = parseStoredJson(values[key], null);
    if (!isStoredObject(parsed)) throw new Error(`迁移已停止：字段 ${key} 不是对象。`);
    return parsed;
  };
  requireArrayOrDefault(MIGRATION_HISTORY_KEY);
  const dailyPlansBefore = requireObjectOrDefault(MIGRATION_DAILY_PLANS_KEY);
  const phaseTemplatesBefore = requireArrayOrDefault(MIGRATION_PLAN_PHASE_TEMPLATES_KEY);
  const planBackupsBefore = requireObjectOrDefault(MIGRATION_PLAN_BACKUPS_KEY);
  requireArrayOrDefault(MIGRATION_MANUAL_TIME_KEY);
  const reviewQueueBefore = requireArrayOrDefault(MIGRATION_REVIEW_QUEUE_KEY);
  const professionalResultsBefore = requireObjectOrDefault(MIGRATION_PRO_RESULTS_KEY);
  requireArrayOrDefault(MIGRATION_ENGLISH_WORD_RECORDS_KEY);
  requireArrayOrDefault(MIGRATION_ENGLISH_READING_RECORDS_KEY);
  requireArrayOrDefault(MIGRATION_POLITICS_RECORDS_KEY);
  requireArrayOrDefault(MIGRATION_OUTPUT_RECORDS_KEY);
  requireArrayOrDefault(MIGRATION_ANKI_CANDIDATES_KEY);
  requireObjectOrDefault(MIGRATION_EXECUTION_MODES_KEY, { schemaVersion: 1, days: {} });
  requireArrayOrDefault(MIGRATION_DEBT_QUEUE_KEY);
  requireObjectOrDefault(MIGRATION_DAILY_TARGETS_KEY);
  requireObjectOrDefault(MIGRATION_EXAM_CONFIG_KEY, { startDate: "2026-07-18" });
  const legacy = parseStoredJson(values[MIGRATION_LEGACY_BACKUP_KEY], {});
  const safeLegacy = isStoredObject(legacy) ? legacy : {};
  safeLegacy.schemaVersion = 1;
  safeLegacy.fields = isStoredObject(safeLegacy.fields) ? safeLegacy.fields : {};
  safeLegacy.migrations = Array.isArray(safeLegacy.migrations) ? safeLegacy.migrations : [];
  safeLegacy.migratedAt = safeLegacy.migratedAt || now;
  const archivedKeys = [];
  Object.entries(DEPRECATED_LEGACY_FIELDS).forEach(([key, replacedBy]) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    if (!Object.prototype.hasOwnProperty.call(safeLegacy.fields, key)) {
      safeLegacy.fields[key] = { value: values[key], status: "deprecated", replacedBy, migratedAt: now };
    } else {
      safeLegacy.fields[key] = {
        ...safeLegacy.fields[key],
        status: "deprecated",
        replacedBy: Object.prototype.hasOwnProperty.call(safeLegacy.fields[key], "replacedBy") ? safeLegacy.fields[key].replacedBy : replacedBy,
        migratedAt: safeLegacy.fields[key].migratedAt || safeLegacy.fields[key].archivedAt || now,
      };
    }
    delete values[key];
    archivedKeys.push(key);
  });
  Object.entries(DEPRECATED_LEGACY_FIELDS).forEach(([key, replacedBy]) => {
    if (!Object.prototype.hasOwnProperty.call(safeLegacy.fields, key)) return;
    safeLegacy.fields[key] = {
      ...safeLegacy.fields[key],
      status: "deprecated",
      replacedBy: safeLegacy.fields[key].replacedBy || replacedBy,
      migratedAt: safeLegacy.fields[key].migratedAt || safeLegacy.fields[key].archivedAt || now,
    };
  });

  const previousLastActiveDate = values.lastActiveDate || "";
  if (Object.prototype.hasOwnProperty.call(values, "lastActiveDate") && !safeLegacy.fields.lastActiveDate) {
    safeLegacy.fields.lastActiveDate = { value: values.lastActiveDate, status: "deprecated", replacedBy: "derived-from-formal-records", migratedAt: now };
  }
  const latestActualDate = getLatestActualDate(values, todayKey);
  if (latestActualDate) values.lastActiveDate = latestActualDate;
  else delete values.lastActiveDate;
  if (previousLastActiveDate !== latestActualDate && !safeLegacy.migrations.some((entry) => entry && entry.migrationId === P0_FINAL_MIGRATION_ID && entry.key === "lastActiveDate")) {
    safeLegacy.migrations.push({ migrationId: P0_FINAL_MIGRATION_ID, key: "lastActiveDate", previousValue: previousLastActiveDate, derivedValue: latestActualDate, migratedAt: now });
  }

  const rawSessions = requireArrayOrDefault(MIGRATION_FOCUS_SESSIONS_KEY);
  const observedZeroFocusSessions = rawSessions.filter((session) => !session || Math.floor(Number(session.seconds) || 0) <= 0).length;
  values[MIGRATION_FOCUS_TOTALS_KEY] = JSON.stringify(normalizeDateTotals(requireObjectOrDefault(MIGRATION_FOCUS_TOTALS_KEY)));
  values[MIGRATION_TASK_FOCUS_TOTALS_KEY] = JSON.stringify(normalizeTaskDateTotals(requireObjectOrDefault(MIGRATION_TASK_FOCUS_TOTALS_KEY)));
  const normalizedReviewQueue = typeof normalizeReviewQueueRecords === "function"
    ? normalizeReviewQueueRecords(reviewQueueBefore)
    : reviewQueueBefore;
  const normalizedProfessionalResults = typeof normalizeProfessionalResultsStore === "function"
    ? normalizeProfessionalResultsStore(professionalResultsBefore)
    : professionalResultsBefore;
  values[MIGRATION_REVIEW_QUEUE_KEY] = JSON.stringify(normalizedReviewQueue);
  values[MIGRATION_PRO_RESULTS_KEY] = JSON.stringify(normalizedProfessionalResults);
  const cancelledDuplicateReviews = normalizedReviewQueue.filter((record) => record && record.duplicateOf).length;

  const trimmedErrors = 0;

  if (!Object.prototype.hasOwnProperty.call(values, MIGRATION_ERROR_LOG_KEY)) values[MIGRATION_ERROR_LOG_KEY] = "[]";
  const uiPreferences = parseStoredJson(values[MIGRATION_UI_PREFS_KEY], {});
  values[MIGRATION_UI_PREFS_KEY] = JSON.stringify({ ...DEFAULT_TRUSTED_UI_PREFERENCES, ...(isStoredObject(uiPreferences) ? uiPreferences : {}) });
  values[MIGRATION_LEGACY_BACKUP_KEY] = JSON.stringify(safeLegacy);
  const generatedPhaseTemplates = phaseTemplatesBefore.length
    ? phaseTemplatesBefore
    : buildPhaseTemplatesFromDailyPlans(dailyPlansBefore);
  const planWindowMigration = migrateDetailedPlanWindow(dailyPlansBefore, generatedPhaseTemplates, todayKey);
  const planBackups = { ...planBackupsBefore };
  if (Object.keys(planWindowMigration.archivedFarPlans).length && !planBackups[PLAN_WINDOW_MIGRATION_ID]) {
    planBackups[PLAN_WINDOW_MIGRATION_ID] = {
      schemaVersion: PLAN_WINDOW_SCHEMA_VERSION,
      migrationId: PLAN_WINDOW_MIGRATION_ID,
      createdAt: now,
      window: planWindowMigration.window,
      farDailyPlans: planWindowMigration.archivedFarPlans,
      phaseTemplatesBefore,
    };
  }
  values[MIGRATION_DAILY_PLANS_KEY] = JSON.stringify(planWindowMigration.dailyPlans);
  values[MIGRATION_PLAN_PHASE_TEMPLATES_KEY] = JSON.stringify(generatedPhaseTemplates);
  values[MIGRATION_PLAN_WINDOW_STATE_KEY] = JSON.stringify(makePlanWindowState(todayKey));
  values[MIGRATION_PLAN_BACKUPS_KEY] = JSON.stringify(planBackups);
  values[MIGRATION_APP_SCHEMA_KEY] = MIGRATION_CURRENT_SCHEMA_VERSION;

  const report = {
    migrationId: TRUSTED_EXECUTION_MIGRATION_ID,
    status: "completed",
    source: options.source || "manual",
    fromVersion: source[MIGRATION_APP_SCHEMA_KEY] || "unknown",
    toVersion: MIGRATION_CURRENT_SCHEMA_VERSION,
    startedAt: now,
    completedAt: now,
    beforeCounts,
    afterCounts: null,
    archivedKeys,
    deferredActiveLegacyKeys: [],
    observedZeroFocusSessions,
    planWindow: planWindowMigration.window,
    detailedPlansArchived: Object.keys(planWindowMigration.archivedFarPlans).length,
    phaseTemplatesCreated: generatedPhaseTemplates.length,
    trimmedErrors,
    cancelledDuplicateReviews,
    lastActiveDateBefore: previousLastActiveDate,
    lastActiveDateAfter: latestActualDate,
  };
  values[MIGRATION_STATE_KEY] = JSON.stringify({
    migrationId: TRUSTED_EXECUTION_MIGRATION_ID,
    status: "completed",
    source: report.source,
    targetVersion: MIGRATION_CURRENT_SCHEMA_VERSION,
    completedAt: now,
  });
  const previousReports = parseStoredJson(values[MIGRATION_REPORTS_KEY], []);
  values[MIGRATION_REPORTS_KEY] = JSON.stringify([...(Array.isArray(previousReports) ? previousReports : []), report].slice(-20));
  report.afterCounts = getMigrationCounts(values);
  values[MIGRATION_REPORTS_KEY] = JSON.stringify([...(Array.isArray(previousReports) ? previousReports : []), report].slice(-20));

  const changedKeys = [...new Set([...Object.keys(source), ...Object.keys(values)])]
    .filter((key) => (Object.prototype.hasOwnProperty.call(source, key) ? source[key] : null) !== (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null));
  return { values, report, changedKeys };
}

function buildStorageChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => key !== MIGRATION_ROLLBACK_KEY)
    .map((key) => ({
      key,
      beforeValue: Object.prototype.hasOwnProperty.call(before, key) ? before[key] : null,
      afterValue: Object.prototype.hasOwnProperty.call(after, key) ? after[key] : null,
    }))
    .filter((change) => change.beforeValue !== change.afterValue);
}

function downloadPreMigrationBackup(snapshot, operationId) {
  const exportedAt = new Date().toISOString();
  const backup = {
    type: "study-dashboard-full-localStorage-backup",
    version: MIGRATION_APP_VERSION,
    appDataSchemaVersion: snapshot[MIGRATION_APP_SCHEMA_KEY] || "unknown",
    exportedAt,
    reason: operationId,
    localStorage: snapshot,
  };
  downloadFile(`学习面板迁移前完整备份-${getDateKey()}-${Date.now()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}

function applyStorageSnapshotTransaction(targetSnapshot, operationId, downloadBackup = true) {
  const before = readRawStorageSnapshot();
  const changes = buildStorageChanges(before, targetSnapshot);
  if (!changes.length) return { changedKeys: 0, status: "unchanged" };
  if (downloadBackup) downloadPreMigrationBackup(before, operationId);
  const rollback = {
    migrationId: operationId,
    createdAt: new Date().toISOString(),
    changes,
  };
  localStorage.setItem(MIGRATION_ROLLBACK_KEY, JSON.stringify(rollback));
  const applied = [];
  try {
    changes.forEach((change) => {
      if (change.afterValue === null) localStorage.removeItem(change.key);
      else localStorage.setItem(change.key, change.afterValue);
      applied.push(change);
    });
    return { changedKeys: changes.length, status: "completed" };
  } catch (error) {
    [...applied].reverse().forEach((change) => {
      if (change.beforeValue === null) localStorage.removeItem(change.key);
      else localStorage.setItem(change.key, change.beforeValue);
    });
    throw error;
  }
}

function runDataMigrations(options = {}) {
  try {
    const snapshot = readRawStorageSnapshot();
    if (!Object.keys(snapshot).length) {
      latestMigrationRuntimeReport = { migrationId: TRUSTED_EXECUTION_MIGRATION_ID, status: "fresh-install", source: options.source || "app-start" };
      return latestMigrationRuntimeReport;
    }
    const result = migrateStorageSnapshot(snapshot, options);
    if (result.changedKeys.length) applyStorageSnapshotTransaction(result.values, TRUSTED_EXECUTION_MIGRATION_ID, true);
    latestMigrationRuntimeReport = result.report;
    return result.report;
  } catch (error) {
    latestMigrationRuntimeReport = {
      migrationId: TRUSTED_EXECUTION_MIGRATION_ID,
      status: "failed",
      source: options.source || "app-start",
      message: error.message || "迁移失败",
      failedAt: new Date().toISOString(),
    };
    console.error("数据迁移失败，原数据未改动。", error);
    return latestMigrationRuntimeReport;
  }
}

function renderMigrationReport() {
  const container = document.querySelector("#migrationReport");
  if (!container) return;
  const reports = readJson(MIGRATION_REPORTS_KEY, []);
  const latest = Array.isArray(reports) ? reports.at(-1) : null;
  const state = readJson(MIGRATION_STATE_KEY, {});
  const displayReport = latestMigrationRuntimeReport && latestMigrationRuntimeReport.status === "failed"
    ? latestMigrationRuntimeReport
    : latest || latestMigrationRuntimeReport || { migrationId: state.migrationId || "none", status: state.status || "not-run", schemaVersion: localStorage.getItem(MIGRATION_APP_SCHEMA_KEY) };
  container.textContent = JSON.stringify(displayReport, null, 2);
  document.querySelector("#rollbackMigrationBtn").disabled = localStorage.getItem(MIGRATION_ROLLBACK_KEY) === null;
}

function rollbackLastMigration() {
  const rollback = readJson(MIGRATION_ROLLBACK_KEY, null);
  if (!rollback || !Array.isArray(rollback.changes)) return setStatus("#migrationStatus", "没有可回滚的迁移记录。", true);
  const conflicts = rollback.changes.filter((change) => localStorage.getItem(change.key) !== change.afterValue);
  if (conflicts.length) {
    return setStatus("#migrationStatus", `迁移后已有 ${conflicts.length} 个相关字段发生新变化，为避免覆盖新数据，已拒绝回滚。`, true);
  }
  if (!window.confirm(`将回滚 ${rollback.changes.length} 个迁移字段。仅在迁移后尚未产生新学习数据时执行。是否继续？`)) return;
  rollback.changes.slice().reverse().forEach((change) => {
    if (change.beforeValue === null) localStorage.removeItem(change.key);
    else localStorage.setItem(change.key, change.beforeValue);
  });
  localStorage.removeItem(MIGRATION_ROLLBACK_KEY);
  setStatus("#migrationStatus", "最近迁移已回滚。请刷新页面确认旧数据。 ");
  renderMigrationReport();
}

function bindMigrationControls() {
  renderMigrationReport();
  document.querySelector("#rollbackMigrationBtn").addEventListener("click", rollbackLastMigration);
}
