// P0 Checkpoint 4: pure seven-day plan window, phase templates, and import preview.
const PLAN_WINDOW_SCHEMA_VERSION = 1;
const PLAN_WINDOW_MIGRATION_ID = "p0-plan-window-v1";
const PLAN_WINDOW_DAYS = 7;
const PLAN_IMPORT_DECISIONS = ["keep-local", "use-import", "fill-empty", "skip"];
const PLAN_WINDOW_TASK_DEFINITIONS = [
  { taskId: "plan-english", sourceTaskKey: "english", subject: "英语", time: "08:00—10:00", name: "英语", counted: true, category: "english" },
  { taskId: "plan-722", sourceTaskKey: "722", subject: "722马原", time: "10:15—12:35", name: "722", counted: true, category: "maYuan" },
  { taskId: "plan-844", sourceTaskKey: "844", subject: "844马发史", time: "14:00—16:20", name: "844", counted: true, category: "maHistory" },
  { taskId: "plan-original-review", sourceTaskKey: "originalTextOrReview", subject: "综合复盘", time: "16:20—17:00", name: "原著 / D复盘", counted: true, category: "rollingReview" },
  { taskId: "plan-training", sourceTaskKey: "training", subject: "训练", time: "17:10—18:10", name: "训练", exercise: true, category: "exercise" },
  { taskId: "plan-politics", sourceTaskKey: "politics", subject: "公共政治", time: "19:10—20:10", name: "政治", counted: true, category: "politics" },
  { taskId: "plan-output", sourceTaskKey: "outputOrMock", subject: "专业课输出", time: "20:20—21:20", name: "输出", counted: true, category: "output" },
];
const P1_ENGLISH_PLAN_DEFINITION = PLAN_WINDOW_TASK_DEFINITIONS.find((definition) => definition.sourceTaskKey === "english");
if (P1_ENGLISH_PLAN_DEFINITION) {
  P1_ENGLISH_PLAN_DEFINITION.resultTrackingVersion = 1;
  P1_ENGLISH_PLAN_DEFINITION.subtasks = [
    { subtaskId: "words", title: "英语单词", required: true },
    { subtaskId: "reading", title: "英语阅读", required: true },
  ];
}

function isPlanObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlanDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function getLocalPlanDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalPlanDate(dateKey) {
  if (!isPlanDateKey(dateKey)) throw new Error(`无效本地日期：${dateKey}`);
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`无效本地日期：${dateKey}`);
  }
  return date;
}

function addLocalPlanDays(dateKey, days) {
  const date = parseLocalPlanDate(dateKey);
  date.setDate(date.getDate() + Number(days || 0));
  return getLocalPlanDateKey(date);
}

function getDetailedPlanWindow(todayKey) {
  const windowStart = getLocalPlanDateKey(parseLocalPlanDate(todayKey));
  const dates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, index) => addLocalPlanDays(windowStart, index));
  return { windowStart, windowEnd: dates.at(-1), dates };
}

function getTaskStatusForPlan(task) {
  if (task && ["not-started", "in-progress", "completed", "skipped"].includes(task.status)) return task.status;
  return task && task.completed === true ? "completed" : "not-started";
}

function createPlanTask(definition, sourceTask, defaultStatus = "未开始") {
  const description = String(sourceTask && sourceTask.description || sourceTask || "").trim();
  const status = defaultStatus === "已完成" ? "completed" : defaultStatus === "进行中" ? "in-progress" : "not-started";
  return {
    id: definition.taskId,
    taskId: definition.taskId,
    sourceTaskKey: definition.sourceTaskKey,
    subject: definition.subject,
    time: definition.time,
    name: definition.name,
    description,
    completionCriteria: String(sourceTask && (sourceTask.completionCriteria || sourceTask.minimumOutput) || "").trim(),
    status,
    manualEdited: false,
    actualResultRefs: [],
    counted: Boolean(definition.counted),
    exercise: Boolean(definition.exercise),
    category: definition.category,
    ...(definition.resultTrackingVersion ? {
      resultTrackingVersion: definition.resultTrackingVersion,
      subtasks: definition.subtasks.map((item) => ({ ...item })),
    } : {}),
    importedDescription: description,
  };
}

