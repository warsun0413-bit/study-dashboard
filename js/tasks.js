// Fixed daily schedule, current execution, pomodoro, and focus mode.
const TASK_STATUS_LABELS = {
  "not-started": "未开始",
  "in-progress": "进行中",
  completed: "已完成",
  skipped: "跳过",
};

const WEEKLY_OUTPUT_SUGGESTIONS = [
  "周日：周复盘 + 本周错漏题重构",
  "周一：722基础母题提纲",
  "周二：844基础母题提纲",
  "周三：722完整论述1道",
  "周四：原著 / 跨章节调用提纲",
  "周五：844基础母题提纲",
  "周六：844完整论述1道",
];

const IMPORTED_PLAN_TASK_DEFINITIONS = [
  { id: "plan-english", sourceKey: "english", time: "15:45—17:15", name: "英语", counted: true, category: "english" },
  { id: "plan-722", sourceKey: "722", time: "08:35—10:35", name: "722", counted: true, category: "maYuan" },
  { id: "plan-844", sourceKey: "844", time: "10:50—12:20", name: "844", counted: true, category: "maHistory" },
  { id: "plan-original-review", sourceKey: "originalTextOrReview", time: "20:40—21:00", name: "原著 / D复盘", counted: true, category: "rollingReview" },
  { id: "plan-training", sourceKey: "training", time: "17:30—18:30", name: "训练", exercise: true, category: "exercise" },
  { id: "plan-politics", sourceKey: "politics", time: "14:00—15:30", name: "政治", counted: true, category: "politics" },
  { id: "plan-output", sourceKey: "outputOrMock", time: "19:00—20:30", name: "输出", counted: true, category: "output" },
];

function makeTask(id, time, name, description, options = {}) {
  return {
    id,
    time,
    name,
    description,
    status: "not-started",
    counted: Boolean(options.counted),
    exercise: Boolean(options.exercise),
    category: options.category || "",
    ...(options.resultTrackingVersion ? {
      resultTrackingVersion: options.resultTrackingVersion,
      subtasks: (options.subtasks || []).map((item) => ({ ...item })),
    } : {}),
  };
}

function createWeekdayTasks(date = new Date()) {
  return [
    makeTask("wake", "07:20", "起床、洗漱、早餐", "开始一天，不计入学习完成率"),
    makeTask("english-words", "08:00—08:25", "英语单词", "昨日阅读错词、熟词僻义、重要搭配、App滚动复习", { counted: true, category: "englishWords" }),
    makeTask("ma-yuan-722", "08:35—10:35", "722 马克思主义基本原理", "昨日复述 + 教材二轮/正式背诵 + A类知识点纸上重构", { counted: true, category: "maYuan" }),
    makeTask("ma-history-844", "10:50—12:20", "844 马克思主义发展史", "昨日节点复述 + 教材顺序推进 + 时间/著作/理论演进线重构", { counted: true, category: "maHistory" }),
    makeTask("lunch", "12:20—14:00", "午饭、午休", "休息时间，不计入学习完成率"),
    makeTask("politics", "14:00—15:30", "公共政治", "强化课或教材 + 对应选择题 + 错因标记", { counted: true, category: "politics" }),
    makeTask("english-reading", "15:45—17:15", "英语一阅读", "完成1篇阅读，并做主旨、定位依据、错项分析和一句错因总结", { counted: true, category: "englishReading" }),
    makeTask("exercise", "17:30—18:30", "锻炼", "约1小时居家训练或低强度恢复", { exercise: true, category: "exercise" }),
    makeTask("dinner", "18:30—19:00", "洗澡、晚饭、休息", "恢复时间，不计入学习完成率"),
    makeTask("professional-output", "19:00—20:30", "专业课输出", WEEKLY_OUTPUT_SUGGESTIONS[date.getDay()], { counted: true, category: "output" }),
    makeTask("rolling-review", "20:40—21:00", "滚动复盘", "处理 D1 / D3 / D7 / D14 / D30 到期任务；优先级：D30 > D14 > D7 > D3 > D1", { counted: true, category: "rollingReview" }),
    makeTask("d0-preview", "21:00—21:20", "D0复述 + 次日预加载", "复述今日722和844框架，查看明日教材位置和一级二级标题", { counted: true, category: "d0" }),
    makeTask("free-time", "21:20以后", "自由、放松", "自由安排，不计入学习完成率"),
    makeTask("sleep", "23:20—23:40", "准备睡觉", "结束一天，不计入学习完成率"),
  ];
}

function createSundayTasks() {
  return [
    makeTask("sunday-words", "08:00—08:25", "英语单词", "英语正常推进：昨日阅读错词、熟词僻义、重要搭配、App滚动复习", { counted: true, category: "englishWords" }),
    makeTask("sunday-722", "08:35—10:05", "722 周复盘", "回顾本周722教材主线、背诵卡点和纸上重构结果", { counted: true, category: "maYuan" }),
    makeTask("sunday-844", "10:20—11:50", "844 周复盘", "回顾本周844时间、著作、理论演进线和原著精读内容", { counted: true, category: "maHistory" }),
    makeTask("sunday-review", "14:00—14:40", "D任务清账", "清理本周到期与遗漏的 D1 / D3 / D7 / D14 / D30 任务", { counted: true, category: "rollingReview" }),
    makeTask("sunday-weakness", "14:40—15:20", "薄弱点整理", "整理本周反复出错、复述不稳和需要下周优先处理的内容", { counted: true, category: "weakness" }),
    makeTask("sunday-reading", "15:45—17:15", "英语一阅读", "完成1篇阅读或二次分析，并记录主旨、定位依据、错项类型和错因", { counted: true, category: "englishReading" }),
    makeTask("sunday-exercise", "17:30—18:20", "低强度运动", "低强度恢复，不追求训练量", { exercise: true, category: "exercise" }),
    makeTask("sunday-summary", "19:30—20:30", "晚间周总结", "周复盘 + 本周错漏题重构", { counted: true, category: "output" }),
  ];
}

// Kept for legacy cleanup compatibility. Existing saved labels and records are not changed.
const defaultTasks = createWeekdayTasks().map((task) => [task.id, task.name]);
const FREE_FOCUS_MODE = "free";
const POMODORO_FOCUS_MODE = "pomodoro";
const POMODORO_SECONDS = 25 * 60;
const FIVE_MINUTE_START_SECONDS = 5 * 60;
const SAFEGUARD_MODE_SESSION_KEY = "studySafeguardMode";
const storedPomodoroState = readJson(focusTimerStateKey, {});
let focusTimerState = normalizeFocusTimerState(storedPomodoroState, { date: getDateKey() });
let focusTimingMode = focusTimerState.mode;
let pomodoroRemainingSeconds = focusTimerState.remainingSeconds;
let currentFocusSeconds = focusTimerState.currentFocusSeconds;
let pomodoroTimerId = null;
let focusTimerContinuedWhileHidden = false;
let resultHandoffReceipt = null;
let focusRoundStartedAt = focusTimerState.roundStartedAt;
let lastFocusActivityAt = Date.now();
let lastFinalizedFocusSession = null;
let pendingFocusWrapup = null;
let pendingStartupSession = null;
let pendingFocusResultSession = null;
let pendingFocusReview = null;
let focusReviewNextReviewId = "";
let activeExecutionSurfaceSnapshot = null;
let activeResultHandoffModel = null;
const taskPrimaryCommandByButton = new WeakMap();
const taskFreeFocusCommandByButton = new WeakMap();

function readSafeguardModeState() {
  try {
    const state = JSON.parse(sessionStorage.getItem(SAFEGUARD_MODE_SESSION_KEY) || "null");
    return state && state.date === getDateKey() ? state : null;
  } catch {
    return null;
  }
}

function writeSafeguardModeState(state) {
  try { sessionStorage.setItem(SAFEGUARD_MODE_SESSION_KEY, JSON.stringify(state)); } catch {}
}

function clearSafeguardModeState() {
  try { sessionStorage.removeItem(SAFEGUARD_MODE_SESSION_KEY); } catch {}
}

