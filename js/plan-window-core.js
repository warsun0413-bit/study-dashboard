// P0 Checkpoint 4: pure seven-day plan window, phase templates, and import preview.
const PLAN_WINDOW_SCHEMA_VERSION = 1;
const PLAN_WINDOW_MIGRATION_ID = "p0-plan-window-v1";
const PLAN_WINDOW_DAYS = 7;
const PLAN_IMPORT_DECISIONS = ["keep-local", "use-import", "fill-empty", "skip"];
const PLAN_WINDOW_TASK_DEFINITIONS = [
  { taskId: "plan-english-words", sourceTaskKey: "englishWords", subject: "英语词汇", time: "08:00—08:25", name: "英语单词", counted: true, category: "englishWords", defaultDescription: "滚动复习昨日阅读错词、熟词僻义和重要搭配", defaultCompletionCriteria: "滚动复习并留下易错词复测记录。" },
  { taskId: "plan-722", sourceTaskKey: "722", subject: "722马原", time: "08:35—10:35", name: "722", counted: true, category: "maYuan" },
  { taskId: "plan-844", sourceTaskKey: "844", subject: "844马发史", time: "10:50—12:20", name: "844", counted: true, category: "maHistory" },
  { taskId: "plan-politics", sourceTaskKey: "politics", subject: "公共政治", time: "14:00—15:30", name: "政治", counted: true, category: "politics" },
  { taskId: "plan-english", sourceTaskKey: "english", subject: "英语", time: "15:45—17:15", name: "英语阅读", counted: true, category: "english" },
  { taskId: "plan-training", sourceTaskKey: "training", subject: "训练", time: "17:30—18:30", name: "训练", exercise: true, category: "exercise" },
  { taskId: "plan-output", sourceTaskKey: "outputOrMock", subject: "专业课输出", time: "19:00—20:30", name: "输出", counted: true, category: "output" },
  { taskId: "plan-original-review", sourceTaskKey: "originalTextOrReview", subject: "综合复盘", time: "20:40—21:00", name: "原著 / D复盘", counted: true, category: "rollingReview" },
];

function planClockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
}

function getPlanTaskTimeRange(task) {
  const [startText, endText, extra] = String(task && task.time || "").split(/[—–-]/).map((item) => item.trim());
  if (!startText || !endText || extra) return null;
  const start = planClockMinutes(startText); const end = planClockMinutes(endText);
  return start === null || end === null || start === end ? null : { start, end };
}

function findPlanTaskForMinutes(tasks, currentMinutes) {
  const minute = Number(currentMinutes);
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return null;
  return (Array.isArray(tasks) ? tasks : []).find((task) => {
    if (!task || task.status === "completed" || task.status === "skipped" || task.completed === true) return false;
    const range = getPlanTaskTimeRange(task);
    if (!range) return false;
    const { start, end } = range;
    return end > start ? minute >= start && minute < end : minute >= start || minute < end;
  }) || null;
}

function isExecutablePlanTask(task) {
  if (!task || task.status === "cancelled" || task.status === "completed" || task.status === "skipped" || task.completed === true) return false;
  if (String(task.category || "") === "rollingReview") return false;
  return task.counted === true || task.exercise === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && !task.exercise);
}

function findNextExecutablePlanTask(tasks, currentTaskId, currentMinutes) {
  const executable = (Array.isArray(tasks) ? tasks : []).filter(isExecutablePlanTask);
  const current = executable.find((task) => task.id === currentTaskId);
  if (current) return current;
  const inProgress = executable.find((task) => task.status === "in-progress");
  if (inProgress) return inProgress;
  return findPlanTaskForMinutes(executable, currentMinutes);
}

function findNextScheduledPlanTask(tasks, currentMinutes) {
  const minute = Number(currentMinutes);
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return null;
  const upcoming = (Array.isArray(tasks) ? tasks : [])
    .filter(isExecutablePlanTask)
    .map((task) => ({ task, range: getPlanTaskTimeRange(task) }))
    .filter((item) => item.range && item.range.start > minute)
    .sort((left, right) => left.range.start - right.range.start);
  return upcoming.length ? upcoming[0].task : null;
}

