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
  { id: "plan-english", sourceKey: "english", time: "08:00—10:00", name: "英语", counted: true, category: "english" },
  { id: "plan-722", sourceKey: "722", time: "10:15—12:35", name: "722", counted: true, category: "maYuan" },
  { id: "plan-844", sourceKey: "844", time: "14:00—16:20", name: "844", counted: true, category: "maHistory" },
  { id: "plan-original-review", sourceKey: "originalTextOrReview", time: "16:20—17:00", name: "原著 / D复盘", counted: true, category: "rollingReview" },
  { id: "plan-training", sourceKey: "training", time: "17:10—18:10", name: "训练", exercise: true, category: "exercise" },
  { id: "plan-politics", sourceKey: "politics", time: "19:10—20:10", name: "政治", counted: true, category: "politics" },
  { id: "plan-output", sourceKey: "outputOrMock", time: "20:20—21:20", name: "输出", counted: true, category: "output" },
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
  };
}

function createWeekdayTasks(date = new Date()) {
  return [
    makeTask("wake", "07:20", "起床、洗漱、早餐", "开始一天，不计入学习完成率"),
    makeTask("english-words", "08:00—08:35", "英语单词", "昨日阅读错词、熟词僻义、重要搭配、App滚动复习", { counted: true, category: "englishWords" }),
    makeTask("english-reading", "08:35—10:00", "英语一阅读", "完成1篇阅读，并做主旨、定位依据、错项分析和一句错因总结", { counted: true, category: "englishReading" }),
    makeTask("ma-yuan-722", "10:15—12:35", "722 马克思主义基本原理", "昨日复述 + 教材二轮/正式背诵 + A类知识点纸上重构", { counted: true, category: "maYuan" }),
    makeTask("lunch", "12:35—14:00", "午饭、午休", "休息时间，不计入学习完成率"),
    makeTask("ma-history-844", "14:00—16:20", "844 马克思主义发展史", "昨日节点复述 + 教材顺序推进 + 时间/著作/理论演进线重构", { counted: true, category: "maHistory" }),
    makeTask("rolling-review", "16:20—17:00", "滚动复盘", "处理 D1 / D3 / D7 / D14 / D30 到期任务；优先级：D30 > D14 > D7 > D3 > D1", { counted: true, category: "rollingReview" }),
    makeTask("exercise", "17:10—18:10", "锻炼", "约1小时居家训练或低强度恢复", { exercise: true, category: "exercise" }),
    makeTask("dinner", "18:10—19:10", "洗澡、晚饭、休息", "恢复时间，不计入学习完成率"),
    makeTask("politics", "19:10—20:10", "公共政治", "强化课或教材 + 对应选择题 + 错因标记", { counted: true, category: "politics" }),
    makeTask("professional-output", "20:20—21:20", "专业课输出", WEEKLY_OUTPUT_SUGGESTIONS[date.getDay()], { counted: true, category: "output" }),
    makeTask("d0-preview", "21:20—21:40", "D0复述 + 次日预加载", "复述今日722和844框架，查看明日教材位置和一级二级标题", { counted: true, category: "d0" }),
    makeTask("free-time", "21:40以后", "自由、放松", "自由安排，不计入学习完成率"),
    makeTask("sleep", "23:20—23:40", "准备睡觉", "结束一天，不计入学习完成率"),
  ];
}

function createSundayTasks() {
  return [
    makeTask("sunday-words", "08:00—08:35", "英语单词", "英语正常推进：昨日阅读错词、熟词僻义、重要搭配、App滚动复习", { counted: true, category: "englishWords" }),
    makeTask("sunday-reading", "08:35—10:00", "英语一阅读", "完成1篇阅读，并做主旨、定位依据、错项分析和一句错因总结", { counted: true, category: "englishReading" }),
    makeTask("sunday-722", "10:15—11:35", "722 周复盘", "回顾本周722教材主线、背诵卡点和纸上重构结果", { counted: true, category: "maYuan" }),
    makeTask("sunday-844", "14:00—15:20", "844 周复盘", "回顾本周844时间、著作、理论演进线和原著精读内容", { counted: true, category: "maHistory" }),
    makeTask("sunday-review", "15:30—16:10", "D任务清账", "清理本周到期与遗漏的 D1 / D3 / D7 / D14 / D30 任务", { counted: true, category: "rollingReview" }),
    makeTask("sunday-weakness", "16:10—16:50", "薄弱点整理", "整理本周反复出错、复述不稳和需要下周优先处理的内容", { counted: true, category: "weakness" }),
    makeTask("sunday-exercise", "17:10—18:00", "低强度运动", "低强度恢复，不追求训练量", { exercise: true, category: "exercise" }),
    makeTask("sunday-summary", "19:30—20:30", "晚间周总结", "周复盘 + 本周错漏题重构", { counted: true, category: "output" }),
  ];
}