function readDailyPlans() {
  const value = readJson(dailyPlansKey, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rollCurrentDetailedPlanWindow() {
  const today = getDateKey();
  const plans = readDailyPlans();
  const templates = readJson(planPhaseTemplatesKey, []);
  const rolled = migrateDetailedPlanWindow(plans, Array.isArray(templates) ? templates : [], today);
  if (JSON.stringify(rolled.dailyPlans) !== JSON.stringify(plans)) writeJson(dailyPlansKey, rolled.dailyPlans);
  writeJson(planWindowStateKey, makePlanWindowState(today));
  return rolled;
}

function createInitialTodayPlan(date = new Date()) {
  const isSunday = date.getDay() === 0;
  const tasks = isSunday ? createSundayTasks() : createWeekdayTasks(date);
  const englishIndexes = tasks.map((task, index) => [task, index])
    .filter(([task]) => ["englishWords", "englishReading"].includes(task.category));
  if (englishIndexes.length === 2) {
    const readingIndex = englishIndexes.find(([task]) => task.category === "englishReading")[1];
    const insertAt = tasks.slice(0, readingIndex).filter((task) => !["englishWords", "englishReading"].includes(task.category)).length;
    const englishMain = makeTask(isSunday ? "sunday-english-main" : "english-main", "15:45—17:15", "英语", "08:00—08:25完成词汇滚动复习；15:45—17:15完成真题阅读、证据定位和选项分析", {
      counted: true,
      category: "english",
      resultTrackingVersion: 1,
      subtasks: [{ subtaskId: "reading", title: "英语阅读", required: true }],
    });
    englishIndexes.slice().sort((left, right) => right[1] - left[1]).forEach(([, index]) => tasks.splice(index, 1));
    tasks.splice(insertAt, 0, englishMain);
  }
  return { template: isSunday ? "sunday" : "weekday", tasks, currentTaskId: "" };
}

function findExistingTasksForPlanDefinition(existingPlan, definition) {
  if (!existingPlan || !Array.isArray(existingPlan.tasks)) return [];
  const directMatch = existingPlan.tasks.find((task) => task.id === definition.id);
  if (directMatch) return [directMatch];
  if (definition.sourceKey === "english") {
    return existingPlan.tasks.filter((task) => task.category === "english" || task.category === "englishWords" || task.category === "englishReading");
  }
  return existingPlan.tasks.filter((task) => task.category === definition.category);
}

function inferImportedTaskStatus(existingTasks, defaultStatus) {
  const statuses = existingTasks.map(getTaskStatus);
  if (statuses.includes("completed")) return "completed";
  if (statuses.includes("in-progress")) return "in-progress";
  if (statuses.length && statuses.every((status) => status === "skipped")) return "skipped";
  return defaultStatus === "已完成" ? "completed" : defaultStatus === "进行中" ? "in-progress" : "not-started";
}

function getLegacyDefaultDescription(dateKey, taskId) {
  const date = new Date(`${dateKey}T12:00:00`);
  const defaultPlan = createInitialTodayPlan(date);
  const defaultTask = defaultPlan.tasks.find((task) => task.id === taskId);
  return defaultTask ? defaultTask.description : null;
}

function taskHasManualDescription(dateKey, task) {
  if (!task) return false;
  if (task.manualEdited === true) return true;
  if (typeof task.importedDescription === "string") return task.description !== task.importedDescription;
  const defaultDescription = getLegacyDefaultDescription(dateKey, task.id);
  return defaultDescription !== null && task.description !== defaultDescription;
}

function getManualPlanTaskConflicts(dateKey, sourceDay, existingPlan) {
  if (!sourceDay || !sourceDay.tasks) return [];
  return IMPORTED_PLAN_TASK_DEFINITIONS.flatMap((definition) => {
    const existingTasks = findExistingTasksForPlanDefinition(existingPlan, definition);
    return existingTasks.filter((task) => taskHasManualDescription(dateKey, task));
  });
}

function createImportedDailyPlan(dateKey, sourceDay, existingPlan, overwriteManualDescriptions = false) {
  const tasks = IMPORTED_PLAN_TASK_DEFINITIONS.map((definition) => {
    const sourceTask = sourceDay.tasks[definition.sourceKey];
    const importedDescription = sourceTask.description.trim();
    const existingTasks = findExistingTasksForPlanDefinition(existingPlan, definition);
    const completedTask = existingTasks.find((task) => getTaskStatus(task) === "completed");
    const manualTask = existingTasks.find((task) => taskHasManualDescription(dateKey, task));
    const preservedTask = completedTask || (!overwriteManualDescriptions && manualTask);
    const task = makeTask(definition.id, definition.time, definition.name, preservedTask ? preservedTask.description : importedDescription, definition);
    setTaskStatus(task, inferImportedTaskStatus(existingTasks, sourceDay.defaultStatus));
    task.sourceTaskKey = definition.sourceKey;
    task.importedDescription = importedDescription;
    task.manualEdited = Boolean(preservedTask && taskHasManualDescription(dateKey, preservedTask));
    return task;
  });
  const selectedDefinition = IMPORTED_PLAN_TASK_DEFINITIONS.find((definition) => {
    const matches = findExistingTasksForPlanDefinition(existingPlan, definition);
    return matches.some((task) => task.id === (existingPlan && existingPlan.currentTaskId));
  });
  return {
    template: "nankai-plan-v2",
    sourcePlanType: "nankai-marxism-exam-plan",
    sourceSchemaVersion: 2,
    date: dateKey,
    weekday: sourceDay.weekday,
    phase: sourceDay.phase,
    targetEffectiveStudyHours: sourceDay.targetEffectiveStudyHours,
    tasks,
    currentTaskId: selectedDefinition ? selectedDefinition.id : "",
  };
}

function getTodayPlan() {
  const plans = readDailyPlans();
  const date = getDateKey();
  if (!plans[date] || !Array.isArray(plans[date].tasks)) {
    plans[date] = createInitialTodayPlan();
    writeJson(dailyPlansKey, plans);
  }
  return plans[date];
}

function saveTodayPlan(plan) {
  const plans = readDailyPlans();
  plans[getDateKey()] = plan;
  writeJson(dailyPlansKey, plans);
}

function getTaskStatus(task) {
  if (TASK_STATUS_LABELS[task.status]) return task.status;
  return task.completed ? "completed" : "not-started";
}

function isCountedLearningTask(task) {
  return task.counted === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && !task.exercise);
}

function isDashboardExecutionTask(task) {
  return isCountedLearningTask(task) && String(task && task.category || "") !== "rollingReview";
}

function getCompletionStats(plan = getTodayPlan()) {
  const tasks = plan.tasks.filter(isDashboardExecutionTask);
  const done = tasks.filter((task) => getTaskStatus(task) === "completed").length;
  return { done, total: tasks.length, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

function getTaskStudyRoleLabel(task) {
  const labels = {
    "main-professional": "今日主科",
    "retrieval-professional": "闭卷提取",
    "main-output": "主科输出",
    "spaced-review": "间隔复习",
  };
  const rawRole = task && task.studyRole;
  const roleKey = typeof rawRole === "string"
    ? rawRole.trim()
    : rawRole && typeof rawRole === "object"
      ? ["key", "role", "id", "value", "type"].map((field) => rawRole[field]).find((value) => typeof value === "string" && value.trim()) || ""
      : "";
  if (labels[roleKey]) return labels[roleKey];
  return rawRole && typeof rawRole === "object" && typeof rawRole.label === "string"
    ? rawRole.label.trim()
    : "";
}

function updateCompletionRate() {
  const plan = getTodayPlan();
  const { done, total, rate } = getCompletionStats(plan);
  document.querySelector("#completionRate").textContent = `${rate}%`;
  document.querySelector("#completionText").textContent = `已完成 ${done} / ${total} 项学习任务`;
  document.querySelector("#completionBar").style.width = `${rate}%`;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTask = findNextExecutablePlanTask(plan.tasks, plan.currentTaskId, nowMinutes);
  const nextTask = currentTask ? null : findNextScheduledPlanTask(plan.tasks, nowMinutes);
  const currentLabel = currentTask
    ? `当前：${currentTask.name}`
    : nextTask
      ? `下一项：${nextTask.time} ${nextTask.name}`
      : done < total ? "当前时间段无正式任务" : "今日正式任务已完成";
  const planSummary = document.querySelector("#todayPlanSummary");
  if (planSummary) planSummary.textContent = `已完成 ${done}/${total} · ${currentLabel} · 剩余 ${Math.max(0, total - done)}`;
  const loadProfile = plan.studyLoadProfile && typeof plan.studyLoadProfile === "object" ? plan.studyLoadProfile : null;
  document.querySelector("#scheduleHint").textContent = loadProfile
    ? `${plan.phase} · ${loadProfile.mainSubject}今日主科 · 计划有效学习${plan.targetEffectiveStudyHours}小时 · ${loadProfile.profileId === "standard" ? "标准负荷" : loadProfile.profileId === "floor" ? "保底负荷" : "按真实承载降载"}`
    : plan.template === "nankai-plan-v2"
      ? `${plan.phase} · 目标有效学习 ${plan.targetEffectiveStudyHours} 小时 · 新版网站导入计划`
    : plan.template === "sunday" ? "周日降载模板 · 有效学习约5—6小时" : "按固定时间块执行；生活时间和锻炼不计入学习完成率";
}

function createTaskButton(label, action, id, className = "ghost") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button task-action ${className}`;
  button.textContent = label;
  button.dataset.taskAction = action;
  button.dataset.taskId = id;
  return button;
}

function getUnifiedTaskResultAction(task) {
  return typeof getFocusWrapupResultAction === "function" ? getFocusWrapupResultAction(task) : null;
}

function getUnifiedTaskPrimary(task, status = getTaskStatus(task)) {
  if (task && task.category === "rollingReview" && typeof getReviewExecutionState === "function") {
    const reviewState = getReviewExecutionState(readJson(reviewQueueKey, []), getDateKey(), { task });
    if (reviewState.remainingCount) {
      return {
        label: `处理下一条（今日剩${reviewState.remainingCount}）`,
        action: "unified-review",
        className: "primary",
        contextId: String(reviewState.active && reviewState.active.reviewId || ""),
      };
    }
    if (status === "completed") return { label: reviewState.backlogCount ? "今日预算已完成" : "今日复习已完成", action: "unified-done", className: "success", disabled: true };
    return { label: reviewState.backlogCount ? "确认今日预算完成" : "确认今日无到期", action: "unified-complete", className: "secondary" };
  }
  const resultAction = getUnifiedTaskResultAction(task);
  const sameFocusTask = focusTimerState.activeTaskId === task.id;
  const hasFocusRound = sameFocusTask && (focusTimerState.running || currentFocusSeconds > 0 || focusRoundStartedAt);
  if (status === "completed") {
    return resultAction
      ? { label: "查看 / 更新记录", action: "unified-record", className: "secondary" }
      : { label: "已完成", action: "unified-done", className: "success", disabled: true };
  }
  if (status === "skipped") return { label: "恢复任务", action: "unified-restore", className: "ghost" };
  if (!isCountedLearningTask(task)) {
    return {
      label: task.exercise ? "标记训练完成" : "标记完成",
      action: "unified-complete",
      className: task.exercise ? "secondary" : "ghost",
    };
  }
  if (hasFocusRound && focusTimerState.running) {
    return {
      label: resultAction ? "结束并记录" : "结束专注",
      action: "unified-end",
      className: "success",
    };
  }
  if (hasFocusRound) {
    return {
      label: isFiveMinuteStartupRound() ? "继续刚才的5分钟" : "继续专注",
      action: "unified-start",
      className: "primary",
    };
  }
  if (status === "in-progress") {
    return resultAction
      ? { label: "记录结果", action: "unified-record", className: "primary" }
      : { label: "标记完成", action: "unified-complete", className: "success" };
  }
  return { label: "先做5分钟", action: "unified-start", className: "primary" };
}

function createUnifiedTaskPrimaryButton(task, status) {
  const config = getUnifiedTaskPrimary(task, status);
  const button = createTaskButton(config.label, config.action, task.id, config.className);
  button.classList.add("task-primary-action");
  button.disabled = config.disabled === true;
  taskPrimaryCommandByButton.set(button, getTaskRowPrimaryCommand(task, status, config));
  return button;
}

function canTaskRowStartFreeFocus(task, status = getTaskStatus(task)) {
  const hasPendingRound = focusTimerState.running || currentFocusSeconds > 0 || focusRoundStartedAt;
  return Boolean(task
    && status === "not-started"
    && task.category !== "rollingReview"
    && isCountedLearningTask(task)
    && !hasPendingRound);
}

function createTaskRowFreeFocusButton(task, status) {
  if (!canTaskRowStartFreeFocus(task, status)) return null;
  const config = { label: "自由专注", action: "unified-start", className: "secondary" };
  const button = createTaskButton(config.label, config.action, task.id, config.className);
  button.classList.add("task-free-focus-action");
  taskFreeFocusCommandByButton.set(button, getTaskRowPrimaryCommand(task, status, config));
  return button;
}

function getTaskRowPrimaryCommand(task, status = getTaskStatus(task), config = getUnifiedTaskPrimary(task, status)) {
  return createExecutionSurfaceCommand(createExecutionSurfaceView({
    mode: EXECUTION_SURFACE_MODES.DEFAULT,
    taskId: task && task.id,
    contextId: config.contextId,
    primary: { ...config, taskId: task && task.id, contextId: config.contextId },
  }));
}

function createTaskMoreActions(task, status, content) {
  const details = document.createElement("details");
  details.className = "task-more-actions";
  const summary = document.createElement("summary");
  summary.textContent = "更多";
  const body = document.createElement("div");
  body.className = "task-more-actions-body";
  const select = document.createElement("select");
  select.className = "task-status-select";
  select.dataset.taskStatus = task.id;
  Object.entries(TASK_STATUS_LABELS).forEach(([value, label]) => select.add(new Option(label, value)));
  select.value = status;
  body.append(select, createTaskButton("设为当前任务", "focus", task.id, "secondary"), createTaskButton("编辑说明", "edit-description", task.id));
  if (typeof appendP1ResultSummary === "function") appendP1ResultSummary(task, content, body);
  if (typeof appendProfessionalTaskSummary === "function") appendProfessionalTaskSummary(task, content, body);
  if (typeof appendP1OutputSummary === "function") appendP1OutputSummary(task, content, body);
  details.append(summary, body);
  return details;
}

function performUnifiedTaskAction(task, actionName, contextId = "") {
  if (!task) return false;
  const plan = getTodayPlan();
  if (actionName === "unified-start") {
    setCurrentTask(task.id);
    startImmersiveFocus(task);
    return true;
  }
  if (actionName === "unified-end") {
    finishOrResetFocus();
    return true;
  }
  if (actionName === "unified-record") {
    openFocusWrapupResult(task, getUnifiedTaskResultAction(task));
    return true;
  }
  if (actionName === "unified-review") {
    return startCurrentReviewFromExecution(contextId);
  }
  if (actionName === "unified-complete") {
    if (typeof validateRollingReviewCompletion === "function") {
      const validation = validateRollingReviewCompletion(task, readJson(reviewQueueKey, []), getDateKey());
      if (!validation.valid) {
        setStatus("#dueReviewsStatus", validation.message, true);
        document.querySelector("#dueReviewsTitle").scrollIntoView({ behavior: "smooth", block: "start" });
        return true;
      }
    }
    if (focusTimerState.activeTaskId === task.id) settleBeforeFocusTaskSwitch("");
    setTaskStatus(task, "completed");
    clearTerminalCurrentPlanTask(plan, task.id);
    saveTodayPlan(plan);
    renderTasks();
    renderRecentSevenDays();
    return true;
  }
  if (actionName === "unified-restore") {
    setTaskStatus(task, "not-started");
    saveTodayPlan(plan);
    renderTasks();
    renderRecentSevenDays();
    return true;
  }
  return actionName === "unified-done";
}

function renderTasks() {
  const list = document.querySelector("#taskList");
  const plan = getTodayPlan();
  list.replaceChildren();
  const learningRows = document.createDocumentFragment();
  const lifeRows = [];
  plan.tasks.forEach((task) => {
    const status = getTaskStatus(task);
    const row = document.createElement("article");
    row.className = `task-row status-${status}${task.exercise ? " exercise-task" : ""}${!isCountedLearningTask(task) && !task.exercise ? " life-task" : ""}`;
    const time = document.createElement("strong");
    time.className = "task-time";
    time.textContent = task.time || "自定";
    const content = document.createElement("div");
    const name = document.createElement("strong");
    const roleLabel = getTaskStudyRoleLabel(task);
    name.textContent = roleLabel ? `${task.name} · ${roleLabel}` : task.name;
    const brief = document.createElement("div");
    brief.className = "task-execution-brief execution-brief is-compact";
    renderTaskExecutionBrief(brief, getTaskExecutionBrief(task), { compact: true });
    content.append(name, brief);
    const controls = document.createElement("div");
    controls.className = "task-actions";
    const primaryButton = createUnifiedTaskPrimaryButton(task, status);
    const freeFocusButton = createTaskRowFreeFocusButton(task, status);
    controls.append(primaryButton);
    if (freeFocusButton) controls.append(freeFocusButton);
    controls.append(createTaskMoreActions(task, status, content));
    row.append(time, content, controls);
    if (!isCountedLearningTask(task) && !task.exercise) lifeRows.push(row);
    else learningRows.appendChild(row);
  });
  list.appendChild(learningRows);
  if (lifeRows.length) {
    const lifeGroup = document.createElement("details");
    lifeGroup.className = "life-task-group";
    const lifeSummary = document.createElement("summary");
    lifeSummary.textContent = `生活安排（${lifeRows.length}项）`;
    const lifeList = document.createElement("div");
    lifeList.className = "life-task-list";
    lifeRows.forEach((row) => lifeList.appendChild(row));
    lifeGroup.append(lifeSummary, lifeList);
    list.appendChild(lifeGroup);
  }
  updateCompletionRate();
  renderFocusTaskOptions();
  if (typeof renderManualStudyTaskOptions === "function") renderManualStudyTaskOptions();
  if (typeof renderProfessionalResults === "function") renderProfessionalResults();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  if (typeof renderDailyCloseout === "function") renderDailyCloseout();
  if (typeof renderStudyProgressRunner === "function") renderStudyProgressRunner();
  renderExecutionSurface();
  renderResultHandoff();
}

function getResultHandoffModel(executionSnapshot = activeExecutionSurfaceSnapshot || getExecutionSurfaceSnapshot()) {
  if (!resultHandoffReceipt) {
    return { ...createResultHandoffModel({ receipt: null, task: null }), task: null, executionSnapshot };
  }
  const plan = executionSnapshot && executionSnapshot.plan || getTodayPlan();
  const executionCommand = executionSnapshot?.command || createExecutionSurfaceCommand(null);
  const preparedTaskId = executionCommand.valid === true && ["task", "handoff"].includes(executionCommand.kind)
    ? executionCommand.taskId
    : "";
  const task = plan.tasks.find((item) => item && item.id === preparedTaskId) || null;
  return {
    ...createResultHandoffModel({
      receipt: resultHandoffReceipt,
      executionCommand,
      executionLabel: executionSnapshot?.view?.primary?.label,
      task: task ? {
        taskId: task.id,
        name: task.name,
        description: getTaskExecutionDescription(task),
        status: getTaskStatus(task),
      } : null,
    }),
    task,
    executionSnapshot,
  };
}

function renderResultHandoff() {
  const receipt = document.querySelector("#resultHandoffReceipt");
  const title = document.querySelector("#resultHandoffTitle");
  const next = document.querySelector("#resultHandoffNext");
  const startButton = document.querySelector("#startResultHandoffNextBtn");
  const freeButton = document.querySelector("#startResultHandoffFreeBtn");
  if (!receipt || !title || !next || !startButton) return;
  const model = getResultHandoffModel();
  activeResultHandoffModel = model;
  receipt.hidden = !model.visible;
  title.textContent = model.title;
  next.textContent = model.nextText;
  startButton.hidden = !model.command.valid;
  startButton.disabled = !model.command.valid;
  startButton.dataset.taskId = model.command.taskId;
  startButton.textContent = model.buttonLabel;
  if (freeButton) {
    freeButton.hidden = !model.freeFocusAvailable;
    freeButton.disabled = !model.freeFocusAvailable;
    freeButton.dataset.taskId = model.taskId;
  }
  renderTaskExecutionBrief(
    document.querySelector("#resultHandoffBrief"),
    model.task ? getTaskExecutionBrief(model.task) : null,
    { compact: true },
  );
  syncFocusResultHandoffCard(model);
}

function syncFocusResultHandoffCard(model) {
  const card = document.querySelector("#focusResultHandoffCard");
  if (!card) return;
  document.querySelector("#focusResultHandoffTitle").textContent = model.title || "本轮结果已保存";
  document.querySelector("#focusResultHandoffNext").textContent = model.nextText || "今天的正式任务已完成，可以稍后检查记录。";
  document.querySelector("#focusResultHandoffDescription").textContent = model.task
    ? `${model.task.name} · ${getTaskExecutionDescription(model.task)}`
    : "本轮专注时间和正式结果均已保存。";
  renderTaskExecutionBrief(
    document.querySelector("#focusResultHandoffBrief"),
    model.task ? getTaskExecutionBrief(model.task) : null,
  );
  const startButton = document.querySelector("#focusResultHandoffStartBtn");
  const freeButton = document.querySelector("#focusResultHandoffFreeBtn");
  startButton.hidden = !model.command.valid;
  startButton.disabled = !model.command.valid;
  startButton.textContent = model.buttonLabel || "继续下一项";
  freeButton.hidden = !model.freeFocusAvailable;
  freeButton.disabled = !model.freeFocusAvailable;
}

function showFocusResultHandoffCard(model = activeResultHandoffModel) {
  if (!model || !model.visible) return false;
  syncFocusResultHandoffCard(model);
  document.querySelector("#focusMainCard").hidden = true;
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = false;
  document.querySelector("#focusModeOverlay").hidden = false;
  document.body.classList.add("focus-mode-active");
  setStatus("#focusResultHandoffStatus", "");
  return true;
}

function hideFocusResultHandoffCard() {
  const card = document.querySelector("#focusResultHandoffCard");
  if (!card || card.hidden) return false;
  card.hidden = true;
  document.querySelector("#focusModeOverlay").hidden = true;
  document.body.classList.remove("focus-mode-active");
  document.querySelector("#focusMainCard").hidden = false;
  return true;
}

function completePendingFocusResultSession(model) {
  const pending = pendingFocusResultSession;
  if (!pending || !resultHandoffReceipt || pending.taskId !== resultHandoffReceipt.taskId) return false;
  const completed = resultHandoffReceipt.savedLabel.replace(/^已保存[:：]?\s*/, "") || "正式结果已保存";
  const nextStep = model && model.task ? getTaskExactStartAction(model.task) : "";
  updateFocusSessionWrapup(pending.sessionId, completed, nextStep);
  pendingFocusResultSession = null;
  renderTodayFocusOutputs();
  renderHistory();
  return true;
}

function showResultHandoff(taskId, savedLabel) {
  const plan = getTodayPlan();
  const savedTaskId = String(taskId || "");
  const savedTask = plan.tasks.find((task) => task
    && [task.id, task.taskId].some((candidate) => String(candidate || "") === savedTaskId));
  if (!savedTask) return false;
  resultHandoffReceipt = {
    taskId: savedTask.id,
    savedLabel: String(savedLabel || `已保存：${savedTask.name}`),
  };
  renderResultHandoff();
  if (completePendingFocusResultSession(activeResultHandoffModel)) {
    showFocusResultHandoffCard(activeResultHandoffModel);
    return true;
  }
  const nextText = document.querySelector("#resultHandoffNext")?.textContent || "";
  setStatus("#executionStatus", `${resultHandoffReceipt.savedLabel}；${nextText}`);
  document.querySelector("#execution")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#enterFocusModeBtn")?.focus({ preventScroll: true });
  return true;
}

function dismissResultHandoff() {
  hideFocusResultHandoffCard();
  pendingFocusResultSession = null;
  resultHandoffReceipt = null;
  renderResultHandoff();
}

function setResultHandoffStaleStatus() {
  const message = "下一任务状态已更新，请确认后再点击。";
  setStatus("#executionStatus", message, true);
  setStatus("#focusResultHandoffStatus", message, true);
}

function startResultHandoffNext() {
  const freshModel = getResultHandoffModel(getExecutionSurfaceSnapshot());
  if (!resultHandoffModelsMatch(activeResultHandoffModel, freshModel)) {
    renderExecutionSurface();
    renderResultHandoff();
    setResultHandoffStaleStatus();
    return false;
  }
  dismissResultHandoff();
  return executeExecutionSurfaceCommand(freshModel.executionSnapshot);
}

function startResultHandoffFreeFocus() {
  const freshModel = getResultHandoffModel(getExecutionSurfaceSnapshot());
  if (!resultHandoffModelsMatch(activeResultHandoffModel, freshModel)
    || !freshModel.freeFocusAvailable
    || !freshModel.task) {
    renderExecutionSurface();
    renderResultHandoff();
    setResultHandoffStaleStatus();
    return false;
  }
  const task = freshModel.task;
  dismissResultHandoff();
  setCurrentTask(task.id);
  startImmersiveFocus(task, { directFree: true });
  const exactAction = getTaskExactStartAction(task);
  if (pomodoroTimerId && exactAction) syncFocusRoundGoal(exactAction);
  return Boolean(pomodoroTimerId);
}

function setTaskStatus(task, status) {
  task.status = TASK_STATUS_LABELS[status] ? status : "not-started";
  task.completed = task.status === "completed";
}

function setCurrentTask(id) {
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item.id === id);
  if (!task) return;
  settleBeforeFocusTaskSwitch(id);
  const selection = selectPlanCurrentTask(plan, id);
  if (selection.changed) saveTodayPlan(plan);
  renderTasks();
  document.querySelector("#focusTask").value = id;
  syncFocusModeContent();
  updatePomodoroDisplay();
  document.querySelector("#execution").scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleTaskListChange(event) {
  const select = event.target.closest("[data-task-status]");
  if (!select) return;
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item.id === select.dataset.taskStatus);
  if (!task) return;
  if (select.value === "completed" && typeof validateP1TrackedTaskCompletion === "function") {
    const validation = validateP1TrackedTaskCompletion(task);
    if (!validation.valid) {
      select.value = getTaskStatus(task);
      if (typeof openP1ResultDialog === "function") {
        const resultType = typeof getP1TaskKind === "function" && getP1TaskKind(task) === "politics" ? "politics" : "reading";
        openP1ResultDialog(resultType, String(task.taskId || task.id));
      }
      setStatus("#p1ResultStatus", validation.message, true);
      return;
    }
  }
  if (select.value === "completed" && typeof validateRollingReviewCompletion === "function") {
    const validation = validateRollingReviewCompletion(task, readJson(reviewQueueKey, []), getDateKey());
    if (!validation.valid) {
      select.value = getTaskStatus(task);
      setStatus("#dueReviewsStatus", validation.message, true);
      document.querySelector("#dueReviewsTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
  if (select.value === "completed" && typeof validateProfessionalTaskCompletion === "function") {
    const validation = validateProfessionalTaskCompletion(task);
    if (!validation.valid) {
      select.value = getTaskStatus(task);
      if (typeof openProfessionalTaskRecord === "function") openProfessionalTaskRecord(task);
      setStatus("#professionalResultStatus", validation.message, true);
      return;
    }
  }
  if (select.value === "completed" && typeof validateP1OutputTaskCompletion === "function") {
    const validation = validateP1OutputTaskCompletion(task);
    if (!validation.valid) {
      select.value = getTaskStatus(task);
      if (typeof handleP1OutputAction === "function") handleP1OutputAction("p1-output", task);
      setStatus("#outputQuickStatus", validation.message, true);
      return;
    }
  }
  const changingCurrentToTerminal = plan.currentTaskId === task.id && ["completed", "skipped"].includes(select.value);
  if (changingCurrentToTerminal && focusTimerState.activeTaskId === task.id) settleBeforeFocusTaskSwitch("");
  setTaskStatus(task, select.value);
  const releasedCurrentTask = clearTerminalCurrentPlanTask(plan, task.id);
  if (releasedCurrentTask) document.querySelector("#focusTask").value = "";
  saveTodayPlan(plan);
  renderTasks();
  renderRecentSevenDays();
}

function handleTaskListClick(event) {
  const action = event.target.closest("[data-task-action]");
  if (!action) return;
  const renderedPrimaryCommand = taskPrimaryCommandByButton.get(action) || null;
  const renderedFreeFocusCommand = taskFreeFocusCommandByButton.get(action) || null;
  const plan = getTodayPlan();
  const taskId = renderedPrimaryCommand?.taskId || renderedFreeFocusCommand?.taskId || action.dataset.taskId;
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) {
    if (renderedPrimaryCommand || renderedFreeFocusCommand) renderTasks();
    return;
  }
  if (renderedFreeFocusCommand) {
    const status = getTaskStatus(task);
    const freshFreeFocusCommand = getTaskRowPrimaryCommand(task, status, { label: "自由专注", action: "unified-start", className: "secondary" });
    if (!canTaskRowStartFreeFocus(task, status)
      || !executionSurfaceCommandsMatch(renderedFreeFocusCommand, freshFreeFocusCommand)) {
      renderTasks();
      setStatus("#executionStatus", "任务状态已更新，请确认后再点击。", true);
      return;
    }
    setCurrentTask(task.id);
    startImmersiveFocus(task, { directFree: true });
    const exactAction = getTaskExactStartAction(task);
    if (pomodoroTimerId && exactAction) syncFocusRoundGoal(exactAction);
    return;
  }
  if (renderedPrimaryCommand) {
    const freshCommand = getTaskRowPrimaryCommand(task);
    if (!executionSurfaceCommandsMatch(renderedPrimaryCommand, freshCommand)) {
      renderTasks();
      setStatus("#executionStatus", "任务状态已更新，请确认后再点击。", true);
      return;
    }
    performUnifiedTaskAction(task, freshCommand.taskAction, freshCommand.contextId);
    return;
  }
  if (performUnifiedTaskAction(task, action.dataset.taskAction)) return;
  if (typeof handleP1TaskAction === "function" && handleP1TaskAction(action.dataset.taskAction, task)) return;
  if (typeof handleP1OutputAction === "function" && handleP1OutputAction(action.dataset.taskAction, task)) return;
  if (action.dataset.taskAction === "professional-result" && typeof openProfessionalTaskRecord === "function") {
    openProfessionalTaskRecord(task);
    return;
  }
  if (action.dataset.taskAction === "focus") return setCurrentTask(task.id);
  if (action.dataset.taskAction === "edit-description") {
    const description = window.prompt("今日任务说明",
      readTaskText(task.description, ["description", "minimumOutput", "text"])
      || readTaskText(task.minimum, ["minimumOutput", "description", "text"]));
    if (description === null) return;
    task.description = description.trim().slice(0, 240);
    task.manualEdited = true;
    saveTodayPlan(plan);
    renderTasks();
  }
}

function previewFocusTask(task, statusMessage = "") {
  const select = document.querySelector("#focusTask");
  if (!task || !select || !Array.from(select.options).some((option) => option.value === task.id)) return false;
  select.value = task.id;
  syncFocusModeContent();
  if (statusMessage) setStatus("#executionStatus", statusMessage);
  return true;
}

function renderFocusTaskOptions() {
  const select = document.querySelector("#focusTask");
  const plan = getTodayPlan();
  const hasPendingFocusRound = focusTimerState.running || focusTimerState.currentFocusSeconds > 0 || focusTimerState.roundStartedAt;
  const focusTaskId = hasPendingFocusRound ? focusTimerState.activeTaskId || "__unassigned__" : "";
  const previous = focusTaskId || plan.currentTaskId || select.value;
  select.replaceChildren(new Option("请选择今日任务", ""), new Option("未归属专注", "__unassigned__"));
  plan.tasks.forEach((task) => select.add(new Option(`${getTaskStatus(task) === "completed" ? "✓ " : ""}${task.time ? `${task.time} ` : ""}${task.name}`, task.id)));
  const now = new Date();
  const suggestedTask = hasPendingFocusRound
    ? null
    : findNextExecutablePlanTask(plan.tasks, previous, now.getHours() * 60 + now.getMinutes());
  if (hasPendingFocusRound) {
    select.value = focusTaskId;
    syncFocusModeContent();
    return;
  }
  if (!previewFocusTask(suggestedTask, suggestedTask && suggestedTask.id !== previous
    ? `当前任务已准备：${suggestedTask.name}；点击主按钮后才会计时。`
    : "")) {
    select.value = "";
    syncFocusModeContent();
  }
}

function formatPomodoroTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatFocusClock(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor(safeSeconds % 3600 / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatFocusDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor(safeSeconds % 3600 / 60);
  if (hours) return `${hours}小时${String(minutes).padStart(2, "0")}分钟`;
  if (minutes) return `${minutes}分钟`;
  return safeSeconds ? `${safeSeconds}秒` : "0分钟";
}

function isFiveMinuteStartupRound() {
  return focusTimingMode === POMODORO_FOCUS_MODE
    && Boolean(focusRoundStartedAt)
    && currentFocusSeconds + pomodoroRemainingSeconds === FIVE_MINUTE_START_SECONDS;
}

function getSavedProfessionalStartContext(task) {
  if (!task || typeof readProfessionalStore !== "function" || typeof findLatestProfessionalBreakpoint !== "function") return "";
  const subject = task.category === "maYuan" ? "722" : task.category === "maHistory" ? "844" : "";
  if (!subject) return "";
  const breakpoint = findLatestProfessionalBreakpoint(readProfessionalStore(), subject, getDateKey());
  return breakpoint ? { action: breakpoint.nextStart, source: "formal-record", date: breakpoint.date } : null;
}

function getSavedProfessionalStartAction(task) {
  return getSavedProfessionalStartContext(task)?.action || "";
}

function getSavedRecordedStartContext(task) {
  if (!task || typeof findLatestExecutionBreakpoint !== "function") return "";
  let records = [];
  let fields = [];
  if (["english", "englishReading"].includes(task.category) && typeof readP1Records === "function") {
    records = readP1Records(englishReadingRecordsKey);
    fields = ["nextStart"];
  } else if (task.category === "politics" && typeof readP1Records === "function") {
    records = readP1Records(politicsRecordsKey);
    fields = ["nextStart"];
  } else if (task.category === "output" && typeof readOutputRecords === "function") {
    const subject = typeof inferPlanOutputSubject === "function" ? inferPlanOutputSubject(task) : "";
    if (subject) {
      records = readOutputRecords().filter((record) => String(record && record.subject || "") === subject);
      fields = ["nextAction"];
    }
  }
  const breakpoint = fields.length ? findLatestExecutionBreakpoint(records, fields, getDateKey()) : null;
  return breakpoint ? { action: breakpoint.action, source: "formal-record", date: breakpoint.date } : null;
}

function getSavedRecordedStartAction(task) {
  return getSavedRecordedStartContext(task)?.action || "";
}

function readTaskText(value, preferredFields = []) {
  if (typeof value === "string") {
    const text = value.trim();
    return /^\[object\s+[^\]]+\]$/i.test(text) ? "" : text;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => readTaskText(item, preferredFields)).filter(Boolean).join("；");
  }
  if (!value || typeof value !== "object") return "";
  const fields = [...new Set([
    ...preferredFields,
    "nextStart", "action", "description", "minimumOutput", "text", "label",
  ])];
  for (const field of fields) {
    const fieldValue = value[field];
    if (typeof fieldValue === "string" && fieldValue.trim()) return fieldValue.trim();
    if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) return String(fieldValue);
    if (Array.isArray(fieldValue)) {
      const text = fieldValue.map((item) => readTaskText(item)).filter(Boolean).join("；");
      if (text) return text;
    }
  }
  return "";
}

function normalizeTaskStartAction(value) {
  const action = readTaskText(value, ["nextStart", "action", "minimumOutput", "description"]);
  return action && !/^(?:未记录|未填写|暂无|无)$/i.test(action) ? action : "";
}

function getPlannedTaskStartContext(task) {
  if (!task) return null;
  const nextStart = normalizeTaskStartAction(task.nextStart);
  if (nextStart) return { action: nextStart, source: "today-plan", date: getDateKey() };
  const minimum = normalizeTaskStartAction(task.minimum);
  if (minimum) return { action: minimum, source: "today-minimum", date: getDateKey() };
  const manualAction = task.manualEdited === true ? normalizeTaskStartAction(task.description) : "";
  return manualAction ? { action: manualAction, source: "manual-edit", date: getDateKey() } : null;
}

function getPlannedTaskStartAction(task) {
  return getPlannedTaskStartContext(task)?.action || "";
}

function getTaskStartContext(task) {
  const contexts = [
    getPlannedTaskStartContext(task),
    getSavedProfessionalStartContext(task),
    getSavedRecordedStartContext(task),
  ];
  for (const context of contexts) {
    const action = normalizeTaskStartAction(context && context.action);
    if (action) return { ...context, action };
  }
  return null;
}

function getTaskExactStartAction(task) {
  return getTaskStartContext(task)?.action || "";
}

function formatTaskStartDate(dateKey) {
  const match = String(dateKey || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}月${Number(match[2])}日` : "";
}

function formatTaskStartContext(context) {
  const action = normalizeTaskStartAction(context && context.action);
  if (!context || !action) return "";
  if (context.source === "formal-record") {
    const date = formatTaskStartDate(context.date);
    return `${date ? `承接 ${date} 正式记录` : "承接正式记录"}：${action}`;
  }
  if (context.source === "manual-edit") return `人工调整：${action}`;
  return `从这里开始：${action}`;
}

function getTaskExecutionDescription(task) {
  const context = getTaskStartContext(task);
  const contextText = formatTaskStartContext(context);
  if (contextText) return contextText;
  if (!task) return "暂无任务说明";
  return readTaskText(task.description, ["description", "minimumOutput", "text"])
    || readTaskText(task.minimum, ["minimumOutput", "description", "text"])
    || "暂无任务说明";
}

function getTaskExecutionBriefPhaseKey(task) {
  const sourceKey = String(task && task.sourceTaskKey || "");
  if (sourceKey === "originalTextOrReview") return "review";
  if (sourceKey === "outputOrMock") return "output";
  if (sourceKey) return sourceKey;
  return {
    english: "english",
    englishReading: "english",
    maYuan: "722",
    maHistory: "844",
    politics: "politics",
    output: "output",
    rollingReview: "review",
    exercise: "training",
  }[String(task && task.category || "")] || "";
}

function getTaskPhaseExecutionContext(task) {
  if (!task || typeof getP0PhaseOverview !== "function") return {};
  const overview = getP0PhaseOverview(readJson(planPhaseTemplatesKey, []), getDateKey());
  const phase = overview && overview.current;
  const key = getTaskExecutionBriefPhaseKey(task);
  if (!phase || !key) return {};
  const chapter = readTaskText(phase.chapterTasks && phase.chapterTasks[key], ["description", "text"]);
  const template = readTaskText(phase.taskTemplates && phase.taskTemplates[key], ["description", "text"]);
  return {
    scope: [chapter, template].filter(Boolean).join("；"),
    completionCriteria: readTaskText(phase.completionCriteria && phase.completionCriteria[key], ["completionCriteria", "minimumOutput", "description"]),
  };
}

function getTaskExecutionBrief(task) {
  if (!task || typeof createTaskExecutionBrief !== "function") return null;
  const startContext = getTaskStartContext(task);
  const phase = getTaskPhaseExecutionContext(task);
  const todaySource = task.manualEdited === true ? "manual-edit" : "today-plan";
  const startSource = startContext && startContext.source || "safe-default";
  return createTaskExecutionBrief({
    taskId: task.id || task.taskId,
    startCandidates: [
      { text: startContext && startContext.action, source: startSource },
      { text: getFiveMinuteStartAction(task), source: "safe-default" },
    ],
    scopeCandidates: [
      {
        text: readTaskText(task.description, ["description", "minimumOutput", "text"])
          || readTaskText(task.minimum, ["minimumOutput", "description", "text"]),
        source: todaySource,
      },
      { text: phase.scope, source: "phase-plan" },
    ],
    completionCandidates: [
      {
        text: readTaskText(task.completionCriteria, ["completionCriteria", "minimumOutput", "description"])
          || readTaskText(task.minimumOutput, ["minimumOutput", "completionCriteria", "description"]),
        source: todaySource,
      },
      { text: phase.completionCriteria, source: "phase-plan" },
      { text: "保存真实完成内容、未完成点和下一准确起点。", source: "safe-default" },
    ],
    fallbackCandidates: [
      {
        text: readTaskText(task.fallbackPlan, ["fallback", "description", "text"])
          || readTaskText(task.fallback, ["fallback", "description", "text"]),
        source: todaySource,
      },
      { text: "时间不足时保留真实未完成状态，只记录已完成部分和下一准确起点。", source: "safe-default" },
    ],
  });
}

function renderTaskExecutionBrief(container, brief, options = {}) {
  if (!container) return false;
  container.replaceChildren();
  if (!brief || !brief.actionable) {
    container.hidden = true;
    return false;
  }
  const fields = options.compact === true
    ? [["先做", brief.startAction], ["完成", brief.completionCriteria]]
    : [["现在先做", brief.startAction], ["任务范围", brief.scope], ["完成标准", brief.completionCriteria], ["时间不足", brief.fallbackAction]];
  fields.filter(([, value]) => value).forEach(([label, value]) => {
    const row = document.createElement("div");
    const key = document.createElement("span");
    const text = document.createElement("strong");
    key.textContent = label;
    text.textContent = value;
    row.append(key, text);
    container.appendChild(row);
  });
  if (brief.sourceSummary) {
    const source = document.createElement("small");
    source.textContent = `依据：${brief.sourceSummary}`;
    container.appendChild(source);
  }
  container.hidden = false;
  return true;
}

function getFiveMinuteStartAction(task) {
  if (!task) return "打开当前材料，先完成一个最小动作。";
  const exactAction = getTaskExactStartAction(task);
  if (exactAction) return exactAction;
  if (task.category === "maYuan") return "打开教材当前位置，闭卷写出3个一级标题。";
  if (task.category === "maHistory") return "打开教材当前位置，写出当前人物—著作—命题链。";
  if (task.category === "english" || task.category === "englishReading") return "打开今天的真题，先完成第一题的原文定位。";
  if (task.category === "politics") return "打开当前章节，先学习5分钟或完成5道选择题。";
  if (task.category === "output") return "先闭卷写出题目的3个一级论点。";
  return readTaskText(task.description, ["description", "minimumOutput", "text"])
    || readTaskText(task.minimum, ["minimumOutput", "description", "text"])
    || "打开当前材料，先完成一个最小动作。";
}

function prepareFiveMinuteStartup(task) {
  focusTimingMode = POMODORO_FOCUS_MODE;
  currentFocusSeconds = 0;
  pomodoroRemainingSeconds = FIVE_MINUTE_START_SECONDS;
  focusRoundStartedAt = null;
  focusTimerState = createFocusTimerState({
    date: getDateKey(),
    mode: POMODORO_FOCUS_MODE,
    remainingSeconds: FIVE_MINUTE_START_SECONDS,
  });
  syncFocusRuntimeFromState();
  syncFocusRoundGoal(getFiveMinuteStartAction(task));
  savePomodoroState();
  updatePomodoroDisplay();
}

function syncFiveMinuteStartupUi() {
  const startup = isFiveMinuteStartupRound();
  const task = getTodayPlan().tasks.find((item) => item.id === focusTimerState.activeTaskId)
    || getTodayPlan().tasks.find((item) => item.id === document.querySelector("#focusTask").value);
  const title = document.querySelector("#focusModeTitle");
  const output = document.querySelector("#focusModeOutput");
  const selector = document.querySelector(".focus-overlay-selector");
  const startButton = document.querySelector("#focusModeStartBtn");
  const actionButton = document.querySelector("#focusModeActionBtn");
  const completeButton = document.querySelector("#focusModeCompleteBtn");
  if (title) title.textContent = startup ? "先做5分钟" : "当前只做这一件事";
  if (startup && output) output.textContent = `最小动作：${getFiveMinuteStartAction(task)}`;
  if (selector) selector.hidden = startup;
  if (startButton) {
    startButton.textContent = startup ? (focusTimerState.running ? "5分钟进行中" : "继续刚才的5分钟") : "开始 / 继续";
    startButton.disabled = startup && focusTimerState.running;
  }
  if (actionButton) actionButton.hidden = startup;
  if (completeButton) completeButton.hidden = startup;
}

function readFocusTotals() {
  const totals = readJson(focusMinutesKey, {});
  return totals && typeof totals === "object" && !Array.isArray(totals) ? totals : {};
}

function readTaskFocusTotals() {
  const totals = readJson(taskFocusSecondsKey, {});
  return totals && typeof totals === "object" && !Array.isArray(totals) ? totals : {};
}

function getFocusSecondsForDate(dateKey = getDateKey()) {
  return Math.max(0, Number(readFocusTotals()[dateKey]) || 0);
}

function getTaskFocusSeconds(dateKey, taskId) {
  const dateTotals = readTaskFocusTotals()[dateKey];
  return dateTotals && typeof dateTotals === "object" ? Math.max(0, Number(dateTotals[taskId]) || 0) : 0;
}

function saveFinalizedFocusSession(segment) {
  if (!segment || !Number.isFinite(segment.seconds) || segment.seconds <= 0) return null;
  const sessions = readJson(focusSessionsKey, []);
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const task = segment.taskId ? getTodayPlan().tasks.find((item) => item.id === segment.taskId) : null;
  const session = {
    id: `focus-${segment.endedAt}-${safeSessions.length}`,
    date: segment.date,
    mode: segment.mode,
    seconds: segment.seconds,
    taskId: segment.taskId || "",
    taskName: segment.taskName || (task ? task.name : "未归属"),
    taskTime: task ? task.time || "" : "",
    attribution: segment.attribution === "task" ? "task" : "unassigned",
    contextKind: segment.contextKind === "due-review" ? "due-review" : "",
    contextId: segment.contextKind === "due-review" ? String(segment.contextId || "").slice(0, 120) : "",
    goal: localStorage.getItem(focusRoundGoalKey) || "",
    startedAt: new Date(segment.startedAt).toISOString(),
    endedAt: new Date(segment.endedAt).toISOString(),
    reason: segment.reason,
  };
  safeSessions.push(session);
  writeJson(focusSessionsKey, safeSessions);
  return session;
}

function updateFocusSessionsWrapup(sessionIds, completed, nextStep) {
  const ids = new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds]).map((id) => String(id || "")).filter(Boolean));
  if (!ids.size) return;
  const sessions = readJson(focusSessionsKey, []);
  if (!Array.isArray(sessions)) return;
  writeJson(focusSessionsKey, sessions.map((session) => session && ids.has(String(session.id || ""))
    ? { ...session, completed, nextStep, wrapupSaved: true }
    : session));
}