function buildSafeguardSequence(tasks, options = {}) {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const taskCompleted = (task) => task && (task.status === "completed" || task.completed === true);
  const byCategory = (categories) => safeTasks.find((task) => categories.includes(String(task.category || "")));
  const professionalCandidates = safeTasks.filter((task) => ["maYuan", "maHistory"].includes(String(task.category || "")));
  const preferredProfessional = professionalCandidates.find((task) => task.id === options.professionalTaskId);
  const professional = preferredProfessional
    || professionalCandidates.find((task) => task.status === "in-progress" && !taskCompleted(task))
    || professionalCandidates.find((task) => !taskCompleted(task))
    || professionalCandidates[0];
  const english = byCategory(["english", "englishReading"]);
  const politics = byCategory(["politics"]);
  const steps = [];
  if (professional) steps.push({ kind: "task", key: "professional", taskId: professional.id, completed: taskCompleted(professional) });
  if (english) steps.push({ kind: "task", key: "english", taskId: english.id, completed: taskCompleted(english) });
  if (politics) steps.push({ kind: "task", key: "politics", taskId: politics.id, completed: taskCompleted(politics) });
  steps.push({ kind: "closeout", key: "closeout", completed: Boolean(options.closeoutSaved) });
  return steps;
}

function getDailyHandoffCategory(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/(?:844|马发史|发展史)/.test(text)) return "maHistory";
  if (/(?:722|马原|基本原理)/.test(text)) return "maYuan";
  if (/(?:英语|阅读|真题)/.test(text)) return "english";
  if (/(?:政治|选择题)/.test(text)) return "politics";
  if (/(?:D0|D1|D3|D7|D14|D30|复盘)/i.test(text)) return "rollingReview";
  if (/(?:输出|论述|闭卷)/.test(text)) return "output";
  return "";
}

function findDailyHandoffTask(tasks, category) {
  const executable = (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (!task || task.status === "completed" || task.status === "skipped" || task.completed === true) return false;
    return task.counted === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && task.exercise !== true);
  });
  if (!category || category === "rollingReview") return null;
  const aliases = {
    english: ["english", "englishReading"],
    output: ["output", "d0"],
  };
  const categories = aliases[category] || [category];
  return executable.find((task) => categories.includes(String(task.category || ""))) || null;
}

function buildDailyHandoffCandidate(options = {}) {
  const todayTasks = Array.isArray(options.todayTasks) ? options.todayTasks : [];
  const manualAction = String(options.tomorrowPriority || "").trim();
  const explicitManualAction = manualAction && !/^(?:未记录|未填写|暂无|无)$/i.test(manualAction);
  if (explicitManualAction) {
    const category = getDailyHandoffCategory(manualAction);
    const task = category ? findDailyHandoffTask(todayTasks, category) : null;
    if (task) return { taskId: task.id, action: manualAction, source: "昨日收工记录" };
  }
  const breakpoints = (Array.isArray(options.professionalBreakpoints) ? options.professionalBreakpoints : [])
    .filter((item) => item
      && String(item.nextStart || "").trim()
      && !/^(?:未记录|未填写|暂无|无)$/i.test(String(item.nextStart || "").trim()))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const breakpoint = breakpoints[0];
  if (breakpoint) {
    const category = String(breakpoint.subject) === "844" ? "maHistory" : String(breakpoint.subject) === "722" ? "maYuan" : "";
    const task = findDailyHandoffTask(todayTasks, category);
    if (task) return {
      taskId: task.id,
      action: String(breakpoint.nextStart).trim(),
      source: `昨日${breakpoint.subject || "专业课"}下一准确起点`,
    };
  }
  const unfinished = (Array.isArray(options.yesterdayTasks) ? options.yesterdayTasks : []).find((task) => {
    if (!task || task.status === "completed" || task.completed === true || task.status === "skipped" || task.category === "rollingReview") return false;
    return task.counted === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && task.exercise !== true);
  });
  if (unfinished) {
    const task = findDailyHandoffTask(todayTasks, String(unfinished.category || ""));
    if (task) return {
      taskId: task.id,
      action: `继续昨日未完成的${String(unfinished.name || "正式任务").trim()}`,
      source: "昨日未完成任务",
    };
  }
  return null;
}