function getCompletionCriteriaFromSchedule(fixedSchedule, definition) {
  const moduleNames = {
    english: ["英语词汇", "英语"], "722": ["722"], "844": ["844"], originalTextOrReview: ["原著/D复盘"],
    training: ["训练"], politics: ["政治"], outputOrMock: ["输出"],
  }[definition.sourceTaskKey] || [];
  return (Array.isArray(fixedSchedule) ? fixedSchedule : [])
    .filter((entry) => moduleNames.includes(entry && entry.module))
    .map((entry) => String(entry.minimumOutput || "").trim()).filter(Boolean).join("；");
}

function createDetailedPlanFromSource(dateKey, sourceDay, fixedSchedule = []) {
  const tasks = PLAN_WINDOW_TASK_DEFINITIONS.map((definition) => createPlanTask(
    definition,
    {
      ...(sourceDay && sourceDay.tasks && sourceDay.tasks[definition.sourceTaskKey] || {}),
      completionCriteria: getCompletionCriteriaFromSchedule(fixedSchedule, definition),
    },
    sourceDay && sourceDay.defaultStatus,
  ));
  tasks.forEach((task) => { task.date = dateKey; });
  return {
    template: "nankai-plan-v2",
    sourcePlanType: "nankai-marxism-exam-plan",
    sourceSchemaVersion: 2,
    date: dateKey,
    weekday: String(sourceDay && sourceDay.weekday || ""),
    phase: String(sourceDay && sourceDay.phase || ""),
    targetEffectiveStudyHours: Number(sourceDay && sourceDay.targetEffectiveStudyHours) || 0,
    tasks,
    currentTaskId: "",
  };
}

function getPlanTaskMatch(localTasks, importedTask) {
  const tasks = Array.isArray(localTasks) ? localTasks : [];
  const importedTaskId = importedTask.taskId || importedTask.id;
  const byTaskId = tasks.find((task) => (task.taskId || task.id) === importedTaskId);
  if (byTaskId) return byTaskId;
  if (importedTask.sourceTaskKey) {
    const bySourceKey = tasks.find((task) => task.sourceTaskKey === importedTask.sourceTaskKey);
    if (bySourceKey) return bySourceKey;
  }
  if (importedTask.businessKey) return tasks.find((task) => task.businessKey === importedTask.businessKey) || null;
  return null;
}

function getConflictType(localTask) {
  if (!localTask) return "";
  if (getTaskStatusForPlan(localTask) === "completed") return "completed";
  if (getTaskStatusForPlan(localTask) === "in-progress") return "in-progress";
  if (localTask.manualEdited === true) return "manual-edited";
  return "";
}

function fillEmptyPlanFields(localTask, importedTask) {
  const result = { ...localTask };
  Object.entries(importedTask).forEach(([key, value]) => {
    if ((result[key] === "" || result[key] === null || result[key] === undefined) && value !== "" && value !== null && value !== undefined) result[key] = value;
  });
  return result;
}

function mergeImportedTask(localTask, importedTask, decision = "use-import") {
  if (!localTask) return { ...importedTask };
  if (decision === "keep-local" || decision === "skip") return { ...localTask };
  if (decision === "fill-empty") return fillEmptyPlanFields(localTask, importedTask);
  const localStatus = getTaskStatusForPlan(localTask);
  return {
    ...localTask,
    ...importedTask,
    status: localStatus,
    completed: localTask.completed,
    manualEdited: localTask.manualEdited === true,
    actualResultRefs: Array.isArray(localTask.actualResultRefs) ? localTask.actualResultRefs : [],
  };
}