function updateFocusSessionWrapup(sessionId, completed, nextStep) {
  updateFocusSessionsWrapup([sessionId], completed, nextStep);
}

function savePomodoroState() {
  focusTimerState.mode = focusTimingMode;
  focusTimerState.remainingSeconds = pomodoroRemainingSeconds;
  focusTimerState.currentFocusSeconds = currentFocusSeconds;
  focusTimerState.roundStartedAt = focusRoundStartedAt;
  focusTimerState.running = Boolean(pomodoroTimerId && focusTimerState.running);
  writeJson(focusTimerStateKey, focusTimerState);
}

function syncFocusRuntimeFromState() {
  focusTimingMode = focusTimerState.mode;
  pomodoroRemainingSeconds = focusTimerState.remainingSeconds;
  currentFocusSeconds = focusTimerState.currentFocusSeconds;
  focusRoundStartedAt = focusTimerState.roundStartedAt;
}

function restorePomodoroStateFromStorage() {
  if (pomodoroTimerId) window.clearInterval(pomodoroTimerId);
  pomodoroTimerId = null;
  focusTimerState = normalizeFocusTimerState(readJson(focusTimerStateKey, {}), { date: getDateKey() });
  const restoredReviewId = restorePendingFocusReviewFromTimerState(focusTimerState);
  syncFocusRuntimeFromState();
  if (focusTimerState.running) {
    finalizeFocusSegment({ endedAt: Date.now(), reason: "page-reload" });
    setStatus("#executionStatus", "检测到页面刷新，已结算到最后心跳并暂停；请手动继续。 ");
  }
  if (restoredReviewId && !isPendingFocusReviewCurrent()) {
    settleStaleRestoredFocusReview();
    return;
  }
  savePomodoroState();
  updatePomodoroDisplay();
  if (!showFocusRecoveryIfNeeded()) restorePendingFocusReviewResultCard();
}