function buildScheduledDailyHandoffCandidate(options = {}, currentMinutes) {
  const candidate = buildDailyHandoffCandidate(options);
  if (!candidate) return null;
  const todayTasks = Array.isArray(options.todayTasks) ? options.todayTasks : [];
  const task = todayTasks.find((item) => item && item.id === candidate.taskId);
  return task && findPlanTaskForMinutes([task], currentMinutes) ? candidate : null;
}

function findLatestProfessionalBreakpoint(store, subject, throughDate) {
  const subjectCode = String(subject || "").trim();
  if (!["722", "844"].includes(subjectCode)) return null;
  const days = isPlanObject(store && store.days) ? store.days : {};
  const candidates = [];
  Object.entries(days).forEach(([dateKey, day]) => {
    if (!isPlanDateKey(dateKey) || (throughDate && dateKey > throughDate) || !isPlanObject(day)) return;
    const record = day[subjectCode];
    const units = record && Array.isArray(record.units) ? record.units : [];
    units.forEach((unit, index) => {
      const nextStart = String(unit && unit.nextStart || "").trim();
      if (!nextStart) return;
      candidates.push({
        subject: subjectCode,
        nextStart,
        date: dateKey,
        unitId: String(unit.unitId || ""),
        updatedAt: String(unit.updatedAt || unit.createdAt || unit.savedAt || ""),
        index,
      });
    });
  });
  candidates.sort((a, b) => b.date.localeCompare(a.date)
    || b.updatedAt.localeCompare(a.updatedAt)
    || b.index - a.index);
  const latest = candidates[0];
  if (!latest) return null;
  return {
    subject: latest.subject,
    nextStart: latest.nextStart,
    date: latest.date,
    unitId: latest.unitId,
    updatedAt: latest.updatedAt,
  };
}

function findLatestExecutionBreakpoint(records, actionFields, throughDate) {
  const fields = (Array.isArray(actionFields) ? actionFields : [actionFields])
    .map((field) => String(field || "").trim()).filter(Boolean);
  const candidates = [];
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    if (!isPlanObject(record) || !isPlanDateKey(record.date) || (throughDate && record.date > throughDate)) return;
    const field = fields.find((key) => {
      const value = String(record[key] || "").trim();
      return value && !/^(?:未记录|未填写|暂无|无)$/i.test(value);
    });
    if (!field) return;
    candidates.push({
      action: String(record[field]).trim(),
      date: record.date,
      field,
      recordId: String(record.recordId || ""),
      updatedAt: String(record.updatedAt || record.createdAt || record.savedAt || ""),
      index,
    });
  });
  candidates.sort((a, b) => b.date.localeCompare(a.date)
    || b.updatedAt.localeCompare(a.updatedAt)
    || b.index - a.index);
  const latest = candidates[0];
  return latest ? {
    action: latest.action,
    date: latest.date,
    field: latest.field,
    recordId: latest.recordId,
    updatedAt: latest.updatedAt,
  } : null;
}

function inferPlanOutputSubject(task) {
  if (!isPlanObject(task)) return "";
  const explicit = String(task.outputSubject || task.targetSubject || "").trim();
  if (["722", "844"].includes(explicit)) return explicit;
  const text = [task.subject, task.description, task.minimum, task.name]
    .map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  const has722 = /(?:^|\D)722(?:\D|$)/.test(text);
  const has844 = /(?:^|\D)844(?:\D|$)/.test(text);
  return has722 === has844 ? "" : has722 ? "722" : "844";
}

function activatePlanTaskForFocus(plan, taskId) {
  if (!plan || !Array.isArray(plan.tasks) || !taskId || taskId === "__unassigned__") return { task: null, changed: false };
  const task = plan.tasks.find((item) => item && item.id === taskId);
  if (!task) return { task: null, changed: false };
  const status = task.completed === true ? "completed" : task.status || "not-started";
  if (status === "completed" || status === "skipped") return { task, changed: false };
  const changed = plan.currentTaskId !== task.id || status !== "in-progress" || task.completed !== false;
  plan.currentTaskId = task.id;
  task.status = "in-progress";
  task.completed = false;
  return { task, changed };
}