function mergeImportedDay(dateKey, localDay, importedDay, decisions = {}) {
  if (!localDay || !Array.isArray(localDay.tasks)) return { day: importedDay, conflicts: [], customTasks: [], updates: importedDay.tasks.length };
  const conflicts = [];
  const ambiguousCustomTasks = [];
  const matchedLocal = new Set();
  const mergedTasks = importedDay.tasks.map((importedTask) => {
    let localTask = getPlanTaskMatch(localDay.tasks, importedTask);
    let conflictType = localTask ? getConflictType(localTask) : "";
    if (!localTask) {
      localTask = localDay.tasks.find((task) => !matchedLocal.has(task) && (
        (task.category && task.category === importedTask.category)
        || (task.name && task.name === importedTask.name)
      ));
      if (localTask) conflictType = "unmatched";
    }
    if (!localTask) return importedTask;
    matchedLocal.add(localTask);
    if (conflictType === "unmatched") ambiguousCustomTasks.push(localTask);
    const conflictId = `${dateKey}:${importedTask.taskId || importedTask.id}:${conflictType || "update"}`;
    const defaultDecision = conflictType ? "keep-local" : "use-import";
    const decision = PLAN_IMPORT_DECISIONS.includes(decisions[conflictId]) ? decisions[conflictId] : defaultDecision;
    if (conflictType) conflicts.push({ id: conflictId, date: dateKey, type: conflictType, localTask, importedTask, defaultDecision, decision });
    return mergeImportedTask(localTask, importedTask, decision);
  });
  const remainingCustomTasks = localDay.tasks.filter((task) => !matchedLocal.has(task));
  const customTasks = [...ambiguousCustomTasks, ...remainingCustomTasks];
  return {
    day: {
      ...localDay,
      ...importedDay,
      tasks: [...mergedTasks, ...remainingCustomTasks],
      currentTaskId: localDay.currentTaskId || "",
    },
    conflicts,
    customTasks,
    updates: mergedTasks.filter((task) => localDay.tasks.includes(task) === false).length,
  };
}

function findRepresentativeDay(dailyPlans, phase, predicate = () => true) {
  return Object.entries(dailyPlans || {})
    .filter(([dateKey, day]) => isPlanDateKey(dateKey) && day && day.phase === phase && predicate(dateKey, day))
    .sort(([left], [right]) => left.localeCompare(right))[0] || null;
}

function normalizeMilestone(milestone) {
  return isPlanObject(milestone) ? { ...milestone } : milestone;
}

function buildPhaseTemplatesFromImportedPlan(plan) {
  if (!plan || !Array.isArray(plan.phases) || !isPlanObject(plan.dailyPlans)) return [];
  const milestones = Array.isArray(plan.coreMilestones) ? plan.coreMilestones : [];
  return plan.phases.map((phase, index) => {
    const startDate = phase.startDate || phase.start || "";
    const endDate = phase.endDate || phase.end || "";
    const representative = plan.dailyPlans[startDate]
      ? [startDate, plan.dailyPlans[startDate]]
      : findRepresentativeDay(plan.dailyPlans, phase.name, (dateKey) => dateKey >= startDate && dateKey <= endDate);
    const day = representative ? representative[1] : {};
    const taskTemplates = {};
    const completionCriteria = {};
    PLAN_WINDOW_TASK_DEFINITIONS.forEach((definition) => {
      const sourceTask = day.tasks && day.tasks[definition.sourceTaskKey];
      taskTemplates[definition.sourceTaskKey === "originalTextOrReview" ? "review"
        : definition.sourceTaskKey === "outputOrMock" ? "output" : definition.sourceTaskKey] = String(sourceTask && sourceTask.description || "");
      completionCriteria[definition.sourceTaskKey === "originalTextOrReview" ? "review"
        : definition.sourceTaskKey === "outputOrMock" ? "output" : definition.sourceTaskKey] = getCompletionCriteriaFromSchedule(plan.fixedSchedule, definition);
    });
    const phaseMilestones = milestones.filter((milestone) => {
      const dates = [milestone.internalTarget, milestone.deadlineOrPeriod, milestone.startDate, milestone.endDate].filter(isPlanDateKey);
      return dates.some((dateKey) => dateKey >= startDate && dateKey <= endDate)
        || String(milestone.name || milestone.phaseName || "") === String(phase.name || "");
    }).map(normalizeMilestone);
    return {
      phaseId: String(phase.phaseId || `nankai-phase-${index + 1}-${startDate}`),
      phaseName: String(phase.name || phase.phaseName || ""),
      startDate,
      endDate,
      targetEffectiveStudyHours: Number(day.targetEffectiveStudyHours) || Number(phase.targetEffectiveStudyHours) || 0,
      taskTemplates,
      completionCriteria,
      milestones: phaseMilestones,
      source: `${plan.planType || "nankai-marxism-exam-plan"}@${plan.schemaVersion || 2}`,
      goal: String(phase.goal || ""),
      acceptance: String(phase.acceptance || ""),
      sourcePhase: { ...phase },
    };
  });
}