function updatePomodoroDisplay() {
  const liveSeconds = getLiveFocusSegmentSeconds(focusTimerState);
  const currentText = focusTimingMode === FREE_FOCUS_MODE
    ? formatFocusClock(currentFocusSeconds + liveSeconds)
    : formatPomodoroTime(Math.max(0, pomodoroRemainingSeconds - liveSeconds));
  if (typeof renderStudyTimeSummary === "function") renderStudyTimeSummary();
  const todayText = formatFocusClock(getFocusSecondsForDate() + liveSeconds);
  document.querySelector("#focusModeTime").textContent = currentText;
  document.querySelector("#currentFocusTime").textContent = currentText;
  document.querySelector("#todayFocusTotal").textContent = todayText;
  document.querySelector("#focusModeTodayTotal").textContent = todayText;
  const freeModeSelected = focusTimingMode === FREE_FOCUS_MODE;
  ["#freeFocusModeBtn", "#focusModeFreeBtn"].forEach((selector) => {
    const button = document.querySelector(selector);
    button.classList.toggle("is-active", freeModeSelected);
    button.setAttribute("aria-pressed", String(freeModeSelected));
  });
  ["#pomodoroFocusModeBtn", "#focusModePomodoroBtn"].forEach((selector) => {
    const button = document.querySelector(selector);
    button.classList.toggle("is-active", !freeModeSelected);
    button.setAttribute("aria-pressed", String(!freeModeSelected));
  });
  const actionLabel = freeModeSelected ? "结束本次专注" : "重置";
  document.querySelector("#resetPomodoroBtn").textContent = actionLabel;
  document.querySelector("#focusModeActionBtn").textContent = actionLabel;
  document.title = pomodoroTimerId ? `${currentText} · 学习面板` : "南开马理论考研任务面板";
  syncFiveMinuteStartupUi();
}

function addFocusSeconds(dateKey, taskId, seconds) {
  if (seconds <= 0) return;
  const totals = readFocusTotals();
  totals[dateKey] = Math.max(0, Number(totals[dateKey]) || 0) + seconds;
  writeJson(focusMinutesKey, totals);

  if (!taskId) return;
  const taskTotals = readTaskFocusTotals();
  const dateTotals = taskTotals[dateKey] && typeof taskTotals[dateKey] === "object" ? taskTotals[dateKey] : {};
  dateTotals[taskId] = Math.max(0, Number(dateTotals[taskId]) || 0) + seconds;
  taskTotals[dateKey] = dateTotals;
  writeJson(taskFocusSecondsKey, taskTotals);
}

function addFocusSecondsAcrossDates(startedAt, seconds, taskId) {
  let cursor = startedAt;
  let remaining = seconds;
  while (remaining > 0) {
    const date = new Date(cursor);
    const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const secondsUntilMidnight = Math.max(1, Math.ceil((nextMidnight - cursor) / 1000));
    const portion = Math.min(remaining, secondsUntilMidnight);
    addFocusSeconds(getDateKey(date), taskId, portion);
    cursor += portion * 1000;
    remaining -= portion;
  }
}

function stopPomodoroInterval() {
  if (pomodoroTimerId) window.clearInterval(pomodoroTimerId);
  pomodoroTimerId = null;
}

function finalizeFocusSegment({ endedAt = Date.now(), reason = "paused" } = {}) {
  stopPomodoroInterval();
  const result = finalizeFocusTimerSegment(focusTimerState, {
    endedAt,
    reason,
    gapThresholdMs: FOCUS_HEARTBEAT_GAP_MS,
  });
  focusTimerState = result.state;
  syncFocusRuntimeFromState();
  let session = null;
  if (result.segment) {
    const ledger = applyFocusSegmentToLedger(readFocusTotals(), readTaskFocusTotals(), result.segment);
    if (ledger.applied) {
      writeJson(focusMinutesKey, ledger.focusTotals);
      writeJson(taskFocusSecondsKey, ledger.taskTotals);
    }
    session = saveFinalizedFocusSession(result.segment);
    lastFinalizedFocusSession = session;
    if (session && typeof renderTodayStudyTimeline === "function") renderTodayStudyTimeline();
  }
  savePomodoroState();
  updatePomodoroDisplay();
  if (typeof renderRecentSevenDays === "function") renderRecentSevenDays();
  if (typeof renderExamStatsOverview === "function") renderExamStatsOverview();
  return { ...result, session };
}

function resetFocusRound() {
  currentFocusSeconds = 0;
  pomodoroRemainingSeconds = POMODORO_SECONDS;
  focusRoundStartedAt = null;
  focusTimerState = createFocusTimerState({
    date: getDateKey(),
    mode: focusTimingMode,
    remainingSeconds: POMODORO_SECONDS,
    pausedReason: focusTimerState.pausedReason,
  });
  lastFinalizedFocusSession = null;
  syncFocusRuntimeFromState();
  savePomodoroState();
  if (document.querySelector("#currentFocusTime")) updatePomodoroDisplay();
}

function finishPomodoroIfNeeded(session = lastFinalizedFocusSession) {
  if (focusTimingMode !== POMODORO_FOCUS_MODE || pomodoroRemainingSeconds > 0) return false;
  const startupCompleted = isFiveMinuteStartupRound();
  const reviewCompleted = Boolean(pendingFocusReview && session);
  resetFocusRound();
  setStatus("#executionStatus", reviewCompleted
    ? "复盘专注已结算，请填写三行闭卷证据并判断结果。"
    : startupCompleted ? "5分钟启动已完成，请选择继续25分钟或记录卡点。" : "25分钟番茄已完成，等待再次开始。");
  if (reviewCompleted) showFocusReviewResultCard(session);
  else if (startupCompleted) showFiveMinuteStartupChoice(session);
  else showFocusWrapup(session);
  return true;
}

function pausePomodoro(reason = "manual-pause") {
  const result = finalizeFocusSegment({ reason: normalizeFocusReason(reason, "manual-pause") });
  const completedPomodoro = finishPomodoroIfNeeded(result.session);
  if (typeof renderTasks === "function") renderTasks();
  return completedPomodoro;
}

function setFocusTimingMode(mode) {
  if (![FREE_FOCUS_MODE, POMODORO_FOCUS_MODE].includes(mode) || mode === focusTimingMode) return;
  finalizeFocusSegment({ reason: "mode-switched" });
  focusTimingMode = mode;
  resetFocusRound();
  updatePomodoroDisplay();
}

function startPomodoro() {
  if (pomodoroTimerId) return;
  const selectedTaskId = document.querySelector("#focusTask").value;
  if (!selectedTaskId) {
    setStatus("#executionStatus", "请先选择任务；无法归属时可选择“未归属专注”。", true);
    return;
  }
  if (focusTimingMode === POMODORO_FOCUS_MODE && pomodoroRemainingSeconds <= 0) {
    pomodoroRemainingSeconds = POMODORO_SECONDS;
  }
  const plan = getTodayPlan();
  const activation = activatePlanTaskForFocus(plan, selectedTaskId);
  const task = activation.task;
  if (activation.changed) saveTodayPlan(plan);
  const taskId = task ? task.id : "";
  const taskName = task ? task.name : "未归属";
  const priorTaskId = focusTimerState.activeTaskId;
  const resetOverrunPrompt = priorTaskId !== taskId || focusTimerState.activeTaskName !== taskName;
  focusTimerState.remainingSeconds = pomodoroRemainingSeconds;
  focusTimerState.currentFocusSeconds = currentFocusSeconds;
  focusTimerState.roundStartedAt = focusRoundStartedAt;
  focusTimerState = startFocusTimerSegment(focusTimerState, {
    now: Date.now(),
    date: getDateKey(),
    activeTaskId: taskId,
    activeTaskName: taskName,
    contextKind: pendingFocusReview ? "due-review" : "",
    contextId: pendingFocusReview ? pendingFocusReview.reviewId : "",
    resetOverrunPrompt,
  });
  syncFocusRuntimeFromState();
  lastFocusActivityAt = Date.now();
  pomodoroTimerId = window.setInterval(handleFocusHeartbeat, 1000);
  savePomodoroState();
  if (activation.changed) renderTasks();
  else updatePomodoroDisplay();
}

function finishOrResetFocus() {
  const finishedSeconds = currentFocusSeconds + getLiveFocusSegmentSeconds(focusTimerState);
  const result = finalizeFocusSegment({ reason: focusTimingMode === FREE_FOCUS_MODE ? "free-focus-ended" : "pomodoro-reset" });
  if (finishPomodoroIfNeeded(result.session)) return;
  const session = result.session || lastFinalizedFocusSession;
  resetFocusRound();
  updatePomodoroDisplay();
  if (pendingFocusReview && session) {
    setStatus("#executionStatus", "复盘专注已结算，请填写三行闭卷证据并判断结果。");
    showFocusReviewResultCard(session);
    return;
  }
  if (focusTimingMode === FREE_FOCUS_MODE) {
    setStatus("#executionStatus", finishedSeconds ? `本次自由专注已结束：${formatFocusClock(finishedSeconds)}` : "当前没有需要结束的专注时间。");
    showFocusWrapup(session);
  } else {
    setStatus("#executionStatus", finishedSeconds ? "本轮番茄已结算并重置为25:00。" : "番茄已重置为25:00。");
  }
}