// Kept for legacy cleanup compatibility. Existing saved labels and records are not changed.
const defaultTasks = createWeekdayTasks().map((task) => [task.id, task.name]);
const FREE_FOCUS_MODE = "free";
const POMODORO_FOCUS_MODE = "pomodoro";
const POMODORO_SECONDS = 25 * 60;
const storedPomodoroState = readJson(focusTimerStateKey, {});
let focusTimerState = normalizeFocusTimerState(storedPomodoroState, { date: getDateKey() });
let focusTimingMode = focusTimerState.mode;
let pomodoroRemainingSeconds = focusTimerState.remainingSeconds;
let currentFocusSeconds = focusTimerState.currentFocusSeconds;
let pomodoroTimerId = null;
let focusRoundStartedAt = focusTimerState.roundStartedAt;
let lastFocusActivityAt = Date.now();
let lastFinalizedFocusSession = null;
let pendingFocusWrapup = null;

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
  return { template: isSunday ? "sunday" : "weekday", tasks: isSunday ? createSundayTasks() : createWeekdayTasks(date), currentTaskId: "" };
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

function getCompletionStats(plan = getTodayPlan()) {
  const tasks = plan.tasks.filter(isCountedLearningTask);
  const done = tasks.filter((task) => getTaskStatus(task) === "completed").length;
  return { done, total: tasks.length, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

function updateCompletionRate() {
  const { done, total, rate } = getCompletionStats();
  document.querySelector("#completionRate").textContent = `${rate}%`;
  document.querySelector("#completionText").textContent = `已完成 ${done} / ${total} 项学习任务`;
  document.querySelector("#completionBar").style.width = `${rate}%`;
  const plan = getTodayPlan();
  document.querySelector("#scheduleHint").textContent = plan.template === "nankai-plan-v2"
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

function renderTasks() {
  const list = document.querySelector("#taskList");
  const plan = getTodayPlan();
  list.replaceChildren();
  plan.tasks.forEach((task) => {
    const status = getTaskStatus(task);
    const row = document.createElement("article");
    row.className = `task-row status-${status}${task.exercise ? " exercise-task" : ""}${!isCountedLearningTask(task) && !task.exercise ? " life-task" : ""}`;
    const time = document.createElement("strong");
    time.className = "task-time";
    time.textContent = task.time || "自定";
    const content = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = task.name;
    const description = document.createElement("span");
    description.textContent = task.description || task.minimum || "暂无任务说明";
    content.append(name, description);
    const controls = document.createElement("div");
    controls.className = "task-actions";
    const select = document.createElement("select");
    select.className = "task-status-select";
    select.dataset.taskStatus = task.id;
    Object.entries(TASK_STATUS_LABELS).forEach(([value, label]) => select.add(new Option(label, value)));
    select.value = status;
    controls.append(select, createTaskButton("设为当前任务", "focus", task.id, "secondary"), createTaskButton("编辑说明", "edit-description", task.id));
    row.append(time, content, controls);
    list.appendChild(row);
  });
  updateCompletionRate();
  renderFocusTaskOptions();
  if (typeof renderManualStudyTaskOptions === "function") renderManualStudyTaskOptions();
  if (typeof renderProfessionalResults === "function") renderProfessionalResults();
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
  plan.currentTaskId = id;
  if (getTaskStatus(task) === "not-started") setTaskStatus(task, "in-progress");
  saveTodayPlan(plan);
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
  if (select.value === "completed" && typeof validateProfessionalTaskCompletion === "function") {
    const validation = validateProfessionalTaskCompletion(task);
    if (!validation.valid) {
      select.value = getTaskStatus(task);
      document.querySelector("#professionalResultsPanel").open = true;
      setStatus("#professionalResultStatus", validation.message, true);
      document.querySelector("#professionalResultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
  setTaskStatus(task, select.value);
  saveTodayPlan(plan);
  renderTasks();
  renderRecentSevenDays();
}

function handleTaskListClick(event) {
  const action = event.target.closest("[data-task-action]");
  if (!action) return;
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item.id === action.dataset.taskId);
  if (!task) return;
  if (action.dataset.taskAction === "focus") return setCurrentTask(task.id);
  if (action.dataset.taskAction === "edit-description") {
    const description = window.prompt("今日任务说明", task.description || task.minimum || "");
    if (description === null) return;
    task.description = description.trim().slice(0, 240);
    task.manualEdited = true;
    saveTodayPlan(plan);
    renderTasks();
  }
}

function renderFocusTaskOptions() {
  const select = document.querySelector("#focusTask");
  const plan = getTodayPlan();
  const previous = focusTimerState.running
    ? focusTimerState.activeTaskId || "__unassigned__"
    : plan.currentTaskId || select.value;
  select.replaceChildren(new Option("请选择今日任务", ""), new Option("未归属专注", "__unassigned__"));
  plan.tasks.forEach((task) => select.add(new Option(`${getTaskStatus(task) === "completed" ? "✓ " : ""}${task.time ? `${task.time} ` : ""}${task.name}`, task.id)));
  select.value = previous === "__unassigned__" || plan.tasks.some((task) => task.id === previous) ? previous : "";
  syncFocusModeContent();
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
    goal: localStorage.getItem(focusRoundGoalKey) || "",
    startedAt: new Date(segment.startedAt).toISOString(),
    endedAt: new Date(segment.endedAt).toISOString(),
    reason: segment.reason,
  };
  safeSessions.push(session);
  writeJson(focusSessionsKey, safeSessions);
  return session;
}

function updateFocusSessionWrapup(sessionId, completed, nextStep) {
  const sessions = readJson(focusSessionsKey, []);
  if (!Array.isArray(sessions)) return;
  writeJson(focusSessionsKey, sessions.map((session) => session && session.id === sessionId
    ? { ...session, completed, nextStep, wrapupSaved: true }
    : session));
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
  syncFocusRuntimeFromState();
  if (focusTimerState.running) {
    finalizeFocusSegment({ endedAt: Date.now(), reason: "page-reload" });
    setStatus("#executionStatus", "检测到页面刷新，已结算到最后心跳并暂停；请手动继续。 ");
  }
  savePomodoroState();
  updatePomodoroDisplay();
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
  resetFocusRound();
  setStatus("#executionStatus", "25分钟番茄已完成，等待再次开始。");
  showFocusWrapup(session);
  return true;
}

function pausePomodoro(reason = "manual-pause") {
  const result = finalizeFocusSegment({ reason });
  const completedPomodoro = finishPomodoroIfNeeded(result.session);
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
  const task = selectedTaskId === "__unassigned__"
    ? null
    : getTodayPlan().tasks.find((item) => item.id === selectedTaskId);
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
    resetOverrunPrompt,
  });
  syncFocusRuntimeFromState();
  lastFocusActivityAt = Date.now();
  pomodoroTimerId = window.setInterval(handleFocusHeartbeat, 1000);
  savePomodoroState();
  updatePomodoroDisplay();
}

function finishOrResetFocus() {
  const finishedSeconds = currentFocusSeconds + getLiveFocusSegmentSeconds(focusTimerState);
  const result = finalizeFocusSegment({ reason: focusTimingMode === FREE_FOCUS_MODE ? "free-focus-ended" : "pomodoro-reset" });
  if (finishPomodoroIfNeeded(result.session)) return;
  const session = result.session || lastFinalizedFocusSession;
  resetFocusRound();
  updatePomodoroDisplay();
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
    const result = finalizeFocusSegment({ endedAt, reason: "pomodoro-completed" });
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
  finalizeFocusSegment({ reason });
}

function showFocusWrapup(session) {
  if (!session) return;
  pendingFocusWrapup = session;
  document.querySelector("#focusWrapupTask").textContent = `${session.taskTime ? `${session.taskTime} · ` : ""}${session.taskName || "未选择任务"}`;
  document.querySelector("#focusWrapupDuration").textContent = formatFocusClock(session.seconds);
  document.querySelector("#focusWrapupTodayTotal").textContent = formatFocusClock(getFocusSecondsForDate());
  document.querySelector("#focusWrapupCompleted").value = "";
  document.querySelector("#focusWrapupNext").value = "";
  document.querySelector("#focusMainCard").hidden = true;
  document.querySelector("#focusWrapupCard").hidden = false;
  document.querySelector("#focusModeOverlay").hidden = false;
  document.body.classList.add("focus-mode-active");
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
  exitFocusMode();
}

function syncFocusModeContent() {
  const select = document.querySelector("#focusTask");
  const task = getTodayPlan().tasks.find((item) => item.id === (select && select.value));
  document.querySelector("#currentTaskTime").value = task ? task.time || "自定" : "";
  document.querySelector("#focusOutput").value = task ? task.description || task.minimum || "" : "";
  document.querySelector("#focusModeTask").textContent = task
    ? `${task.time ? `${task.time} · ` : ""}${task.name}`
    : select && select.value === "__unassigned__" ? "未归属专注" : "尚未选择任务";
  document.querySelector("#focusModeOutput").textContent = task ? task.description || task.minimum || "" : "";
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
  if (!id || id === "__unassigned__") {
    syncFocusModeContent();
    updatePomodoroDisplay();
    return;
  }
  const plan = getTodayPlan();
  plan.currentTaskId = id;
  saveTodayPlan(plan);
  syncFocusModeContent();
  updatePomodoroDisplay();
}

function completeCurrentTask() {
  const id = document.querySelector("#focusTask").value;
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item.id === id);
  if (!task) return setStatus("#executionStatus", "请先选择当前执行任务。", true);
  if (typeof validateProfessionalTaskCompletion === "function") {
    const validation = validateProfessionalTaskCompletion(task);
    if (!validation.valid) {
      document.querySelector("#professionalResultsPanel").open = true;
      setStatus("#professionalResultStatus", validation.message, true);
      setStatus("#executionStatus", validation.message, true);
      return;
    }
  }
  const result = finalizeFocusSegment({ reason: "task-completed" });
  const session = result.session;
  resetFocusRound();
  updatePomodoroDisplay();
  setTaskStatus(task, "completed");
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
  document.querySelector("#focusWrapupCard").hidden = true;
  document.body.classList.add("focus-mode-active");
}

function exitFocusMode() {
  if (focusTimerState.running) pausePomodoro("focus-mode-exit");
  document.querySelector("#focusModeOverlay").hidden = true;
  document.body.classList.remove("focus-mode-active");
  document.querySelector("#focusMainCard").hidden = false;
  document.querySelector("#focusWrapupCard").hidden = true;
}

function bindTaskControls() {
  document.querySelector("#taskList").addEventListener("click", handleTaskListClick);
  document.querySelector("#taskList").addEventListener("change", handleTaskListChange);
  document.querySelector("#freeFocusModeBtn").addEventListener("click", () => setFocusTimingMode(FREE_FOCUS_MODE));
  document.querySelector("#pomodoroFocusModeBtn").addEventListener("click", () => setFocusTimingMode(POMODORO_FOCUS_MODE));
  document.querySelector("#focusModeFreeBtn").addEventListener("click", () => setFocusTimingMode(FREE_FOCUS_MODE));
  document.querySelector("#focusModePomodoroBtn").addEventListener("click", () => setFocusTimingMode(POMODORO_FOCUS_MODE));
  document.querySelector("#startPomodoroBtn").addEventListener("click", startPomodoro);
  document.querySelector("#pausePomodoroBtn").addEventListener("click", pausePomodoro);
  document.querySelector("#resetPomodoroBtn").addEventListener("click", finishOrResetFocus);
  document.querySelector("#completeCurrentTaskBtn").addEventListener("click", completeCurrentTask);
  document.querySelector("#enterFocusModeBtn").addEventListener("click", enterFocusMode);
  document.querySelector("#exitFocusModeBtn").addEventListener("click", exitFocusMode);
  document.querySelector("#focusModeStartBtn").addEventListener("click", startPomodoro);
  document.querySelector("#focusModePauseBtn").addEventListener("click", pausePomodoro);
  document.querySelector("#focusModeActionBtn").addEventListener("click", finishOrResetFocus);
  document.querySelector("#focusModeCompleteBtn").addEventListener("click", completeCurrentTask);
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
    if (!document.querySelector("#focusWrapupCard").hidden) return skipFocusWrapup();
    if (pomodoroTimerId) pausePomodoro();
    exitFocusMode();
  });
  ["pointerdown", "keydown", "input"].forEach((eventName) => document.addEventListener(eventName, noteFocusActivity, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pauseFocusForPageExit("page-hidden");
  });
  window.addEventListener("pagehide", () => pauseFocusForPageExit("pagehide"));
}
