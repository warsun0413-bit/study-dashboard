// v6.0 complete localStorage export and validated restore.
function downloadFile(filename, content, type = "application/octet-stream") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readAllLocalStorage() {
  const data = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) data[key] = localStorage.getItem(key);
  }
  return data;
}

function downloadJsonBackup() {
  const exportedAt = new Date().toISOString();
  const backup = {
    type: "study-dashboard-full-localStorage-backup",
    version: APP_VERSION,
    appDataSchemaVersion: localStorage.getItem(appDataSchemaVersionKey) || currentAppDataSchemaVersion,
    exportedAt,
    localStorage: readAllLocalStorage(),
  };
  downloadFile(`学习面板完整备份-${getDateKey()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
  localStorage.setItem(lastBackupKey, exportedAt);
  localStorage.setItem(lastFullBackupKey, exportedAt);
  setStatus("#backupStatus", `完整 JSON 已导出，共 ${Object.keys(backup.localStorage).length} 个字段。`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const NANKAI_PLAN_TYPE = "nankai-marxism-exam-plan";
const NANKAI_PLAN_SCHEMA_VERSION = 2;
const NANKAI_PLAN_REQUIRED_TASKS = ["722", "844", "english", "politics", "outputOrMock", "originalTextOrReview", "training"];
let pendingPlanImport = null;

function looksLikeStudyPlan(value) {
  return isPlainObject(value) && (
    Object.prototype.hasOwnProperty.call(value, "planType")
    || (Object.prototype.hasOwnProperty.call(value, "schemaVersion") && isPlainObject(value.dailyPlans) && Array.isArray(value.fixedSchedule))
  );
}

function isNankaiPlanV2(value) {
  return isPlainObject(value) && value.schemaVersion === NANKAI_PLAN_SCHEMA_VERSION && value.planType === NANKAI_PLAN_TYPE;
}

function validateNankaiPlanV2(plan) {
  const requiredFields = [
    "tentativeExamDates", "currentProgress", "coreMilestones", "phases", "weeklyPlans",
    "fixedSchedule", "weeklyCycle", "dailyPlans", "checkpointsAndMocks", "sourcesAndAssumptions",
  ];
  if (plan.startDate !== "2026-07-18") throw new Error("新版计划 startDate 必须是 2026-07-18。");
  requiredFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(plan, field)) throw new Error(`新版计划缺少字段：${field}。`);
  });
  if (!isPlainObject(plan.dailyPlans)) throw new Error("新版计划 dailyPlans 必须是按日期存储的对象。");
  const entries = Object.entries(plan.dailyPlans);
  if (!entries.length) throw new Error("新版计划 dailyPlans 为空。");
  entries.forEach(([dateKey, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !isPlainObject(day) || !isPlainObject(day.tasks)) {
      throw new Error(`dailyPlans 中的 ${dateKey} 结构无效。`);
    }
    if (typeof day.weekday !== "string" || typeof day.phase !== "string" || !Number.isFinite(Number(day.targetEffectiveStudyHours))) {
      throw new Error(`dailyPlans[${dateKey}] 缺少星期、阶段或目标学习时长。`);
    }
    NANKAI_PLAN_REQUIRED_TASKS.forEach((taskKey) => {
      const task = day.tasks[taskKey];
      if (!isPlainObject(task) || typeof task.description !== "string" || !task.description.trim()) {
        throw new Error(`dailyPlans[${dateKey}].tasks.${taskKey} 无有效说明。`);
      }
    });
    if (typeof day.defaultStatus !== "string") throw new Error(`dailyPlans[${dateKey}] 缺少 defaultStatus。`);
  });
  return entries;
}

function getNextDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return getDateKey(date);
}

function importNankaiPlanV2(plan) {
  validateNankaiPlanV2(plan);
  const today = getDateKey();
  const existingPlans = readDailyPlans();
  const preview = buildPlanImportPreview(plan, existingPlans, today);
  pendingPlanImport = { plan, today, existingPlansJson: JSON.stringify(existingPlans), preview };
  renderPlanImportPreview(preview);
  setStatus("#backupStatus", "计划已校验，尚未写入。请先核对差异预览。 ");
}

function getPlanImportDecisionLabels() {
  return { "keep-local": "保留本地", "use-import": "采用导入", "fill-empty": "仅填充空字段", skip: "跳过" };
}

function renderPlanImportPreview(preview) {
  const dialog = document.querySelector("#planImportPreviewDialog");
  const summary = document.querySelector("#planImportPreviewSummary");
  const conflicts = document.querySelector("#planImportConflicts");
  const labels = getPlanImportDecisionLabels();
  summary.innerHTML = "";
  [
    ["详细计划窗口", `${preview.window.windowStart} 至 ${preview.window.windowEnd}`],
    ["新增日期", preview.newDates.length],
    ["新增任务", preview.newTasks.length],
    ["更新任务", preview.updatedTasks.length],
    ["跳过历史日期", preview.skippedHistoryDates.length],
    ["远期日期转阶段模板", preview.farDatesConverted.length],
    ["已完成冲突", preview.completedConflicts.length],
    ["进行中冲突", preview.inProgressConflicts.length],
    ["人工编辑冲突", preview.manualEditedConflicts.length],
    ["无法稳定匹配", preview.unmatchedConflicts.length],
    ["保留自定义任务", preview.customTasks.length],
    ["保留本地值", preview.keepLocal.length],
    ["采用导入值", preview.useImport.length],
    ["生成阶段模板", preview.phaseTemplates.length],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    summary.appendChild(row);
  });
  conflicts.innerHTML = "";
  if (!preview.conflicts.length) {
    conflicts.innerHTML = '<p class="muted">没有需要人工选择的受保护任务冲突。</p>';
  } else {
    preview.conflicts.forEach((conflict) => {
      const row = document.createElement("label");
      row.className = "plan-import-conflict";
      const text = document.createElement("span");
      text.textContent = `${conflict.date}｜${conflict.localTask.name || conflict.localTask.taskId || conflict.localTask.id}｜${conflict.type}`;
      const select = document.createElement("select");
      select.dataset.conflictId = conflict.id;
      PLAN_IMPORT_DECISIONS.forEach((decision) => {
        const option = document.createElement("option");
        option.value = decision;
        option.textContent = labels[decision];
        option.selected = decision === conflict.decision;
        select.appendChild(option);
      });
      row.append(text, select);
      conflicts.appendChild(row);
    });
  }
  dialog.hidden = false;
}

function refreshPendingPlanPreviewFromSelections() {
  if (!pendingPlanImport) return null;
  const decisions = {};
  document.querySelectorAll("#planImportConflicts [data-conflict-id]").forEach((select) => { decisions[select.dataset.conflictId] = select.value; });
  pendingPlanImport.preview = buildPlanImportPreview(
    pendingPlanImport.plan,
    JSON.parse(pendingPlanImport.existingPlansJson),
    pendingPlanImport.today,
    decisions,
  );
  return pendingPlanImport.preview;
}

function cancelPlanImportPreview() {
  pendingPlanImport = null;
  document.querySelector("#planImportPreviewDialog").hidden = true;
  setStatus("#backupStatus", "已取消计划导入，未写入任何数据。 ");
}

function applyPlanImportPreview() {
  if (!pendingPlanImport) return;
  if (JSON.stringify(readDailyPlans()) !== pendingPlanImport.existingPlansJson) {
    const plan = pendingPlanImport.plan;
    pendingPlanImport = null;
    importNankaiPlanV2(plan);
    setStatus("#backupStatus", "预览期间本地计划发生变化，已重新生成差异；请再次确认。", true);
    return;
  }
  const preview = refreshPendingPlanPreviewFromSelections();
  const currentSnapshot = readRawStorageSnapshot();
  const targetSnapshot = {
    ...currentSnapshot,
    [dailyPlansKey]: JSON.stringify(preview.result.dailyPlans),
    [planPhaseTemplatesKey]: JSON.stringify(preview.result.phaseTemplates),
    [planWindowStateKey]: JSON.stringify(makePlanWindowState(pendingPlanImport.today)),
    [importedPlanKey]: JSON.stringify({
      planType: pendingPlanImport.plan.planType,
      schemaVersion: pendingPlanImport.plan.schemaVersion,
      startDate: pendingPlanImport.plan.startDate,
      importedAt: new Date().toISOString(),
      detailedWindowStart: preview.window.windowStart,
      detailedWindowEnd: preview.window.windowEnd,
    }),
  };
  applyStorageSnapshotTransaction(targetSnapshot, "p0-plan-import-v1", false);
  pendingPlanImport = null;
  document.querySelector("#planImportPreviewDialog").hidden = true;
  renderTasks();
  renderRecentSevenDays();
  renderExamStatsConfig();
  renderExamStatsOverview();
  setStatus("#backupStatus", `计划已应用：详细窗口 ${preview.window.windowStart} 至 ${preview.window.windowEnd}；远期 ${preview.farDatesConverted.length} 天已转为阶段模板。`);
}

function normalizeBackup(backup) {
  if (!isPlainObject(backup)) throw new Error("备份根节点必须是对象。 ");
  if (isPlainObject(backup.localStorage)) return backup.localStorage;
  if (backup.type === "raw-localStorage-backup" && isPlainObject(backup.rawLocalStorage)) return backup.rawLocalStorage;

  // Compatibility with structured backups produced before v6.0.
  if (!isPlainObject(backup.tasks) || !isPlainObject(backup.reviewFields) || !Array.isArray(backup.history)) {
    throw new Error("不是受支持的完整备份或旧版结构化备份。 ");
  }
  const values = {};
  Object.entries(backup.tasks).forEach(([key, value]) => { values[key] = value === "done" ? "done" : "todo"; });
  Object.entries(backup.reviewFields).forEach(([key, value]) => { values[key] = String(value ?? ""); });
  values[historyKey] = JSON.stringify(backup.history);
  const mappings = {
    reviewQueue: "reviewQueue", essayRecords: "essayRecords", essayCritiqueRecords: "essayCritiqueRecords",
    essayTrainingSessions: "essayTrainingSessions", nankaiEssayQuestionBank: "nankaiEssayQuestionBank",
    todayEssayDraw: "todayEssayDraw", offlineAiAdviceDraft: "offlineAiAdviceDraft",
    offlineAiAdviceRecords: "offlineAiAdviceRecords", deepseekUsageRecords: "deepseekUsageRecords",
    supportCards: "supportCards", regressionTestRecords: "regressionTestRecords",
    automatedTestRecords: "automatedTestRecords", maintenancePromptRecords: "maintenancePromptRecords",
    userPreferences: "userPreferences", focusModeState: "focusModeState", focusSessionRecords: "focusSessionRecords",
    collapsedSections: "collapsedSections",
    studyManualTimeRecords: manualTimeRecordsKey, studyDailyTargetSeconds: dailyStudyTargetsKey,
    studyExamStatsConfig: examStatsConfigKey, studyImportedPlan: importedPlanKey,
    studyProfessionalResults: professionalResultsKey,
    studyPlanPhaseTemplates: planPhaseTemplatesKey,
    studyPlanWindowState: planWindowStateKey,
    studyPlanMigrationBackups: planMigrationBackupsKey,
  };
  Object.entries(mappings).forEach(([field, key]) => {
    if (Object.prototype.hasOwnProperty.call(backup, field)) values[key] = JSON.stringify(backup[field]);
  });
  const strings = { lastActiveDate: "lastActiveDate", lastBackupAt: lastBackupKey, lastFullBackupAt: lastFullBackupKey, offlineAiPromptDraft: "offlineAiPromptDraft", appDataSchemaVersion: appDataSchemaVersionKey };
  Object.entries(strings).forEach(([field, key]) => {
    if (typeof backup[field] === "string") values[key] = backup[field];
  });
  return values;
}

function validateStorageValues(values) {
  if (!isPlainObject(values)) throw new Error("备份数据格式错误。 ");
  const entries = Object.entries(values);
  if (!entries.length) throw new Error("备份中没有可恢复字段。 ");
  for (const [key, value] of entries) {
    if (!key || typeof key !== "string") throw new Error("备份包含无效字段名。 ");
    if (value !== null && typeof value !== "string") throw new Error(`字段 ${key} 不是可恢复的字符串。`);
  }
  if (Object.prototype.hasOwnProperty.call(values, historyKey)) {
    try {
      const history = JSON.parse(values[historyKey]);
      if (!Array.isArray(history)) throw new Error();
    } catch {
      throw new Error("历史学习记录格式无效，已停止恢复。 ");
    }
  }
  return entries;
}

function restoreStorageValues(values) {
  const entries = validateStorageValues(values);
  const currentSnapshot = readRawStorageSnapshot();
  const restoredSnapshot = { ...currentSnapshot };
  entries.forEach(([key, value]) => { if (value !== null) restoredSnapshot[key] = value; });
  const migrated = migrateStorageSnapshot(restoredSnapshot, { source: "backup-restore", force: true, todayKey: getDateKey() });
  applyStorageSnapshotTransaction(migrated.values, "backup-restore", true);
  ensureDataSchema();
  renderTasks();
  loadReviewFields();
  restorePomodoroStateFromStorage();
  renderManualStudyRecords();
  renderStudyTimeSummary();
  renderExamStatsConfig();
  renderHistory();
  renderRecentSevenDays();
  renderMigrationReport();
  renderProfessionalResults();
  renderDueReviews();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  return entries.length;
}

async function importJsonBackup(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (isNankaiPlanV2(backup)) {
      importNankaiPlanV2(backup);
      return;
    }
    if (looksLikeStudyPlan(backup)) {
      throw new Error("不支持旧版计划；只接受 schemaVersion 2、planType 为 nankai-marxism-exam-plan 的新版网站导入计划。");
    }
    const values = normalizeBackup(backup);
    const entries = validateStorageValues(values);
    const confirmed = window.confirm(`备份校验通过，共 ${entries.length} 个字段。恢复只会写入备份包含的字段，不会清空其他数据。是否继续？`);
    if (!confirmed) {
      setStatus("#backupStatus", "已取消导入。 ");
      return;
    }
    const count = restoreStorageValues(values);
    setStatus("#backupStatus", `JSON 已安全恢复，共写入 ${count} 个字段。`);
  } catch (error) {
    setStatus("#backupStatus", `导入失败：${error.message || "JSON 文件无效"}`, true);
  }
}

function clearLearningData() {
  const firstConfirmed = window.confirm("这会清空今日计划、任务、专注时间和学习记录。其他未列入清理范围的数据不会删除。是否继续？");
  if (!firstConfirmed) return;
  const typed = window.prompt("请再次确认：输入“清空学习数据”后继续。此操作无法撤销。 ");
  if (typed !== "清空学习数据") {
    setStatus("#backupStatus", "二次确认未通过，未清空任何数据。 ");
    return;
  }
  const learningKeys = [historyKey, dailyPlansKey, planPhaseTemplatesKey, planWindowStateKey, planMigrationBackupsKey, focusMinutesKey, taskFocusSecondsKey, focusTimerStateKey, focusSessionsKey, manualTimeRecordsKey, dailyStudyTargetsKey, examStatsConfigKey, importedPlanKey];
  autoSaveFields.forEach((field) => learningKeys.push(field.dataset.save));
  defaultTasks.forEach(([id]) => learningKeys.push(id, `task-label:${id}`));
  [...new Set(learningKeys)].forEach((key) => localStorage.removeItem(key));
  ensureDataSchema();
  autoSaveFields.forEach((field) => { field.value = ""; });
  renderTasks();
  restorePomodoroStateFromStorage();
  renderManualStudyRecords();
  renderStudyTimeSummary();
  renderExamStatsConfig();
  renderHistory();
  renderRecentSevenDays();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  setStatus("#backupStatus", "学习数据已清空；旧模块数据未删除。 ");
}