function buildPhaseTemplatesFromDailyPlans(dailyPlans) {
  const groups = new Map();
  Object.entries(dailyPlans || {}).sort(([left], [right]) => left.localeCompare(right)).forEach(([dateKey, day]) => {
    if (!isPlanDateKey(dateKey) || !day || !day.phase) return;
    if (!groups.has(day.phase)) groups.set(day.phase, []);
    groups.get(day.phase).push([dateKey, day]);
  });
  return [...groups.entries()].map(([phaseName, entries], index) => {
    const [startDateKey, representative] = entries[0];
    const taskTemplates = {};
    const completionCriteria = {};
    PLAN_WINDOW_TASK_DEFINITIONS.forEach((definition) => {
      const source = Array.isArray(representative.tasks)
        ? representative.tasks.find((task) => task.sourceTaskKey === definition.sourceTaskKey || (task.taskId || task.id) === definition.taskId)
        : representative.tasks && representative.tasks[definition.sourceTaskKey];
      taskTemplates[definition.sourceTaskKey === "originalTextOrReview" ? "review"
        : definition.sourceTaskKey === "outputOrMock" ? "output" : definition.sourceTaskKey] = String(source && source.description || "");
      completionCriteria[definition.sourceTaskKey === "originalTextOrReview" ? "review"
        : definition.sourceTaskKey === "outputOrMock" ? "output" : definition.sourceTaskKey] = String(source && source.completionCriteria || "");
    });
    return {
      phaseId: `migrated-phase-${index + 1}-${startDateKey}`,
      phaseName,
      startDate: startDateKey,
      endDate: entries.at(-1)[0],
      targetEffectiveStudyHours: Number(representative.targetEffectiveStudyHours) || 0,
      taskTemplates,
      completionCriteria,
      milestones: [],
      source: "migrated-studyDailyPlans",
    };
  });
}

function findPhaseTemplateForDate(templates, dateKey) {
  return (Array.isArray(templates) ? templates : []).find((phase) => dateKey >= phase.startDate && dateKey <= phase.endDate) || null;
}

function materializeDayFromPhaseTemplate(dateKey, phase) {
  if (!phase) return null;
  const reverseTemplateKey = (sourceTaskKey) => sourceTaskKey === "originalTextOrReview" ? "review" : sourceTaskKey === "outputOrMock" ? "output" : sourceTaskKey;
  const tasks = PLAN_WINDOW_TASK_DEFINITIONS.map((definition) => createPlanTask(definition, {
    description: phase.taskTemplates && phase.taskTemplates[reverseTemplateKey(definition.sourceTaskKey)] || "",
    completionCriteria: phase.completionCriteria && phase.completionCriteria[reverseTemplateKey(definition.sourceTaskKey)] || "",
  }));
  tasks.forEach((task) => { task.date = dateKey; });
  return {
    template: "phase-template-v1",
    sourcePlanType: "nankai-marxism-exam-plan",
    sourceSchemaVersion: 2,
    date: dateKey,
    weekday: parseLocalPlanDate(dateKey).toLocaleDateString("zh-CN", { weekday: "long" }),
    phase: phase.phaseName,
    phaseId: phase.phaseId,
    targetEffectiveStudyHours: Number(phase.targetEffectiveStudyHours) || 0,
    tasks,
    currentTaskId: "",
  };
}

function enrichDetailedPlanDay(dateKey, day) {
  if (!day || !Array.isArray(day.tasks)) return day;
  return {
    ...day,
    date: day.date || dateKey,
    tasks: day.tasks.map((task) => {
      const definition = PLAN_WINDOW_TASK_DEFINITIONS.find((item) => (
        item.taskId === (task && (task.taskId || task.id))
        || item.sourceTaskKey === (task && task.sourceTaskKey)
      ));
      const taskId = String(task && (task.taskId || task.id) || "");
      const refs = Array.isArray(task && task.actualResultRefs)
        ? task.actualResultRefs
        : task && task.actualResultRef ? [task.actualResultRef]
          : Array.isArray(task && task.resultRefs) ? task.resultRefs : [];
      return {
        ...task,
        date: task && task.date || dateKey,
        taskId,
        sourceTaskKey: String(task && task.sourceTaskKey || definition && definition.sourceTaskKey || ""),
        subject: String(task && task.subject || definition && definition.subject || ""),
        completionCriteria: String(task && (task.completionCriteria || task.minimum) || ""),
        status: getTaskStatusForPlan(task),
        manualEdited: task && task.manualEdited === true,
        actualResultRefs: refs,
      };
    }),
  };
}