function clearTerminalCurrentPlanTask(plan, taskId) {
  if (!plan || !Array.isArray(plan.tasks) || !taskId || plan.currentTaskId !== taskId) return false;
  const task = plan.tasks.find((item) => item && item.id === taskId);
  if (!task || (task.status !== "completed" && task.status !== "skipped" && task.completed !== true)) return false;
  plan.currentTaskId = "";
  return true;
}

function clearPlanCurrentTask(plan) {
  if (!plan || !plan.currentTaskId) return false;
  plan.currentTaskId = "";
  return true;
}

function selectPlanCurrentTask(plan, taskId) {
  if (!plan || !Array.isArray(plan.tasks) || !taskId) return { task: null, changed: false };
  const task = plan.tasks.find((item) => item && item.id === taskId);
  if (!task) return { task: null, changed: false };
  const changed = plan.currentTaskId !== task.id;
  plan.currentTaskId = task.id;
  return { task, changed };
}
const P1_ENGLISH_PLAN_DEFINITION = PLAN_WINDOW_TASK_DEFINITIONS.find((definition) => definition.sourceTaskKey === "english");
if (P1_ENGLISH_PLAN_DEFINITION) {
  P1_ENGLISH_PLAN_DEFINITION.resultTrackingVersion = 1;
  P1_ENGLISH_PLAN_DEFINITION.subtasks = [{ subtaskId: "reading", title: "英语阅读", required: true }];
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

function getTrustedImportedDailyDates(plan, window) {
  const start = String(window && window.windowStart || "");
  const end = String(window && window.windowEnd || "");
  return Object.keys(plan && plan.dailyPlans || {})
    .filter(isPlanDateKey)
    .filter((dateKey) => start && end && dateKey >= start && dateKey <= end)
    .sort();
}

function getTaskStatusForPlan(task) {
  if (task && ["not-started", "in-progress", "completed", "skipped"].includes(task.status)) return task.status;
  return task && task.completed === true ? "completed" : "not-started";
}

function createPlanTask(definition, sourceTask, defaultStatus = "未开始") {
  const sourceDescription = isPlanObject(sourceTask) ? sourceTask.description : sourceTask;
  const description = String(sourceDescription || definition.defaultDescription || "").trim();
  const status = defaultStatus === "已完成" ? "completed" : defaultStatus === "进行中" ? "in-progress" : "not-started";
  const p1Metadata = {};
  ["englishSubtasks", "politicsTarget", "outputType", "nextStart", "dueReviews", "originalPlan", "adjustedPlan"].forEach((key) => {
    if (sourceTask && Object.prototype.hasOwnProperty.call(sourceTask, key)) p1Metadata[key] = JSON.parse(JSON.stringify(sourceTask[key]));
  });
  return {
    id: definition.taskId,
    taskId: definition.taskId,
    sourceTaskKey: definition.sourceTaskKey,
    subject: definition.subject,
    time: definition.time,
    name: definition.name,
    description,
    completionCriteria: String(sourceTask && (sourceTask.completionCriteria || sourceTask.minimumOutput) || definition.defaultCompletionCriteria || "").trim(),
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
    ...p1Metadata,
  };
}

function getCompletionCriteriaFromSchedule(fixedSchedule, definition) {
  const moduleNames = {
    englishWords: ["英语词汇"], english: ["英语"], "722": ["722"], "844": ["844"], originalTextOrReview: ["原著/D复盘"],
    training: ["训练"], politics: ["政治"], outputOrMock: ["输出"],
  }[definition.sourceTaskKey] || [];
  return (Array.isArray(fixedSchedule) ? fixedSchedule : [])
    .filter((entry) => moduleNames.includes(entry && entry.module))
    .map((entry) => String(entry.minimumOutput || "").trim()).filter(Boolean).join("；");
}

function createDetailedPlanFromSource(dateKey, sourceDay, fixedSchedule = [], sourcePlan = {}) {
  const tasks = PLAN_WINDOW_TASK_DEFINITIONS.map((definition) => createPlanTask(
    definition,
    {
      ...(sourceDay && sourceDay.tasks && sourceDay.tasks[definition.sourceTaskKey] || {}),
      completionCriteria: getCompletionCriteriaFromSchedule(fixedSchedule, definition),
    },
    sourceDay && sourceDay.defaultStatus,
  ));
  tasks.forEach((task) => { task.date = dateKey; });
  const p1Metadata = sourceDay && isPlanObject(sourceDay.p1Metadata)
    ? JSON.parse(JSON.stringify(sourceDay.p1Metadata))
    : {};
  ["ankiTask", "debtSchedule", "executionMode"].forEach((key) => { delete p1Metadata[key]; });
  return {
    template: "nankai-plan-v2",
    sourcePlanType: String(sourcePlan.planType || ""),
    sourceSchemaVersion: Number(sourcePlan.schemaVersion) || 0,
    sourcePlanId: String(sourcePlan.planId || ""),
    sourceDocumentTitle: String(sourcePlan.sourceDocument && sourcePlan.sourceDocument.title || ""),
    date: dateKey,
    weekday: String(sourceDay && sourceDay.weekday || ""),
    phase: String(sourceDay && sourceDay.phase || ""),
    targetEffectiveStudyHours: Number(sourceDay && sourceDay.targetEffectiveStudyHours) || 0,
    p1Metadata,
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
      chapterTasks: isPlanObject(phase.chapterTasks) ? { ...phase.chapterTasks } : {},
      completionCriteria,
      milestones: phaseMilestones,
      source: `${plan.planType || "nankai-marxism-exam-plan"}@${plan.schemaVersion || 2}`,
      sourcePlanType: String(plan.planType || "nankai-marxism-exam-plan"),
      sourceSchemaVersion: Number(plan.schemaVersion) || 2,
      sourcePlanId: String(plan.planId || ""),
      sourceDocumentTitle: String(plan.sourceDocument && plan.sourceDocument.title || ""),
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
    sourcePlanType: String(phase.sourcePlanType || ""),
    sourceSchemaVersion: Number(phase.sourceSchemaVersion) || 0,
    sourcePlanId: String(phase.sourcePlanId || ""),
    sourceDocumentTitle: String(phase.sourceDocumentTitle || ""),
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
  const hasEnglishWords = day.tasks.some((task) => task && (
    task.sourceTaskKey === "englishWords"
    || task.category === "englishWords"
    || ["plan-english-words", "english-words", "sunday-words"].includes(String(task.taskId || task.id || ""))
  ));
  const tasks = day.tasks.map((task) => {
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
      time: definition && task && task.aiPlanned !== true ? definition.time : String(task && task.time || definition && definition.time || ""),
      sourceTaskKey: String(task && task.sourceTaskKey || definition && definition.sourceTaskKey || ""),
      subject: String(task && task.subject || definition && definition.subject || ""),
      completionCriteria: String(task && (task.completionCriteria || task.minimum) || ""),
      status: getTaskStatusForPlan(task),
      manualEdited: task && task.manualEdited === true,
      actualResultRefs: refs,
    };
  });
  if (!hasEnglishWords) {
    const definition = PLAN_WINDOW_TASK_DEFINITIONS.find((item) => item.sourceTaskKey === "englishWords");
    const vocabularyTask = createPlanTask(definition, {});
    vocabularyTask.date = dateKey;
    const insertAt = tasks.findIndex((task) => {
      const range = getPlanTaskTimeRange(task);
      return range && range.start > 8 * 60;
    });
    tasks.splice(insertAt >= 0 ? insertAt : 0, 0, vocabularyTask);
  }
  return {
    ...day,
    date: day.date || dateKey,
    tasks,
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
    customTasks: [], farDatesConverted: [], keepLocal: [], useImport: [], conflicts: [], p1MetadataChanges: [],
  };
  Object.entries(plan.dailyPlans || {}).sort(([left], [right]) => left.localeCompare(right)).forEach(([dateKey, sourceDay]) => {
    if (dateKey < window.windowStart) { preview.skippedHistoryDates.push(dateKey); return; }
    if (dateKey > window.windowEnd) { preview.farDatesConverted.push(dateKey); delete nextPlans[dateKey]; return; }
    const importedDay = createDetailedPlanFromSource(dateKey, sourceDay, plan.fixedSchedule, plan);
    if (sourceDay && (sourceDay.p1Metadata || Object.values(sourceDay.tasks || {}).some((task) => task && ["englishSubtasks", "politicsTarget", "outputType", "nextStart", "dueReviews"].some((key) => Object.prototype.hasOwnProperty.call(task, key))))) preview.p1MetadataChanges.push(dateKey);
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