function getPlannedTaskSeconds(task) {
  const match = String(task && task.time || "").match(/(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  let endMinutes = Number(match[3]) * 60 + Number(match[4]);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return Math.max(0, endMinutes - startMinutes) * 60;
}

function openFocusOverrunPrompt(task, taskSeconds, plannedSeconds) {
  if (!task || focusTimerState.overrunPromptShown) return;
  focusTimerState.overrunPromptShown = true;
  savePomodoroState();
  document.querySelector("#focusOverrunMessage").textContent = `${task.name} 已专注 ${formatFocusDuration(taskSeconds)}，比计划时长多出至少30分钟。计时仍在继续，请选择下一步。`;
  document.querySelector("#focusOverrunDialog").hidden = false;
}

function checkFocusOverrun(now = Date.now()) {
  if (!focusTimerState.running || !focusTimerState.activeTaskId) return;
  const task = getTodayPlan().tasks.find((item) => item.id === focusTimerState.activeTaskId);
  const plannedSeconds = getPlannedTaskSeconds(task);
  const taskSeconds = getTaskFocusSeconds(focusTimerState.date, focusTimerState.activeTaskId)
    + getLiveFocusSegmentSeconds(focusTimerState, now);
  if (shouldShowFocusOverrun(taskSeconds, plannedSeconds, focusTimerState.overrunPromptShown)) {
    openFocusOverrunPrompt(task, taskSeconds, plannedSeconds);
  }
}

function handleFocusHeartbeat() {
  if (!pomodoroTimerId || !focusTimerState.running) return;
  const now = Date.now();
  if (document.visibilityState === "hidden") {
    focusTimerState = refreshRunningFocusHeartbeat(focusTimerState, { now });
    savePomodoroState();
    return;
  }
  if (getFocusDateKey(now) !== focusTimerState.date) {
    finalizeFocusSegment({ endedAt: now, reason: "date-rollover" });
    resetFocusRound();
    focusTimerState.pausedReason = "date-rollover";
    savePomodoroState();
    setStatus("#executionStatus", "已在跨日边界结算昨天专注；今天计时从0开始，请手动启动。 ");
    return;
  }
  if (now - focusTimerState.lastHeartbeatAt > FOCUS_HEARTBEAT_GAP_MS) {
    finalizeFocusSegment({ endedAt: now, reason: "device-sleep" });
    setStatus("#executionStatus", "检测到设备休眠或后台心跳中断，间隔未计入，计时已暂停。 ");
    return;
  }
  if (now - lastFocusActivityAt > FOCUS_INACTIVITY_LIMIT_MS) {
    finalizeFocusSegment({ endedAt: lastFocusActivityAt, reason: "inactivity" });
    setStatus("#executionStatus", "检测到长时间无操作，已结算到最后活动时间并暂停。 ");
    return;
  }
  focusTimerState.lastHeartbeatAt = now;
  const liveSeconds = getLiveFocusSegmentSeconds(focusTimerState, now);
  savePomodoroState();
  if (focusTimingMode === POMODORO_FOCUS_MODE && liveSeconds >= pomodoroRemainingSeconds) {
    const endedAt = focusTimerState.segmentStartedAt + pomodoroRemainingSeconds * 1000;
    const result = finalizeFocusSegment({ endedAt, reason: isFiveMinuteStartupRound() ? "startup-completed" : "pomodoro-completed" });
    finishPomodoroIfNeeded(result.session);
    return;
  }
  checkFocusOverrun(now);
  updatePomodoroDisplay();
}

function settleBeforeFocusTaskSwitch(nextTaskId) {
  const normalizedNextId = nextTaskId === "__unassigned__" ? "" : nextTaskId;
  const sameAttribution = focusTimerState.activeTaskId === normalizedNextId
    && (normalizedNextId || focusTimerState.activeTaskName === "未归属");
  if (sameAttribution) return;
  const hadRound = focusTimerState.running || currentFocusSeconds > 0 || focusRoundStartedAt;
  if (focusTimerState.running) finalizeFocusSegment({ reason: "task-switch" });
  if (hadRound) {
    resetFocusRound();
    setStatus("#executionStatus", "上一任务已独立结算并暂停；请手动开始新任务。 ");
  }
}

function handleFocusOverrunAction(action) {
  const dialog = document.querySelector("#focusOverrunDialog");
  if (action === "continue") {
    dialog.hidden = true;
    return;
  }
  const reason = action === "pause" ? "manual-pause" : action === "switch" ? "task-switch" : "overrun-end";
  const result = finalizeFocusSegment({ reason });
  dialog.hidden = true;
  if (action === "switch") {
    resetFocusRound();
    document.querySelector("#focusTask").focus();
    setStatus("#executionStatus", "当前任务已结算，请选择新任务并手动开始。 ");
    return;
  }
  if (action === "end") {
    const session = result.session || lastFinalizedFocusSession;
    resetFocusRound();
    setStatus("#executionStatus", "本次超时专注已结束，请填写结果。 ");
    showFocusWrapup(session);
    return;
  }
  setStatus("#executionStatus", "专注已暂停，可手动继续。 ");
}

function noteFocusActivity() {
  if (focusTimerState.running) lastFocusActivityAt = Date.now();
}

function pauseFocusForPageExit(reason) {
  if (!focusTimerState.running) return;
  if (reason === "pagehide" && focusTimerContinuedWhileHidden) {
    focusTimerState = refreshRunningFocusHeartbeat(focusTimerState, { now: Date.now() });
  }
  finalizeFocusSegment({ reason });
}

function continueFocusWhilePageHidden() {
  focusTimerContinuedWhileHidden = Boolean(focusTimerState.running);
  if (!focusTimerContinuedWhileHidden) return;
  focusTimerState = refreshRunningFocusHeartbeat(focusTimerState, { now: Date.now() });
  savePomodoroState();
}

function resumeFocusAfterHiddenPage() {
  if (!focusTimerContinuedWhileHidden || !focusTimerState.running) {
    focusTimerContinuedWhileHidden = false;
    showFocusRecoveryIfNeeded();
    return;
  }
  focusTimerContinuedWhileHidden = false;
  focusTimerState = refreshRunningFocusHeartbeat(focusTimerState, { now: Date.now() });
  handleFocusHeartbeat();
}

function getFocusRecoveryTask() {
  const taskId = String(focusTimerState.activeTaskId || "");
  return getTodayPlan().tasks.find((task) => String(task && task.id || "") === taskId) || null;
}

function showFocusRecoveryIfNeeded() {
  if (!shouldShowFocusRecovery(focusTimerState)) return false;
  const task = getFocusRecoveryTask();
  if (!task) return false;
  const focusTask = document.querySelector("#focusTask");
  if (focusTask) focusTask.value = task.id;
  const reviewState = pendingFocusReview ? getCurrentReviewExecutionState() : null;
  const recoveryLabel = pendingFocusReview && reviewState && reviewState.active && reviewState.active.reviewId === pendingFocusReview.reviewId
    ? `复盘 · ${reviewState.active.reviewLevel} · ${reviewState.active.subject} · ${reviewState.active.knowledgeUnit || reviewState.active.task}`
    : `${task.time ? `${task.time} · ` : ""}${task.name}`;
  document.querySelector("#focusRecoveryTask").textContent = recoveryLabel;
  const isPomodoro = focusTimingMode === POMODORO_FOCUS_MODE;
  document.querySelector("#focusRecoveryTimeLabel").textContent = isPomodoro ? "本轮剩余" : "本轮已记录";
  document.querySelector("#focusRecoveryTime").textContent = isPomodoro
    ? formatPomodoroTime(pomodoroRemainingSeconds)
    : formatFocusClock(currentFocusSeconds);
  document.querySelector("#focusRecoveryPauseInput").value = "";
  setStatus("#focusRecoveryStatus", "");
  document.querySelector("#focusMainCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = true;
  document.querySelector("#focusRecoveryCard").hidden = false;
  document.querySelector("#focusModeOverlay").hidden = false;
  document.body.classList.add("focus-mode-active");
  return true;
}

function continueFocusRecovery({ shrinkGoal = false } = {}) {
  const task = getFocusRecoveryTask();
  if (!task) {
    setStatus("#focusRecoveryStatus", "当前任务已不存在，请退出后重新选择任务。", true);
    return;
  }
  if (shrinkGoal) syncFocusRoundGoal(getFiveMinuteStartAction(task));
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusMainCard").hidden = false;
  syncFocusModeContent();
  startPomodoro();
  updatePomodoroDisplay();
}

function recordFocusRecoveryPause() {
  const reason = document.querySelector("#focusRecoveryPauseInput").value.trim().slice(0, 120);
  if (!reason) {
    setStatus("#focusRecoveryStatus", "请写一句现在必须处理的事。", true);
    document.querySelector("#focusRecoveryPauseInput").focus();
    return;
  }
  const thoughts = readJson(focusThoughtsKey, {});
  const safeThoughts = thoughts && typeof thoughts === "object" && !Array.isArray(thoughts) ? thoughts : {};
  const dateKey = getDateKey();
  const todayThoughts = Array.isArray(safeThoughts[dateKey]) ? safeThoughts[dateKey] : [];
  todayThoughts.push({ text: `暂停处理：${reason}`, savedAt: new Date().toISOString() });
  safeThoughts[dateKey] = todayThoughts;
  writeJson(focusThoughtsKey, safeThoughts);
  focusTimerState.pausedReason = "manual-pause";
  savePomodoroState();
  setStatus("#executionStatus", `专注保持暂停；已记录：${reason}`);
  exitFocusMode();
}

function showFocusWrapup(session) {
  if (!session) return;
  if (pendingFocusReview && showFocusReviewResultCard(session)) return;
  const task = getFocusWrapupTask(session);
  const resultAction = typeof getFocusWrapupResultAction === "function"
    ? getFocusWrapupResultAction(task)
    : null;
  if (canOpenFocusWrapupResult(resultAction)) {
    pendingFocusWrapup = null;
    pendingFocusResultSession = {
      sessionId: String(session.id || ""),
      taskId: String(task && task.id || ""),
    };
    exitFocusMode();
    openFocusWrapupResult(task, resultAction);
    return;
  }
  pendingFocusResultSession = null;
  pendingFocusWrapup = session;
  document.querySelector("#focusWrapupTask").textContent = `${session.taskTime ? `${session.taskTime} · ` : ""}${session.taskName || "未选择任务"}`;
  document.querySelector("#focusWrapupDuration").textContent = formatFocusClock(session.seconds);
  document.querySelector("#focusWrapupTodayTotal").textContent = formatFocusClock(getFocusSecondsForDate());
  document.querySelector("#focusWrapupCompleted").value = "";
  document.querySelector("#focusWrapupNext").value = "";
  document.querySelector("#focusMainCard").hidden = true;
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = false;
  document.querySelector("#focusModeOverlay").hidden = false;
  document.body.classList.add("focus-mode-active");
}

function showFiveMinuteStartupChoice(session) {
  if (!session) return;
  if (pendingFocusReview && showFocusReviewResultCard(session)) return;
  pendingStartupSession = session;
  document.querySelector("#focusStartupTask").textContent = `${session.taskTime ? `${session.taskTime} · ` : ""}${session.taskName || "当前任务"}`;
  document.querySelector("#focusStartupDuration").textContent = formatFocusClock(session.seconds);
  document.querySelector("#focusStartupBlockerInput").value = "";
  setStatus("#focusStartupChoiceStatus", "");
  document.querySelector("#focusMainCard").hidden = true;
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = false;
  document.querySelector("#focusModeOverlay").hidden = false;
  document.body.classList.add("focus-mode-active");
}

function continueAfterFiveMinuteStartup() {
  if (!pendingStartupSession) return;
  updateFocusSessionWrapup(pendingStartupSession.id, "完成5分钟启动", "继续25分钟");
  pendingStartupSession = null;
  renderTodayFocusOutputs();
  renderHistory();
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusMainCard").hidden = false;
  focusTimingMode = POMODORO_FOCUS_MODE;
  resetFocusRound();
  startPomodoro();
  updatePomodoroDisplay();
}

function recordFiveMinuteStartupBlocker() {
  if (!pendingStartupSession) return;
  const blocker = document.querySelector("#focusStartupBlockerInput").value.trim().slice(0, 120);
  if (!blocker) {
    setStatus("#focusStartupChoiceStatus", "请写下具体卡点，避免下次重新判断。", true);
    document.querySelector("#focusStartupBlockerInput").focus();
    return;
  }
  updateFocusSessionWrapup(pendingStartupSession.id, "完成5分钟启动", blocker);
  pendingStartupSession = null;
  renderTodayFocusOutputs();
  renderHistory();
  setStatus("#executionStatus", `已记录卡点：${blocker}`);
  exitFocusMode();
}

function getFocusWrapupTask(session = pendingFocusWrapup) {
  const taskId = String(session && session.taskId || "");
  if (!taskId) return null;
  return getTodayPlan().tasks.find((task) => String(task && (task.taskId || task.id) || "") === taskId) || null;
}

function canOpenFocusWrapupResult(action) {
  if (!action) return false;
  if (["words", "reading", "english", "politics"].includes(action.kind)) {
    return typeof openP1ResultDialog === "function";
  }
  if (action.kind === "output") return typeof handleP1OutputAction === "function";
  if (action.kind === "professional") return typeof openProfessionalTaskRecord === "function";
  return false;
}

function openFocusWrapupResult(task, action) {
  if (!task || !action) return;
  const taskId = String(task.taskId || task.id || "");
  if (["words", "reading", "politics"].includes(action.kind) && typeof openP1ResultDialog === "function") {
    openP1ResultDialog(action.kind, taskId);
    return;
  }
  if (action.kind === "english" && typeof openP1ResultDialog === "function") {
    openP1ResultDialog("reading", taskId);
    return;
  }
  if (action.kind === "output" && typeof handleP1OutputAction === "function") {
    handleP1OutputAction("p1-output", task);
    return;
  }
  if (action.kind === "professional") {
    const planPanel = document.querySelector("#todayPlanPanel");
    if (planPanel) planPanel.open = true;
    if (typeof openProfessionalTaskRecord === "function") openProfessionalTaskRecord(task);
  }
}

function finishFocusWrapup(continueNext) {
  if (!pendingFocusWrapup) return;
  const completed = document.querySelector("#focusWrapupCompleted").value.trim().slice(0, 160);
  const nextStep = document.querySelector("#focusWrapupNext").value.trim().slice(0, 120);
  updateFocusSessionWrapup(pendingFocusWrapup.id, completed, nextStep);
  syncFocusRoundGoal(nextStep);
  pendingFocusWrapup = null;
  renderTodayFocusOutputs();
  renderHistory();
  if (continueNext) {
    syncFocusModeContent();
    document.querySelector("#focusWrapupCard").hidden = true;
    document.querySelector("#focusMainCard").hidden = false;
    updatePomodoroDisplay();
    return;
  }
  exitFocusMode();
}

function skipFocusWrapup() {
  pendingFocusWrapup = null;
  pendingFocusResultSession = null;
  exitFocusMode();
}

function syncFocusModeContent() {
  const select = document.querySelector("#focusTask");
  const task = getTodayPlan().tasks.find((item) => item.id === (select && select.value));
  document.querySelector("#currentTaskTime").value = task ? task.time || "自定" : "";
  document.querySelector("#focusOutput").value = task ? getTaskExecutionDescription(task) : "";
  document.querySelector("#focusModeTask").textContent = task
    ? `${task.time ? `${task.time} · ` : ""}${task.name}`
    : select && select.value === "__unassigned__" ? "未归属专注" : "尚未选择任务";
  document.querySelector("#focusModeOutput").textContent = task ? getTaskExecutionDescription(task) : "";
  renderTaskExecutionBrief(document.querySelector("#focusModeExecutionBrief"), task ? getTaskExecutionBrief(task) : null);
  syncFiveMinuteStartupUi();
  renderExecutionSurface();
}

function getDefaultExecutionSurfaceView(task, plan = getTodayPlan(), now = new Date()) {
  const reviewSaved = typeof hasTodayReview === "function" && hasTodayReview();
  if (!task) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const upcomingTask = typeof findNextScheduledPlanTask === "function"
      ? findNextScheduledPlanTask(plan && plan.tasks, nowMinutes)
      : null;
    if (upcomingTask) {
      const startTime = String(upcomingTask.time || "").split(/[—–-]/)[0].trim();
      return createExecutionSurfaceView({
        mode: EXECUTION_SURFACE_MODES.DEFAULT,
        meta: `等待下一时间段 · ${upcomingTask.time || "时间待定"}`,
        title: `下一项：${upcomingTask.name}`,
        description: `当前没有到点的正式任务；按日程完成当前安排，${startTime || "到时"}再进入这项任务。`,
        primary: { label: startTime ? `等待 ${startTime}` : "等待下一时间段", action: "", className: "ghost", disabled: true },
      });
    }
    const hasPendingTask = Array.isArray(plan && plan.tasks) && plan.tasks.some((item) => item
      && isDashboardExecutionTask(item)
      && !["completed", "skipped", "cancelled"].includes(getTaskStatus(item)));
    if (hasPendingTask) {
      return createExecutionSurfaceView({
        mode: EXECUTION_SURFACE_MODES.DEFAULT,
        meta: "当前时间段",
        title: "当前没有到点的正式任务",
        description: "未完成任务继续保留，但不会在错误时间段自动切换过来。",
        primary: { label: "等待计划时间", action: "", className: "ghost", disabled: true },
      });
    }
    return createExecutionSurfaceView({
      mode: EXECUTION_SURFACE_MODES.DEFAULT,
      meta: "今日正式任务",
      title: reviewSaved ? "今天的学习闭环已保存" : "今天的可执行任务已完成",
      description: reviewSaved
        ? "需要修改产出或明日第一动作时，可以重新打开今日闭环。"
        : "正式任务完成后，再用两句话收工，明天可以直接继续。",
      primary: {
        label: reviewSaved ? "查看今日闭环" : "一键收工",
        action: "daily-closeout",
        className: reviewSaved ? "success" : "primary",
      },
    });
  }
  const status = getTaskStatus(task);
  const config = getUnifiedTaskPrimary(task, status);
  return createExecutionSurfaceView({
    mode: EXECUTION_SURFACE_MODES.DEFAULT,
    taskId: task.id,
    contextId: config.contextId,
    meta: `${task.time || "自定时间"} · ${TASK_STATUS_LABELS[status] || "未开始"}`,
    title: task.name,
    description: getTaskExecutionDescription(task),
    primary: { ...config, taskId: task.id, contextId: config.contextId },
  });
}

function applyExecutionSurfaceView(view) {
  const title = document.querySelector("#executionTitle");
  const meta = document.querySelector("#cockpitTaskMeta");
  const description = document.querySelector("#cockpitTaskDescription");
  const button = document.querySelector("#enterFocusModeBtn");
  if (!view || !title || !meta || !description || !button) return false;
  meta.textContent = view.meta;
  title.textContent = view.title;
  description.textContent = view.description;
  button.textContent = view.primary.label;
  button.className = `button ${view.primary.className} cockpit-primary-action`;
  button.dataset.taskAction = view.primary.action;
  button.dataset.gapAction = view.primary.delegateAction;
  button.dataset.taskId = view.primary.taskId;
  button.disabled = view.primary.disabled;
  return view.valid;
}

function getSafeguardProfessionalTask(plan) {
  const tasks = Array.isArray(plan && plan.tasks) ? plan.tasks : [];
  const professionals = tasks.filter((task) => task && ["maYuan", "maHistory"].includes(task.category));
  const current = professionals.find((task) => task.id === plan.currentTaskId && getTaskStatus(task) !== "completed");
  return current
    || professionals.find((task) => getTaskStatus(task) === "in-progress")
    || professionals.find((task) => getTaskStatus(task) !== "completed")
    || professionals[0]
    || null;
}

function enterSafeguardMode() {
  const plan = getTodayPlan();
  const professional = getSafeguardProfessionalTask(plan);
  writeSafeguardModeState({
    date: getDateKey(),
    professionalTaskId: professional ? professional.id : "",
  });
  renderTasks();
  document.querySelector("#execution").scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("#executionStatus", "已进入今日保底执行：只做当前一步，完成后自动进入下一步。");
}

function exitSafeguardMode() {
  clearSafeguardModeState();
  document.body.classList.remove("safeguard-mode", "safeguard-review-step", "safeguard-closeout-step");
  renderTasks();
  setStatus("#executionStatus", "已返回正常计划，原任务状态和记录均已保留。");
}

function getSafeguardTaskDescription(step, task) {
  if (step.key === "professional") {
    return `只留下一个真实闭卷产物：${getFiveMinuteStartAction(task)} 完成后保存实际推进、闭卷产物和下一起点。`;
  }
  if (step.key === "english") {
    return "完成英语最低动作：打开真题，先做第一题并定位原文依据；单词继续在 App 中完成，不重复登记。";
  }
  if (step.key === "politics") {
    return "完成政治最低动作：先做5道选择题，标记错因，并保存今天的真实结果。";
  }
  return getTaskExecutionDescription(task);
}

function getSafeguardExecutionSurfaceModel(state, plan = getTodayPlan()) {
  if (!state) return null;
  const steps = buildSafeguardSequence(plan.tasks, {
    professionalTaskId: state.professionalTaskId,
    closeoutSaved: typeof hasTodayReview === "function" && hasTodayReview(),
  });
  const stepIndex = steps.findIndex((step) => !step.completed);
  const step = stepIndex >= 0 ? steps[stepIndex] : null;
  const progress = step
    ? `保底闭环 ${stepIndex + 1}/${steps.length}`
    : `保底闭环 ${steps.length}/${steps.length}`;
  if (!step) {
    return {
      progress,
      stepKind: "complete",
      selectedTaskId: "",
      view: createExecutionSurfaceView({
        mode: EXECUTION_SURFACE_MODES.SAFEGUARD,
        meta: "今日保底闭环",
        title: "今天没有归零，保底执行已完成",
        description: "正式结果和两句话收工均已保存。恢复状态后可返回正常计划继续推进。",
        primary: { label: "返回正常计划", action: "safeguard-exit", className: "success" },
      }),
    };
  }
  if (step.kind === "task") {
    const task = plan.tasks.find((item) => item.id === step.taskId);
    if (!task) return null;
    const config = getUnifiedTaskPrimary(task, getTaskStatus(task));
    return {
      progress,
      stepKind: "task",
      selectedTaskId: task.id,
      task,
      view: createExecutionSurfaceView({
        mode: EXECUTION_SURFACE_MODES.SAFEGUARD,
        taskId: task.id,
        meta: `保底闭环 ${stepIndex + 1}/${steps.length} · 只做这一项`,
        title: task.name,
        description: getSafeguardTaskDescription(step, task),
        primary: { ...config, taskId: task.id },
      }),
    };
  }
  return {
    progress,
    stepKind: "closeout",
    selectedTaskId: "",
    view: createExecutionSurfaceView({
      mode: EXECUTION_SURFACE_MODES.SAFEGUARD,
      meta: `保底闭环 ${stepIndex + 1}/${steps.length} · 最后一步`,
      title: "用两句话结束今天",
      description: "只填写今天最重要的产出或卡点，以及明天开始后的第一个动作。",
      primary: { label: "两句话收工", action: "safeguard-closeout", className: "primary" },
    }),
  };
}

function getDailyHandoffDismissKey() {
  return `studyDailyHandoffDismissed:${getDateKey()}`;
}

function dailyHandoffWasDismissed() {
  try { return sessionStorage.getItem(getDailyHandoffDismissKey()) === "1"; } catch { return false; }
}

function dismissDailyHandoff() {
  try { sessionStorage.setItem(getDailyHandoffDismissKey(), "1"); } catch {}
  document.body.classList.remove("daily-handoff-mode");
  renderTasks();
  setStatus("#executionStatus", "已显示正常计划；昨日断点和原记录均未修改。");
}

function hasTodayStartedExecution(plan) {
  const tasks = Array.isArray(plan && plan.tasks) ? plan.tasks : [];
  if (tasks.some((task) => isDashboardExecutionTask(task) && ["in-progress", "completed"].includes(getTaskStatus(task)))) return true;
  const sessions = readJson(focusSessionsKey, []);
  return Array.isArray(sessions) && sessions.some((session) => session
    && session.date === getDateKey()
    && Number(session.seconds) > 0);
}

function getDailyHandoffCandidateForToday(plan = getTodayPlan(), nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()) {
  const today = getDateKey();
  const yesterday = addLocalPlanDays(today, -1);
  const history = typeof readHistory === "function" ? readHistory() : [];
  const yesterdayRecord = history.find((record) => record && record.date === yesterday) || null;
  const yesterdayTasks = yesterdayRecord && Array.isArray(yesterdayRecord.tasks)
    ? yesterdayRecord.tasks
    : [];
  const professionalBreakpoints = typeof getProfessionalUnits === "function"
    ? ["722", "844"].flatMap((subject) => getProfessionalUnits(yesterday, subject).map((unit) => ({
      subject,
      nextStart: unit.nextStart,
      updatedAt: unit.updatedAt || unit.createdAt || "",
    })))
    : [];
  return buildScheduledDailyHandoffCandidate({
    todayTasks: plan.tasks,
    tomorrowPriority: yesterdayRecord && yesterdayRecord.tomorrowPriority,
    professionalBreakpoints,
    yesterdayTasks,
  }, nowMinutes);
}

function getDailyHandoffRenderCandidate(plan = getTodayPlan()) {
  const schedule = getNightExecutionSchedule(plan);
  const blocked = Boolean(readSafeguardModeState())
    || schedule.active
    || dailyHandoffWasDismissed()
    || hasTodayStartedExecution(plan);
  return blocked ? null : getDailyHandoffCandidateForToday(plan, schedule.nowMinutes);
}

function getDailyHandoffExecutionSurfaceModel(candidate, plan = getTodayPlan()) {
  if (!candidate) return null;
  const task = plan.tasks.find((item) => item.id === candidate.taskId);
  if (!task) return null;
  return {
    source: candidate.source,
    action: candidate.action,
    selectedTaskId: task.id,
    task,
    statusMessage: `今天第一步已准备：${task.name}；点击“直接开始5分钟”后才会计时。`,
    view: createExecutionSurfaceView({
      mode: EXECUTION_SURFACE_MODES.DAILY_HANDOFF,
      taskId: task.id,
      meta: `${candidate.source} · 今天第一步`,
      title: task.name,
      description: candidate.action,
      primary: { label: "直接开始5分钟", action: "daily-handoff-start", taskId: task.id, className: "primary" },
    }),
  };
}

function getPlanTaskBoundaryMinutes(task, edge, fallback) {
  const match = String(task && task.time || "").match(/(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const index = edge === "start" ? 1 : 3;
  return Number(match[index]) * 60 + Number(match[index + 1]);
}

function getNightExecutionSchedule(plan = getTodayPlan(), now = new Date()) {
  const sunday = plan && plan.template === "sunday" || now.getDay() === 0;
  const cutoffMinutes = sunday ? 20 * 60 + 30 : 21 * 60 + 40;
  const hardCutoffMinutes = sunday ? 21 * 60 + 30 : 22 * 60 + 30;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return { sunday, cutoffMinutes, hardCutoffMinutes, nowMinutes, active: nowMinutes >= cutoffMinutes };
}

function recordSavedAfterLocalMinutes(record, dateKey, minutes) {
  const timestamp = record && (record.updatedAt || record.createdAt || record.savedAt);
  if (!timestamp) return false;
  const savedAt = new Date(timestamp);
  return !Number.isNaN(savedAt.getTime())
    && getDateKey(savedAt) === dateKey
    && savedAt.getHours() * 60 + savedAt.getMinutes() >= minutes;
}

function getDailyExecutionGapStartAction(task) {
  return task && typeof getFiveMinuteStartAction === "function" ? getFiveMinuteStartAction(task) : "";
}

function getDailyExecutionGapStartDescription(task) {
  const context = task && typeof getTaskStartContext === "function" ? getTaskStartContext(task) : null;
  if (context) return formatTaskStartContext(context);
  const action = getDailyExecutionGapStartAction(task);
  return action ? `从这里开始：${action}` : "";
}

function getDailyExecutionGapTomorrowAction(task, fallback) {
  const exactAction = task && typeof getTaskExactStartAction === "function" ? getTaskExactStartAction(task) : "";
  return exactAction || fallback;
}

function buildDailyExecutionGapItems(plan = getTodayPlan()) {
  const tasks = Array.isArray(plan && plan.tasks) ? plan.tasks : [];
  const findTask = (predicate) => tasks.find((task) => task && predicate(task)) || null;
  const english = findTask((task) => task.category === "english" || task.sourceTaskKey === "english");
  const task722 = findTask((task) => typeof getProfessionalSubject === "function" && getProfessionalSubject(task) === "722");
  const task844 = findTask((task) => typeof getProfessionalSubject === "function" && getProfessionalSubject(task) === "844");
  const rollingReview = findTask((task) => task.category === "rollingReview");
  const politics = findTask((task) => task.category === "politics" || task.sourceTaskKey === "politics");
  const output = findTask((task) => task.category === "output" || task.sourceTaskKey === "outputOrMock");
  const englishStart = getPlanTaskBoundaryMinutes(english, "start", 15 * 60 + 45);
  const englishDeadline = getPlanTaskBoundaryMinutes(english, "end", 17 * 60 + 15);
  const task722Deadline = getPlanTaskBoundaryMinutes(task722, "end", 10 * 60 + 35);
  const task844Deadline = getPlanTaskBoundaryMinutes(task844, "end", 12 * 60 + 20);
  const politicsRecord = politics && typeof findP1Record === "function"
    ? findP1Record(politicsRecordsKey, getDateKey(), String(politics.taskId || politics.id))
    : null;
  const closedBook = typeof getDailyClosedBookGateStatus === "function" && typeof getP1IntegrationInput === "function"
    ? getDailyClosedBookGateStatus(getP1IntegrationInput(), getDateKey())
    : { hasProduct: false };
  const reviewState = rollingReview && typeof getReviewWorkloadForPlan === "function"
    ? getReviewWorkloadForPlan(readJson(reviewQueueKey, []), getDateKey(), plan)
    : null;
  return [
    english && {
      key: "english", taskId: english.id, priority: 10, deadlineMinutes: englishDeadline,
      status: getTaskStatus(english),
      isProtectedAnchor: true, startMinutes: englishStart, endMinutes: englishDeadline,
      transitionMinutes: 15, minimumBlockMinutes: 5,
      label: "英语阅读", complete: typeof validateP1EnglishTaskCompletion === "function" && validateP1EnglishTaskCompletion(english).valid,
      startAction: getDailyExecutionGapStartAction(english),
      description: "下午英语阅读时间块已经结束，但正式结果尚未保存；先补真实做题与依据定位。",
      anchorDescription: "保护下午英语阅读锚点：完成真题阅读、逐题证据定位并保存真实结果；上午欠账在本时间块结束后继续处理。",
      tomorrowAction: getDailyExecutionGapTomorrowAction(english, "先完成英语阅读真题并保存真实结果"),
    },
    task722 && {
      key: "722", taskId: task722.id, priority: 20, deadlineMinutes: task722Deadline,
      status: getTaskStatus(task722),
      minimumBlockMinutes: 5,
      label: "722", complete: typeof validateProfessionalTaskCompletion === "function" && validateProfessionalTaskCompletion(task722).valid,
      startAction: getDailyExecutionGapStartAction(task722),
      description: "上午专业课时间块已经结束，但722尚无通过现有验收的闭卷结果。",
      tomorrowAction: getDailyExecutionGapTomorrowAction(task722, "先闭卷补齐722，并保存实际推进、闭卷产物和下一起点"),
    },
    task844 && {
      key: "844", taskId: task844.id, priority: 30, deadlineMinutes: task844Deadline,
      status: getTaskStatus(task844),
      minimumBlockMinutes: 5,
      label: "844", complete: typeof validateProfessionalTaskCompletion === "function" && validateProfessionalTaskCompletion(task844).valid,
      startAction: getDailyExecutionGapStartAction(task844),
      description: "上午专业课时间块已经结束，但844尚无通过现有验收的闭卷结果。",
      tomorrowAction: getDailyExecutionGapTomorrowAction(task844, "先闭卷补齐844，并保存实际推进、闭卷产物和下一起点"),
    },
    rollingReview && reviewState && {
      key: "review", taskId: rollingReview.id, priority: 40,
      status: getTaskStatus(rollingReview),
      deadlineMinutes: getPlanTaskBoundaryMinutes(rollingReview, "end", 21 * 60),
      minimumBlockMinutes: 5,
      label: "今日复盘预算", complete: reviewState.remainingCount === 0,
      startAction: reviewState.active ? `先处理 ${reviewState.active.reviewLevel} · ${reviewState.active.subject} · ${reviewState.active.knowledgeUnit || reviewState.active.task}` : "",
      description: `今日${reviewState.budgetMinutes}分钟复盘预算还有${reviewState.remainingCount}条；历史积压${reviewState.backlogCount}条继续保留，不要求今晚清空。`,
      tomorrowAction: "先完成明日复盘预算内的第一条",
    },
    politics && {
      key: "politics", taskId: politics.id, priority: 50,
      status: getTaskStatus(politics),
      deadlineMinutes: getPlanTaskBoundaryMinutes(politics, "end", 15 * 60 + 30),
      minimumBlockMinutes: 5,
      label: "公共政治", complete: typeof hasP1PoliticsExecution === "function" && hasP1PoliticsExecution(politicsRecord),
      startAction: getDailyExecutionGapStartAction(politics),
      description: "政治时间块已经结束，但今天尚无包含章节、内容和有效分钟的正式结果。",
      tomorrowAction: getDailyExecutionGapTomorrowAction(politics, "先完成政治最低动作并保存章节、内容和有效分钟"),
    },
    output && {
      key: "closed-book", taskId: output.id, priority: plan.currentTaskId === output.id ? 5 : 60,
      status: getTaskStatus(output),
      deadlineMinutes: getPlanTaskBoundaryMinutes(output, "start", 19 * 60),
      forceEligible: plan.currentTaskId === output.id, minimumBlockMinutes: 5,
      label: "今日闭卷产物", complete: closedBook.hasProduct,
      startAction: getDailyExecutionGapStartAction(output),
      description: "今天还没有正式闭卷产物；闭卷写出题目与结构，保存后自动进入下一个缺口。",
      tomorrowAction: getDailyExecutionGapTomorrowAction(output, "先闭卷写出一道专业课题目的结构并保存结果"),
    },
  ].filter(Boolean);
}

function prefillNightCloseoutTomorrow(items) {
  const input = document.querySelector("#reviewTomorrowAction");
  if (!input || input.value.trim() || (typeof hasTodayReview === "function" && hasTodayReview())) return;
  const next = typeof selectDailyGuidanceItem === "function"
    ? selectDailyGuidanceItem(items, { actionField: "tomorrowAction" })
    : items
      .filter((item) => item && item.complete !== true && item.tomorrowAction)
      .sort((a, b) => Number(a.priority) - Number(b.priority))[0];
  const action = String(next && (next.action || next.tomorrowAction) || "").trim();
  if (!action) return;
  input.value = action;
  if (typeof saveDailyCloseoutDraft === "function") saveDailyCloseoutDraft();
}

function getNightCloseoutExecutionSurfaceView(schedule) {
  return createExecutionSurfaceView({
    mode: EXECUTION_SURFACE_MODES.NIGHT_CLOSEOUT,
    meta: schedule.nowMinutes >= schedule.hardCutoffMinutes
      ? "睡眠保护 · 已到硬收尾时间"
      : "晚间止损 · 今日不再追赶",
    title: "现在收工，不再开启新任务",
    description: "剩余缺口继续如实保留；补充今日产出或卡点，并确认明日第一动作。",
    primary: { label: "两句话收工", action: "night-closeout", className: "primary" },
  });
}

function isExecutionSurfaceFocusProtected() {
  return document.body.classList.contains("focus-mode-active")
    || !document.querySelector("#focusRecoveryCard")?.hidden
    || focusTimerState.running
    || currentFocusSeconds > 0
    || Boolean(focusRoundStartedAt);
}

function getDailyExecutionTakeover(plan = getTodayPlan(), options = {}) {
  if (typeof getCurrentDailyExecutionGap !== "function" || typeof getNightExecutionState !== "function") return;
  const selectedId = document.querySelector("#focusTask")?.value || plan.currentTaskId || "";
  const selectedTask = plan.tasks.find((task) => task.id === selectedId) || null;
  const selectedProtectedBlock = selectedTask && (selectedTask.exercise === true || !isDashboardExecutionTask(selectedTask));
  const now = new Date();
  const schedule = getNightExecutionSchedule(plan, now);
  const items = buildDailyExecutionGapItems(plan);
  const englishItem = items.find((item) => item.key === "english");
  const englishTask = englishItem && plan.tasks.find((task) => task.id === englishItem.taskId);
  const englishRecord = englishTask && typeof getP1EnglishState === "function"
    ? getP1EnglishState(englishTask).reading
    : null;
  const night = getNightExecutionState(items, {
    nowMinutes: schedule.nowMinutes,
    cutoffMinutes: schedule.cutoffMinutes,
    hardCutoffMinutes: schedule.hardCutoffMinutes,
    englishCompletedAfterCutoff: recordSavedAfterLocalMinutes(englishRecord, getDateKey(), schedule.cutoffMinutes),
    blocked: options.blocked === true,
  });
  if (night && night.mode === "closeout") {
    return { kind: "night-closeout", items, schedule, night };
  }
  const gapSelector = typeof getAnchorAwareDailyExecutionGap === "function"
    ? getAnchorAwareDailyExecutionGap
    : getCurrentDailyExecutionGap;
  const gap = night && night.current ? { ...night.current, remainingCount: night.remainingCount } : gapSelector(items, {
    nowMinutes: schedule.nowMinutes,
    blocked: options.blocked === true || selectedProtectedBlock,
    minimumBlockMinutes: 5,
  });
  if (!gap) return null;
  const task = plan.tasks.find((item) => item.id === gap.taskId);
  return task ? { kind: "execution-gap", gap, task, schedule, night } : null;
}

function getExecutionGapSurfaceView(takeover) {
  if (!takeover || takeover.kind !== "execution-gap") return null;
  const { gap, task, night } = takeover;
  const startDescription = getDailyExecutionGapStartDescription(task);
  const startAction = startDescription ? ` ${startDescription}` : "";
  const config = getUnifiedTaskPrimary(task, getTaskStatus(task));
  const anchorState = String(gap.anchorState || "");
  const anchorProtected = ["upcoming", "prepare", "active"].includes(anchorState);
  const anchorMeta = anchorState === "active"
    ? `锚点进行中 · ${task.time || "15:45—17:15"}`
    : anchorState === "prepare"
      ? `锚点准备 · ${task.time || "15:45—17:15"}`
      : `切换保护 · 距锚点不足${Math.max(1, Number(gap.availableMinutes) || 1)}分钟`;
  const anchorTitle = anchorState === "active" ? `现在做：${gap.label}` : `准备：${gap.label}`;
  const anchorDescription = anchorState === "upcoming"
    ? `距离英语阅读准备窗口已不足一个5分钟最小块，不再开启新的上午欠账。${startAction}`
    : `${gap.anchorDescription || gap.description}${startAction}`;
  return createExecutionSurfaceView({
    mode: EXECUTION_SURFACE_MODES.EXECUTION_GAP,
    taskId: task.id,
    contextId: config.contextId,
    meta: anchorProtected
      ? anchorMeta
      : night
      ? `晚间止损 1/${gap.remainingCount} · 最多完成两项`
      : `关键缺口 1/${gap.remainingCount} · 原时间块已结束`,
    title: anchorProtected ? anchorTitle : `先补：${gap.label}`,
    description: anchorProtected
      ? anchorDescription
      : night
      ? `${gap.description}${startAction} 先做5分钟；需要时只继续一个25分钟闭环。`
      : `${gap.description}${startAction}`,
    primary: {
      label: config.action === "unified-start"
        ? anchorProtected ? "开始英语5分钟" : "先补5分钟"
        : config.action === "unified-review" ? config.label : "补齐正式结果",
      action: "execution-gap-action",
      delegateAction: config.action,
      taskId: task.id,
      contextId: config.contextId,
      className: "primary",
    },
  });
}

function resetExecutionSurfaceLayers(plan) {
  document.body.classList.remove(
    "safeguard-mode", "safeguard-review-step", "safeguard-closeout-step",
    "daily-handoff-mode", "daily-execution-gap", "night-stop-mode",
  );
  const safeguardBanner = document.querySelector("#safeguardModeBanner");
  const handoffBanner = document.querySelector("#dailyHandoffBanner");
  if (safeguardBanner) safeguardBanner.hidden = true;
  if (handoffBanner) handoffBanner.hidden = true;
  const entryButton = document.querySelector("#enterSafeguardModeBtn");
  if (entryButton) {
    const unfinished = plan.tasks.some((task) => isDashboardExecutionTask(task) && getTaskStatus(task) !== "completed");
    entryButton.hidden = !unfinished || (typeof hasTodayReview === "function" && hasTodayReview());
  }
}

function applyExecutionTaskPreview(task, description = "") {
  if (!task) return;
  const select = document.querySelector("#focusTask");
  if (select && Array.from(select.options).some((option) => option.value === task.id)) select.value = task.id;
  const text = description || getTaskExecutionDescription(task);
  const currentTime = document.querySelector("#currentTaskTime");
  const focusOutput = document.querySelector("#focusOutput");
  const focusModeTask = document.querySelector("#focusModeTask");
  const focusModeOutput = document.querySelector("#focusModeOutput");
  if (currentTime) currentTime.value = task.time || "自定";
  if (focusOutput) focusOutput.value = text;
  if (focusModeTask) focusModeTask.textContent = `${task.time ? `${task.time} · ` : ""}${task.name}`;
  if (focusModeOutput) focusModeOutput.textContent = text;
  renderTaskExecutionBrief(document.querySelector("#focusModeExecutionBrief"), getTaskExecutionBrief(task));
}

function applyExecutionSurfaceDecorations(mode, context) {
  if (mode === EXECUTION_SURFACE_MODES.SAFEGUARD && context.safeguardModel) {
    const model = context.safeguardModel;
    document.body.classList.add("safeguard-mode");
    document.body.classList.toggle("safeguard-closeout-step", model.stepKind === "closeout");
    document.querySelector("#safeguardModeBanner").hidden = false;
    document.querySelector("#enterSafeguardModeBtn").hidden = true;
    document.querySelector("#safeguardModeProgress").textContent = model.progress;
    if (model.task) applyExecutionTaskPreview(model.task);
    return;
  }
  if (mode === EXECUTION_SURFACE_MODES.DAILY_HANDOFF && context.handoffModel) {
    const model = context.handoffModel;
    document.body.classList.add("daily-handoff-mode");
    document.querySelector("#dailyHandoffBanner").hidden = false;
    document.querySelector("#dailyHandoffSource").textContent = model.source;
    applyExecutionTaskPreview(model.task, model.action);
    setStatus("#executionStatus", model.statusMessage);
    return;
  }
  if (mode === EXECUTION_SURFACE_MODES.NIGHT_CLOSEOUT && context.takeover) {
    document.body.classList.add("night-stop-mode");
    prefillNightCloseoutTomorrow(context.takeover.items);
    return;
  }
  if (mode === EXECUTION_SURFACE_MODES.EXECUTION_GAP && context.takeover) {
    document.body.classList.add("daily-execution-gap");
    if (context.takeover.night) document.body.classList.add("night-stop-mode");
  }
}

function getExecutionSurfaceSnapshot() {
  const plan = getTodayPlan();
  const focusProtected = isExecutionSurfaceFocusProtected();
  const safeguardState = readSafeguardModeState();
  const handoffCandidate = getDailyHandoffRenderCandidate(plan);
  const takeover = getDailyExecutionTakeover(plan);
  const mode = deriveExecutionSurfaceMode({
    focusProtected,
    safeguardActive: Boolean(safeguardState),
    dailyHandoffActive: Boolean(handoffCandidate),
    nightCloseoutActive: takeover?.kind === "night-closeout",
    executionGapActive: takeover?.kind === "execution-gap",
  });
  const selectedId = document.querySelector("#focusTask")?.value || plan.currentTaskId || "";
  const selectedTask = plan.tasks.find((task) => task.id === selectedId) || null;
  const safeguardModel = getSafeguardExecutionSurfaceModel(safeguardState, plan);
  const handoffModel = getDailyHandoffExecutionSurfaceModel(handoffCandidate, plan);
  const defaultView = getDefaultExecutionSurfaceView(selectedTask, plan);
  const view = mode === EXECUTION_SURFACE_MODES.SAFEGUARD
    ? safeguardModel?.view || defaultView
    : mode === EXECUTION_SURFACE_MODES.DAILY_HANDOFF
      ? handoffModel?.view || defaultView
      : mode === EXECUTION_SURFACE_MODES.NIGHT_CLOSEOUT
        ? getNightCloseoutExecutionSurfaceView(takeover.schedule)
        : mode === EXECUTION_SURFACE_MODES.EXECUTION_GAP
          ? getExecutionGapSurfaceView(takeover) || defaultView
          : defaultView;
  return {
    plan,
    mode,
    view,
    command: createExecutionSurfaceCommand(view),
    safeguardModel,
    handoffModel,
    takeover,
  };
}

function renderExecutionSurface() {
  const snapshot = getExecutionSurfaceSnapshot();
  resetExecutionSurfaceLayers(snapshot.plan);
  applyExecutionSurfaceDecorations(snapshot.mode, snapshot);
  applyExecutionSurfaceView(snapshot.view);
  const displayedTask = snapshot.plan.tasks.find((task) => task && task.id === snapshot.view.taskId) || null;
  renderTaskExecutionBrief(document.querySelector("#cockpitExecutionBrief"), displayedTask ? getTaskExecutionBrief(displayedTask) : null);
  syncCockpitFreeFocusButton(snapshot);
  activeExecutionSurfaceSnapshot = snapshot;
  return snapshot;
}

function canStartCockpitFreeFocus(snapshot) {
  const command = snapshot && snapshot.command;
  const view = snapshot && snapshot.view;
  if (!command || command.valid !== true || !view || !view.taskId) return false;
  const task = snapshot.plan && snapshot.plan.tasks.find((item) => item && item.id === view.taskId);
  const hasPendingRound = focusTimerState.running || currentFocusSeconds > 0 || focusRoundStartedAt;
  const startCommand = command.kind === "handoff"
    || (command.kind === "task" && command.taskAction === "unified-start");
  return Boolean(task
    && startCommand
    && !hasPendingRound
    && getTaskStatus(task) === "not-started"
    && isCountedLearningTask(task));
}

function syncCockpitFreeFocusButton(snapshot) {
  const button = document.querySelector("#startFreeFocusBtn");
  if (!button) return;
  const available = canStartCockpitFreeFocus(snapshot);
  button.hidden = !available;
  button.disabled = !available;
}

function startDailyHandoff(model) {
  const task = model && model.task;
  if (!task || task.id !== model.selectedTaskId) return false;
  try { sessionStorage.setItem(getDailyHandoffDismissKey(), "1"); } catch {}
  document.body.classList.remove("daily-handoff-mode");
  setCurrentTask(task.id);
  startImmersiveFocus(task);
  if (pomodoroTimerId) syncFocusRoundGoal(model.action);
  return true;
}

function executeExecutionSurfaceCommand(snapshot) {
  const command = snapshot && snapshot.command;
  if (!command || command.valid !== true) return false;
  if (command.kind === "handoff") return startDailyHandoff(snapshot.handoffModel);
  if (command.kind === "closeout") {
    if (typeof openDailyCloseout === "function") openDailyCloseout();
    return true;
  }
  if (command.kind === "safeguard-exit") {
    exitSafeguardMode();
    return true;
  }
  if (command.kind === "task") {
    const task = snapshot.plan.tasks.find((item) => item.id === command.taskId);
    return performUnifiedTaskAction(task, command.taskAction, command.contextId);
  }
  return false;
}

function handleCockpitPrimaryAction() {
  const freshSnapshot = getExecutionSurfaceSnapshot();
  if (!executionSurfaceCommandsMatch(activeExecutionSurfaceSnapshot?.command, freshSnapshot.command)) {
    renderExecutionSurface();
    setStatus("#executionStatus", "任务状态已更新，请确认后再点击。", true);
    return false;
  }
  return executeExecutionSurfaceCommand(freshSnapshot);
}

function handleCockpitFreeFocusAction() {
  const freshSnapshot = getExecutionSurfaceSnapshot();
  if (!executionSurfaceCommandsMatch(activeExecutionSurfaceSnapshot?.command, freshSnapshot.command)
    || !canStartCockpitFreeFocus(freshSnapshot)) {
    renderExecutionSurface();
    setStatus("#executionStatus", "任务状态已更新，请确认后再点击。", true);
    return false;
  }
  const task = freshSnapshot.plan.tasks.find((item) => item.id === freshSnapshot.view.taskId);
  setCurrentTask(task.id);
  startImmersiveFocus(task, { directFree: true });
  const exactAction = freshSnapshot.handoffModel?.action || getTaskExactStartAction(task);
  if (pomodoroTimerId && exactAction) syncFocusRoundGoal(exactAction);
  return Boolean(pomodoroTimerId);
}

function syncFocusRoundGoal(value) {
  const safeValue = String(value || "").slice(0, 120);
  localStorage.setItem(focusRoundGoalKey, safeValue);
  document.querySelector("#focusRoundGoalInput").value = safeValue;
  document.querySelector("#focusModeGoalInput").value = safeValue;
}

function saveFocusThought() {
  const input = document.querySelector("#focusThoughtInput");
  const thought = input.value.trim().slice(0, 120);
  if (!thought) return;
  const thoughts = readJson(focusThoughtsKey, {});
  const safeThoughts = thoughts && typeof thoughts === "object" && !Array.isArray(thoughts) ? thoughts : {};
  const dateKey = getDateKey();
  const todayThoughts = Array.isArray(safeThoughts[dateKey]) ? safeThoughts[dateKey] : [];
  todayThoughts.push({ text: thought, savedAt: new Date().toISOString() });
  safeThoughts[dateKey] = todayThoughts;
  writeJson(focusThoughtsKey, safeThoughts);
  input.value = "";
  setStatus("#focusThoughtStatus", "已暂存，继续当前任务。");
}

function changeCurrentTaskFromSelect() {
  const id = document.querySelector("#focusTask").value;
  settleBeforeFocusTaskSwitch(id);
  const plan = getTodayPlan();
  if (!id || id === "__unassigned__") {
    if (clearPlanCurrentTask(plan)) saveTodayPlan(plan);
    syncFocusModeContent();
    updatePomodoroDisplay();
    setStatus("#executionStatus", id === "__unassigned__" ? "已切换为未归属专注；仅在无法对应正式任务时使用。" : "");
    if (typeof renderP0Priorities === "function") renderP0Priorities();
    return;
  }
  const selection = selectPlanCurrentTask(plan, id);
  if (selection.changed) saveTodayPlan(plan);
  syncFocusModeContent();
  updatePomodoroDisplay();
  setStatus("#executionStatus", `当前任务已切换：${selection.task.name}；点击主按钮后才会计时。`);
  if (typeof renderP0Priorities === "function") renderP0Priorities();
}

function completeCurrentTask() {
  const id = document.querySelector("#focusTask").value;
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item.id === id);
  if (!task) return setStatus("#executionStatus", "请先选择当前执行任务。", true);
  if (typeof validateP1TrackedTaskCompletion === "function") {
    const validation = validateP1TrackedTaskCompletion(task);
    if (!validation.valid) {
      const result = finalizeFocusSegment({ reason: "p1-result-required" });
      resetFocusRound();
      updatePomodoroDisplay();
      setStatus("#executionStatus", validation.message, true);
      if (result.session) showFocusWrapup(result.session);
      else {
        exitFocusMode();
        if (typeof openP1ResultDialog === "function") {
          const resultType = typeof getP1TaskKind === "function" && getP1TaskKind(task) === "politics" ? "politics" : "reading";
          openP1ResultDialog(resultType, String(task.taskId || task.id));
        }
        setStatus("#p1ResultStatus", validation.message, true);
      }
      return;
    }
  }
  if (typeof validateRollingReviewCompletion === "function") {
    const validation = validateRollingReviewCompletion(task, readJson(reviewQueueKey, []), getDateKey());
    if (!validation.valid) {
      setStatus("#dueReviewsStatus", validation.message, true);
      setStatus("#executionStatus", validation.message, true);
      exitFocusMode();
      document.querySelector("#dueReviewsTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
  if (typeof validateProfessionalTaskCompletion === "function") {
    const validation = validateProfessionalTaskCompletion(task);
    if (!validation.valid) {
      const result = finalizeFocusSegment({ reason: "professional-result-required" });
      resetFocusRound();
      updatePomodoroDisplay();
      setStatus("#executionStatus", validation.message, true);
      if (result.session) showFocusWrapup(result.session);
      else {
        exitFocusMode();
        const planPanel = document.querySelector("#todayPlanPanel");
        if (planPanel) planPanel.open = true;
        if (typeof openProfessionalTaskRecord === "function") openProfessionalTaskRecord(task);
        setStatus("#professionalResultStatus", validation.message, true);
      }
      return;
    }
  }
  if (typeof validateP1OutputTaskCompletion === "function") {
    const validation = validateP1OutputTaskCompletion(task);
    if (!validation.valid) {
      const result = finalizeFocusSegment({ reason: "output-result-required" });
      resetFocusRound();
      updatePomodoroDisplay();
      setStatus("#executionStatus", validation.message, true);
      if (result.session) showFocusWrapup(result.session);
      else {
        exitFocusMode();
        if (typeof handleP1OutputAction === "function") handleP1OutputAction("p1-output", task);
        setStatus("#outputQuickStatus", validation.message, true);
      }
      return;
    }
  }
  const result = finalizeFocusSegment({ reason: "task-completed" });
  const session = result.session;
  resetFocusRound();
  updatePomodoroDisplay();
  setTaskStatus(task, "completed");
  const releasedCurrentTask = clearTerminalCurrentPlanTask(plan, id);
  if (releasedCurrentTask) document.querySelector("#focusTask").value = "";
  saveTodayPlan(plan);
  renderTasks();
  setStatus("#executionStatus", `已完成：${task.name}`);
  if (session) showFocusWrapup(session);
}

function enterFocusMode() {
  syncFocusModeContent();
  syncFocusRoundGoal(localStorage.getItem(focusRoundGoalKey) || "");
  document.querySelector("#focusModeOverlay").hidden = false;
  document.querySelector("#focusMainCard").hidden = false;
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = true;
  document.body.classList.add("focus-mode-active");
}

function startImmersiveFocus(task, options = {}) {
  pendingFocusResultSession = null;
  pendingFocusReview = null;
  focusReviewNextReviewId = "";
  const hasPendingRound = focusTimerState.running || currentFocusSeconds > 0 || focusRoundStartedAt;
  if (options.directFree === true && !hasPendingRound) {
    setFocusTimingMode(FREE_FOCUS_MODE);
  } else if (task && getTaskStatus(task) === "not-started" && isCountedLearningTask(task) && !hasPendingRound) {
    prepareFiveMinuteStartup(task);
  }
  startPomodoro();
  if (pomodoroTimerId) enterFocusMode();
}

function getCurrentReviewExecutionState() {
  if (typeof getReviewExecutionState !== "function") return null;
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item && item.category === "rollingReview") || null;
  return getReviewExecutionState(readJson(reviewQueueKey, []), getDateKey(), { task });
}

function getUnresolvedFocusReviewSessions(reviewId) {
  const id = String(reviewId || "");
  const sessions = readJson(focusSessionsKey, []);
  if (!id || !Array.isArray(sessions)) return [];
  return sessions.filter((session) => session
    && session.date === getDateKey()
    && session.contextKind === "due-review"
    && String(session.contextId || "") === id
    && session.wrapupSaved !== true
    && Number(session.seconds) > 0);
}

function getFocusReviewSessionSummary(reviewId, fallbackSession = null) {
  const sessions = getUnresolvedFocusReviewSessions(reviewId);
  const fallbackId = String(fallbackSession && fallbackSession.id || "");
  if (fallbackSession && !sessions.some((item) => String(item && item.id || "") === fallbackId)) sessions.push(fallbackSession);
  const latest = sessions.at(-1) || fallbackSession;
  return {
    session: latest ? { ...latest, seconds: sessions.reduce((sum, item) => sum + Math.max(0, Number(item.seconds) || 0), 0) } : null,
    sessionIds: [...new Set(sessions.map((item) => String(item && item.id || "")).filter(Boolean).concat(fallbackId ? [fallbackId] : []))],
  };
}

function restorePendingFocusReviewFromTimerState(state = focusTimerState) {
  const contextId = state && state.contextKind === "due-review" ? String(state.contextId || "") : "";
  const task = contextId ? getFocusRecoveryTask() : null;
  if (!contextId || !task || task.category !== "rollingReview") return "";
  const summary = getFocusReviewSessionSummary(contextId);
  pendingFocusReview = {
    reviewId: contextId,
    sessionId: String(summary.session && summary.session.id || ""),
    sessionIds: summary.sessionIds,
  };
  return contextId;
}

function isPendingFocusReviewCurrent() {
  const state = getCurrentReviewExecutionState();
  return Boolean(pendingFocusReview && state && state.active && state.active.reviewId === pendingFocusReview.reviewId);
}

function settleStaleRestoredFocusReview() {
  const reviewId = String(pendingFocusReview && pendingFocusReview.reviewId || "");
  const summary = getFocusReviewSessionSummary(reviewId, lastFinalizedFocusSession);
  updateFocusSessionsWrapup(summary.sessionIds, "复盘结果未保存", "队列已更新，请重新开始当前第一条复盘");
  pendingFocusReview = null;
  focusReviewNextReviewId = "";
  resetFocusRound();
  if (typeof renderDueReviews === "function") renderDueReviews();
  renderTasks();
  setStatus("#executionStatus", "刷新前的复盘身份已失效；专注时间已保留，复盘结果未写入，请重新开始当前第一条。", true);
}

function restorePendingFocusReviewResultCard() {
  if (focusRoundStartedAt || currentFocusSeconds > 0 || pendingFocusReview) return false;
  const sessions = readJson(focusSessionsKey, []);
  const latest = Array.isArray(sessions) ? sessions.slice().reverse().find((session) => session
    && session.date === getDateKey()
    && session.contextKind === "due-review"
    && String(session.contextId || "")
    && session.wrapupSaved !== true
    && Number(session.seconds) > 0) : null;
  if (!latest) return false;
  const summary = getFocusReviewSessionSummary(latest.contextId, latest);
  pendingFocusReview = {
    reviewId: String(latest.contextId),
    sessionId: String(summary.session && summary.session.id || ""),
    sessionIds: summary.sessionIds,
  };
  return showFocusReviewResultCard(summary.session);
}

function startCurrentReviewFromExecution(expectedReviewId) {
  const state = getCurrentReviewExecutionState();
  const reviewId = String(expectedReviewId || "");
  if (!state || !state.active || !reviewId || state.active.reviewId !== reviewId) {
    renderTasks();
    if (typeof renderDueReviews === "function") renderDueReviews();
    setStatus("#executionStatus", "复盘队列已经更新，请确认当前第一条后再开始。", true);
    return false;
  }
  return startReviewFiveMinuteRound(state.active);
}

function startReviewFiveMinuteRound(review) {
  const hasPendingRound = focusTimerState.running || currentFocusSeconds > 0 || focusRoundStartedAt;
  if (hasPendingRound) {
    setStatus("#dueReviewsStatus", "已有未结束的专注轮，请先继续或结束当前专注，避免重复计时。", true);
    return false;
  }
  const state = getCurrentReviewExecutionState();
  const reviewId = String(review && review.reviewId || "");
  if (!state || !state.active || !reviewId || state.active.reviewId !== reviewId) {
    renderTasks();
    if (typeof renderDueReviews === "function") renderDueReviews();
    setStatus("#dueReviewsStatus", "复盘队列已经更新，请确认当前第一条后再开始。", true);
    return false;
  }
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item && item.category === "rollingReview");
  if (!task) {
    setStatus("#dueReviewsStatus", "今日计划中没有滚动复盘时间块，当前数据无法启动计时。", true);
    return false;
  }
  pendingFocusReview = {
    reviewId,
    sessionId: "",
    sessionIds: [],
  };
  focusReviewNextReviewId = "";
  setCurrentTask(task.id);
  prepareFiveMinuteStartup(task);
  syncFocusRoundGoal(`遮挡复述：${state.active.knowledgeUnit || state.active.task || "当前复盘"}`);
  startPomodoro();
  if (pomodoroTimerId) enterFocusMode();
  else pendingFocusReview = null;
  return Boolean(pomodoroTimerId);
}

function setFocusReviewCardVisibility() {
  document.querySelector("#focusMainCard").hidden = true;
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = false;
  document.querySelector("#focusModeOverlay").hidden = false;
  document.body.classList.add("focus-mode-active");
}

function updateFocusReviewEvidenceUi() {
  const textarea = document.querySelector("#focusReviewEvidence");
  const validation = validateReviewEvidence(parseReviewEvidenceQuickRecord(textarea.value));
  document.querySelectorAll("[data-focus-review-result]").forEach((button) => {
    button.disabled = !validation.valid;
  });
  const hint = document.querySelector("#focusReviewEvidenceHint");
  hint.textContent = validation.valid
    ? "闭卷证据已填写；请核对上次缺口后，按本次真实表现判断结果。"
    : validation.message;
  document.querySelector("#focusReviewSourceContext").hidden = !validation.valid;
  return validation;
}

function showFocusReviewResultCard(session) {
  if (!pendingFocusReview || !session) return false;
  const state = getCurrentReviewExecutionState();
  const review = state && state.active;
  const evidenceStep = document.querySelector("#focusReviewEvidenceStep");
  const handoffStep = document.querySelector("#focusReviewHandoffStep");
  const nextButton = document.querySelector("#focusReviewNextBtn");
  const summary = getFocusReviewSessionSummary(pendingFocusReview.reviewId, session);
  pendingFocusReview.sessionId = String(summary.session && summary.session.id || session.id || "");
  pendingFocusReview.sessionIds = summary.sessionIds;
  document.querySelector("#focusReviewResultDuration").textContent = formatFocusClock(summary.session && summary.session.seconds || session.seconds || 0);
  nextButton.hidden = true;
  focusReviewNextReviewId = "";
  if (!review || review.reviewId !== pendingFocusReview.reviewId) {
    evidenceStep.hidden = true;
    handoffStep.hidden = false;
    document.querySelector("#focusReviewResultMeta").textContent = "复盘队列已更新";
    document.querySelector("#focusReviewSavedMessage").textContent = "本次未保存复盘结果";
    document.querySelector("#focusReviewNextMessage").textContent = "请返回执行台，确认当前第一条复盘后再继续。";
    setStatus("#focusReviewResultStatus", "旧复盘身份已失效，系统没有写入结果。", true);
    setFocusReviewCardVisibility();
    return true;
  }
  const sourceContext = typeof getReviewSourceContext === "function" ? getReviewSourceContext(review) : null;
  document.querySelector("#focusReviewResultMeta").textContent = `${review.reviewLevel} · ${review.subject} · ${review.knowledgeUnit || review.task}`;
  document.querySelector("#focusReviewEvidence").value = buildReviewEvidenceQuickTemplate(review.completionEvidence);
  document.querySelector("#focusReviewSourceContext").textContent = sourceContext
    ? `上次核对：主要遗漏=${sourceContext.mainGaps.join("、") || "无"}｜下一起点=${sourceContext.nextStart || "未记录"}`
    : "当前记录没有可核对的专业课缺口；请仅依据本次闭卷表现判断。";
  evidenceStep.hidden = false;
  handoffStep.hidden = true;
  setStatus("#focusReviewResultStatus", "");
  updateFocusReviewEvidenceUi();
  setFocusReviewCardVisibility();
  document.querySelector("#focusReviewEvidence").focus();
  return true;
}

function saveFocusReviewResult(resultCode) {
  if (!pendingFocusReview) return;
  const validation = updateFocusReviewEvidenceUi();
  if (!validation.valid) {
    setStatus("#focusReviewResultStatus", validation.message, true);
    document.querySelector("#focusReviewEvidence").focus();
    return;
  }
  const outcome = saveDueReviewResult(pendingFocusReview.reviewId, resultCode, validation.evidence);
  if (!outcome.changed) {
    setStatus("#focusReviewResultStatus", outcome.message, true);
    if (outcome.stale) document.querySelectorAll("[data-focus-review-result]").forEach((button) => { button.disabled = true; });
    return;
  }
  const labels = { passed: "通过", partial: "部分通过", failed: "未通过" };
  if (pendingFocusReview.sessionIds.length || pendingFocusReview.sessionId) {
    updateFocusSessionsWrapup(
      pendingFocusReview.sessionIds.length ? pendingFocusReview.sessionIds : [pendingFocusReview.sessionId],
      `复盘结果：${labels[resultCode] || resultCode}`,
      validation.evidence.nextAction,
    );
    renderTodayFocusOutputs();
    renderHistory();
  }
  focusReviewNextReviewId = String(outcome.nextReview && outcome.nextReview.reviewId || "");
  pendingFocusReview = null;
  document.querySelector("#focusReviewEvidenceStep").hidden = true;
  document.querySelector("#focusReviewHandoffStep").hidden = false;
  document.querySelector("#focusReviewSavedMessage").textContent = `已保存：${labels[resultCode] || resultCode}`;
  document.querySelector("#focusReviewNextMessage").textContent = outcome.nextReview
    ? `下一条：${outcome.nextReview.reviewLevel} · ${outcome.nextReview.subject} · ${outcome.nextReview.knowledgeUnit || outcome.nextReview.task}`
    : "今日复盘预算已完成；返回执行台继续正式任务。";
  document.querySelector("#focusReviewNextBtn").hidden = !focusReviewNextReviewId;
  setStatus("#focusReviewResultStatus", outcome.message);
}

function startNextFocusReview() {
  const reviewId = focusReviewNextReviewId;
  focusReviewNextReviewId = "";
  document.querySelector("#focusReviewResultCard").hidden = true;
  if (!startCurrentReviewFromExecution(reviewId)) {
    exitFocusMode();
  }
}

function returnFromFocusReview() {
  if (pendingFocusReview) {
    const summary = getFocusReviewSessionSummary(pendingFocusReview.reviewId);
    updateFocusSessionsWrapup(
      pendingFocusReview.sessionIds && pendingFocusReview.sessionIds.length ? pendingFocusReview.sessionIds : summary.sessionIds,
      "复盘结果未保存",
      "队列已更新，请重新开始当前第一条复盘",
    );
    renderTodayFocusOutputs();
    renderHistory();
  }
  pendingFocusReview = null;
  focusReviewNextReviewId = "";
  exitFocusMode();
  renderTasks();
  document.querySelector("#execution").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deferFocusReviewEvidence() {
  if (pendingFocusReview && (pendingFocusReview.sessionIds.length || pendingFocusReview.sessionId)) {
    updateFocusSessionsWrapup(
      pendingFocusReview.sessionIds.length ? pendingFocusReview.sessionIds : [pendingFocusReview.sessionId],
      "完成复盘专注",
      "闭卷证据待补",
    );
    renderTodayFocusOutputs();
    renderHistory();
  }
  pendingFocusReview = null;
  setStatus("#dueReviewsStatus", "本轮专注时间已记录；复盘结果仍为未完成，请稍后补齐三行闭卷证据。", true);
  returnFromFocusReview();
}

function exitFocusMode() {
  if (focusTimerState.running) pausePomodoro("focus-mode-exit");
  document.querySelector("#focusModeOverlay").hidden = true;
  document.body.classList.remove("focus-mode-active");
  document.querySelector("#focusMainCard").hidden = false;
  document.querySelector("#focusRecoveryCard").hidden = true;
  document.querySelector("#focusStartupChoiceCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = true;
  document.querySelector("#focusReviewResultCard").hidden = true;
  document.querySelector("#focusResultHandoffCard").hidden = true;
}

function bindTaskControls() {
  document.querySelector("#taskList").addEventListener("click", handleTaskListClick);
  document.querySelector("#taskList").addEventListener("change", handleTaskListChange);
  document.querySelector("#freeFocusModeBtn").addEventListener("click", () => setFocusTimingMode(FREE_FOCUS_MODE));
  document.querySelector("#pomodoroFocusModeBtn").addEventListener("click", () => setFocusTimingMode(POMODORO_FOCUS_MODE));
  document.querySelector("#focusModeFreeBtn").addEventListener("click", () => setFocusTimingMode(FREE_FOCUS_MODE));
  document.querySelector("#focusModePomodoroBtn").addEventListener("click", () => setFocusTimingMode(POMODORO_FOCUS_MODE));
  document.querySelector("#startPomodoroBtn").addEventListener("click", startPomodoro);
  document.querySelector("#pausePomodoroBtn").addEventListener("click", () => pausePomodoro("manual-pause"));
  document.querySelector("#resetPomodoroBtn").addEventListener("click", finishOrResetFocus);
  document.querySelector("#completeCurrentTaskBtn").addEventListener("click", completeCurrentTask);
  document.querySelector("#enterFocusModeBtn").addEventListener("click", handleCockpitPrimaryAction);
  document.querySelector("#startFreeFocusBtn").addEventListener("click", handleCockpitFreeFocusAction);
  document.querySelector("#enterSafeguardModeBtn").addEventListener("click", enterSafeguardMode);
  document.querySelector("#toggleSafeguardModeBtn").addEventListener("click", exitSafeguardMode);
  document.querySelector("#dismissDailyHandoffBtn").addEventListener("click", dismissDailyHandoff);
  document.querySelector("#startResultHandoffNextBtn").addEventListener("click", startResultHandoffNext);
  document.querySelector("#startResultHandoffFreeBtn").addEventListener("click", startResultHandoffFreeFocus);
  document.querySelector("#dismissResultHandoffBtn").addEventListener("click", dismissResultHandoff);
  document.querySelector("#focusResultHandoffStartBtn").addEventListener("click", startResultHandoffNext);
  document.querySelector("#focusResultHandoffFreeBtn").addEventListener("click", startResultHandoffFreeFocus);
  document.querySelector("#focusResultHandoffLaterBtn").addEventListener("click", dismissResultHandoff);
  document.querySelector("#exitFocusModeBtn").addEventListener("click", exitFocusMode);
  document.querySelector("#focusModeStartBtn").addEventListener("click", startPomodoro);
  document.querySelector("#focusModePauseBtn").addEventListener("click", () => pausePomodoro("manual-pause"));
  document.querySelector("#focusModeActionBtn").addEventListener("click", finishOrResetFocus);
  document.querySelector("#focusModeCompleteBtn").addEventListener("click", completeCurrentTask);
  document.querySelector("#focusStartupContinueBtn").addEventListener("click", continueAfterFiveMinuteStartup);
  document.querySelector("#focusStartupPauseBtn").addEventListener("click", recordFiveMinuteStartupBlocker);
  document.querySelector("#focusReviewEvidence").addEventListener("input", updateFocusReviewEvidenceUi);
  document.querySelector("#focusReviewResultCard").addEventListener("click", (event) => {
    const button = event.target.closest("[data-focus-review-result]");
    if (button) saveFocusReviewResult(button.dataset.focusReviewResult);
  });
  document.querySelector("#focusReviewLaterBtn").addEventListener("click", deferFocusReviewEvidence);
  document.querySelector("#focusReviewNextBtn").addEventListener("click", startNextFocusReview);
  document.querySelector("#focusReviewReturnBtn").addEventListener("click", returnFromFocusReview);
  document.querySelector("#focusRecoveryContinueBtn").addEventListener("click", () => continueFocusRecovery());
  document.querySelector("#focusRecoveryShrinkBtn").addEventListener("click", () => continueFocusRecovery({ shrinkGoal: true }));
  document.querySelector("#focusRecoveryPauseBtn").addEventListener("click", recordFocusRecoveryPause);
  document.querySelector("#saveWrapupExitBtn").addEventListener("click", () => finishFocusWrapup(false));
  document.querySelector("#saveWrapupContinueBtn").addEventListener("click", () => finishFocusWrapup(true));
  document.querySelector("#skipWrapupBtn").addEventListener("click", skipFocusWrapup);
  document.querySelector("#focusOverrunDialog").addEventListener("click", (event) => {
    const button = event.target.closest("[data-overrun-action]");
    if (button) handleFocusOverrunAction(button.dataset.overrunAction);
  });
  document.querySelector("#focusTask").addEventListener("change", changeCurrentTaskFromSelect);
  ["#focusRoundGoalInput", "#focusModeGoalInput"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", (event) => syncFocusRoundGoal(event.target.value));
  });
  syncFocusRoundGoal(localStorage.getItem(focusRoundGoalKey) || "");
  document.querySelector("#focusThoughtInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    saveFocusThought();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || document.querySelector("#focusModeOverlay").hidden) return;
    if (!document.querySelector("#focusRecoveryCard").hidden) {
      setStatus("#focusRecoveryStatus", "请继续当前任务，或记录急事后暂停。", true);
      return;
    }
    if (!document.querySelector("#focusStartupChoiceCard").hidden) {
      setStatus("#focusStartupChoiceStatus", "请选择继续25分钟，或记录卡点后暂停。", true);
      document.querySelector("#focusStartupBlockerInput").focus();
      return;
    }
    if (!document.querySelector("#focusReviewResultCard").hidden) {
      setStatus("#focusReviewResultStatus", "请保存真实复盘结果，或选择“稍后填写”保留未完成。", true);
      return;
    }
    if (!document.querySelector("#focusResultHandoffCard").hidden) return dismissResultHandoff();
    if (!document.querySelector("#focusWrapupCard").hidden) return skipFocusWrapup();
    if (pomodoroTimerId) pausePomodoro();
    exitFocusMode();
  });
  ["pointerdown", "keydown", "input"].forEach((eventName) => document.addEventListener(eventName, noteFocusActivity, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") continueFocusWhilePageHidden();
    else resumeFocusAfterHiddenPage();
  });
  window.addEventListener("pagehide", () => pauseFocusForPageExit("pagehide"));
}