function migrateDetailedPlanWindow(dailyPlans, phaseTemplates, todayKey) {
  const window = getDetailedPlanWindow(todayKey);
  const sourcePlans = isPlanObject(dailyPlans) ? dailyPlans : {};
  const resultPlans = {};
  const archivedFarPlans = {};
  Object.entries(sourcePlans).forEach(([dateKey, day]) => {
    if (dateKey < window.windowStart || dateKey <= window.windowEnd) resultPlans[dateKey] = day;
    else archivedFarPlans[dateKey] = day;
  });
  window.dates.forEach((dateKey) => {
    if (resultPlans[dateKey]) return;
    const materialized = materializeDayFromPhaseTemplate(dateKey, findPhaseTemplateForDate(phaseTemplates, dateKey));
    if (materialized) resultPlans[dateKey] = materialized;
  });
  window.dates.forEach((dateKey) => {
    if (resultPlans[dateKey]) resultPlans[dateKey] = enrichDetailedPlanDay(dateKey, resultPlans[dateKey]);
  });
  return { dailyPlans: resultPlans, archivedFarPlans, window };
}

function buildPlanImportPreview(plan, existingPlans, todayKey, decisions = {}) {
  const window = getDetailedPlanWindow(todayKey);
  const nextPlans = { ...(isPlanObject(existingPlans) ? existingPlans : {}) };
  const preview = {
    window,
    newDates: [], newTasks: [], updatedTasks: [], skippedHistoryDates: [],
    completedConflicts: [], inProgressConflicts: [], manualEditedConflicts: [], unmatchedConflicts: [],
    customTasks: [], farDatesConverted: [], keepLocal: [], useImport: [], conflicts: [],
  };
  Object.entries(plan.dailyPlans || {}).sort(([left], [right]) => left.localeCompare(right)).forEach(([dateKey, sourceDay]) => {
    if (dateKey < window.windowStart) { preview.skippedHistoryDates.push(dateKey); return; }
    if (dateKey > window.windowEnd) { preview.farDatesConverted.push(dateKey); delete nextPlans[dateKey]; return; }
    const importedDay = createDetailedPlanFromSource(dateKey, sourceDay, plan.fixedSchedule);
    const localDay = nextPlans[dateKey];
    if (!localDay) {
      nextPlans[dateKey] = importedDay;
      preview.newDates.push(dateKey);
      preview.newTasks.push(...importedDay.tasks.map((task) => ({ date: dateKey, task })));
      return;
    }
    const merged = mergeImportedDay(dateKey, localDay, importedDay, decisions);
    nextPlans[dateKey] = merged.day;
    preview.conflicts.push(...merged.conflicts);
    preview.customTasks.push(...merged.customTasks.map((task) => ({ date: dateKey, task })));
    importedDay.tasks.forEach((task) => {
      const localTask = getPlanTaskMatch(localDay.tasks, task);
      if (localTask) preview.updatedTasks.push({ date: dateKey, localTask, importedTask: task });
      else preview.newTasks.push({ date: dateKey, task });
    });
  });
  preview.conflicts.forEach((conflict) => {
    if (conflict.type === "completed") preview.completedConflicts.push(conflict);
    if (conflict.type === "in-progress") preview.inProgressConflicts.push(conflict);
    if (conflict.type === "manual-edited") preview.manualEditedConflicts.push(conflict);
    if (conflict.type === "unmatched") preview.unmatchedConflicts.push(conflict);
    (conflict.decision === "use-import" ? preview.useImport : preview.keepLocal).push(conflict);
  });
  preview.phaseTemplates = buildPhaseTemplatesFromImportedPlan(plan);
  preview.result = { dailyPlans: nextPlans, phaseTemplates: preview.phaseTemplates };
  return preview;
}

function makePlanWindowState(todayKey) {
  const window = getDetailedPlanWindow(todayKey);
  return { schemaVersion: PLAN_WINDOW_SCHEMA_VERSION, migrationId: PLAN_WINDOW_MIGRATION_ID, ...window };
}
