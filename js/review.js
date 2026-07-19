// Daily learning records and backward-compatible history rendering.
function readHistory() {
  const history = readJson(historyKey, []);
  return Array.isArray(history) ? history : [];
}

function writeHistory(history) {
  writeJson(historyKey, history);
}

function loadReviewFields() {
  const todayRecord = readHistory().find((record) => record && record.date === getDateKey()) || {};
  const mappings = {
    "completed-today": "completedToday", "unfinished-today": "unfinishedToday", "delayed-tasks": "delayedTasks",
    "learned-today": "learnedToday", "tomorrow-priority": "tomorrowPriority",
  };
  document.querySelectorAll("[data-review-field]").forEach((field) => { field.value = String(todayRecord[mappings[field.dataset.reviewField]] || ""); });
  renderTodayFocusOutputs();
}

function getFocusSessionsForDate(dateKey) {
  const sessions = readJson(focusSessionsKey, []);
  return Array.isArray(sessions) ? sessions.filter((session) => session && session.date === dateKey) : [];
}

function renderTodayFocusOutputs() {
  const container = document.querySelector("#focusOutputsReference");
  const list = document.querySelector("#focusOutputsList");
  const outputs = getFocusSessionsForDate(getDateKey())
    .filter((session) => session.wrapupSaved && session.completed)
    .map((session) => session.completed);
  list.replaceChildren();
  outputs.forEach((output) => {
    const item = document.createElement("li");
    item.textContent = output;
    list.appendChild(item);
  });
  container.hidden = outputs.length === 0;
}

function bindReviewAutoSaving() {
  // P0 final: closeout drafts become formal only when the daily record is saved.
}

function getReviewField(key) {
  const field = document.querySelector(`[data-review-field="${key}"]`);
  return field ? field.value.trim() : "";
}

function snapshotTask(task) {
  return {
    id: task.id,
    time: task.time || "",
    name: task.name || "",
    description: task.description || task.minimum || "",
    minimum: task.minimum || "",
    status: getTaskStatus(task),
    completed: getTaskStatus(task) === "completed",
    counted: task.counted,
    exercise: task.exercise,
    category: task.category || "",
    focusSeconds: getTaskFocusSeconds(getDateKey(), task.id),
  };
}

function saveTodayReview() {
  const plan = getTodayPlan();
  const { done, total, rate } = getCompletionStats(plan);
  const tasks = plan.tasks.map(snapshotTask);
  const learningTasks = tasks.filter(isCountedLearningTask);
  const exerciseTask = tasks.find((task) => task.exercise || task.category === "exercise");
  const studyTime = getStudyTimeSnapshot();
  const reviewSnapshot = typeof getReviewSnapshot === "function" ? getReviewSnapshot() : { completed: [], dueNextDay: [] };
  const record = {
    recordSchemaVersion: 2,
    date: getDateKey(),
    displayDate: getDisplayDate(),
    completionRate: rate,
    completionDone: done,
    completionTotal: total,
    completedToday: getReviewField("completed-today"),
    unfinishedToday: getReviewField("unfinished-today"),
    delayedTasks: getReviewField("delayed-tasks"),
    learnedToday: getReviewField("learned-today"),
    tomorrowPriority: getReviewField("tomorrow-priority"),
    plan: tasks.filter(isCountedLearningTask).map((task) => task.name),
    tasks,
    scheduleTemplate: plan.template || "legacy",
    exerciseCompleted: taskWasCompleted(exerciseTask),
    completedLearningTasks: learningTasks.filter(taskWasCompleted).map((task) => task.name),
    unfinishedLearningTasks: learningTasks.filter((task) => !taskWasCompleted(task)).map((task) => task.name),
    focusSeconds: getFocusSecondsForDate(),
    taskFocusSeconds: Object.fromEntries(tasks.map((task) => [task.id, task.focusSeconds])),
    totalFocusSeconds: studyTime.totalFocusSeconds,
    manualStudySeconds: studyTime.manualStudySeconds,
    totalStudySeconds: studyTime.totalStudySeconds,
    dailyStudyTargetSeconds: studyTime.dailyStudyTargetSeconds,
    manualRecordsSaved: true,
    manualTimeRecords: getManualRecordsSnapshot(getDateKey()),
    professionalProgress: typeof getProfessionalProgressSnapshot === "function" ? getProfessionalProgressSnapshot() : {},
    reviewsCompleted: reviewSnapshot.completed,
    reviewsDueNextDay: reviewSnapshot.dueNextDay,
  };
  if (!record.completedToday && !record.learnedToday && !record.tomorrowPriority) {
    setStatus("#reviewSaveStatus", "至少填写完成内容、学习收获或明日优先级中的一项。", true);
    return;
  }
  const history = [record, ...readHistory().filter((item) => item && item.date !== record.date)]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  writeHistory(history);
  renderHistory();
  renderRecentSevenDays();
  renderExamStatsOverview();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  setStatus("#reviewSaveStatus", "今日学习记录已更新；同一天不会重复生成记录。");
}

function addRecordField(container, label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  const displayValue = Array.isArray(value) ? value.join("、") : value;
  row.append(strong, document.createTextNode(displayValue || "未填写"));
  container.appendChild(row);
}

function addScheduleHistory(container, tasks) {
  if (!tasks.length || !tasks.some((task) => task.time || task.status)) return;
  const heading = document.createElement("h4");
  heading.textContent = "当天时间表执行情况";
  const list = document.createElement("div");
  list.className = "history-schedule";
  tasks.forEach((task) => {
    const row = document.createElement("p");
    const status = TASK_STATUS_LABELS[getTaskStatus(task)] || (taskWasCompleted(task) ? "已完成" : "未开始");
    const focusText = Math.max(0, Number(task.focusSeconds) || 0) ? ` · 专注 ${formatFocusDuration(task.focusSeconds)}` : "";
    row.textContent = `${task.time ? `${task.time} · ` : ""}${task.name || "未命名任务"} · ${status}${focusText}${task.description ? ` · ${task.description}` : ""}`;
    list.appendChild(row);
  });
  container.append(heading, list);
}

function formatFocusSessionRange(session) {
  const formatTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const endedAt = new Date(session.endedAt).getTime();
  const startedAt = session.startedAt || (Number.isNaN(endedAt) ? "" : new Date(endedAt - Math.max(0, Number(session.seconds) || 0) * 1000).toISOString());
  return `${formatTime(startedAt)}—${formatTime(session.endedAt)}`;
}

function addFocusSessionHistory(container, dateKey, tasks = []) {
  const sessions = getFocusSessionsForDate(dateKey).filter((session) => ["free-focus-ended", "pomodoro-completed", "task-completed"].includes(session.reason));
  if (!sessions.length) return;
  const heading = document.createElement("h4");
  heading.textContent = "当天专注记录";
  const list = document.createElement("div");
  list.className = "history-focus-sessions";
  sessions.forEach((session) => {
    const item = document.createElement("div");
    item.className = "history-focus-session";
    const title = document.createElement("strong");
    const savedTask = tasks.find((task) => task.id === session.taskId);
    title.textContent = `${formatFocusSessionRange(session)} · ${session.taskName || (savedTask && savedTask.name) || session.taskId || "未选择任务"}`;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${formatFocusDuration(session.seconds)} · ${session.mode === POMODORO_FOCUS_MODE ? "25分钟番茄" : "自由专注"}`;
    item.append(title, meta);
    if (session.completed) {
      const completed = document.createElement("p");
      completed.textContent = `完成：${session.completed}`;
      item.appendChild(completed);
    }
    if (session.nextStep) {
      const next = document.createElement("p");
      next.textContent = `下一步：${session.nextStep}`;
      item.appendChild(next);
    }
    list.appendChild(item);
  });
  container.append(heading, list);
}

function renderHistory() {
  const container = document.querySelector("#historyList");
  container.replaceChildren();
  const history = readHistory().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "暂无历史学习记录。";
    container.appendChild(empty);
    return;
  }
  history.forEach((record) => {
    const details = document.createElement("details");
    details.className = "history-record";
    const summary = document.createElement("summary");
    const studyTime = getStudyTimeSnapshot(record.date, record);
    const totalFocusSeconds = studyTime.totalFocusSeconds;
    summary.textContent = `${record.displayDate || record.date} · 学习完成率 ${studyTime.progressRate}% · 总学习 ${formatFocusDuration(studyTime.totalStudySeconds)} · 专注 ${formatFocusDuration(totalFocusSeconds)}`;
    const body = document.createElement("div");
    body.className = "history-body";
    const savedTaskFocus = record.taskFocusSeconds && typeof record.taskFocusSeconds === "object" ? record.taskFocusSeconds : {};
    const liveTaskFocus = readTaskFocusTotals()[record.date] || {};
    const tasks = (Array.isArray(record.tasks) ? record.tasks : []).map((task) => ({
      ...task,
      focusSeconds: Math.max(0, Number(task.focusSeconds) || 0, Number(savedTaskFocus[task.id]) || 0, Number(liveTaskFocus[task.id]) || 0),
    }));
    const learningTasks = tasks.filter(isCountedLearningTask);
    const completedNames = Array.isArray(record.completedLearningTasks) ? record.completedLearningTasks : learningTasks.filter(taskWasCompleted).map((task) => task.name);
    const unfinishedNames = Array.isArray(record.unfinishedLearningTasks) ? record.unfinishedLearningTasks : learningTasks.filter((task) => !taskWasCompleted(task)).map((task) => task.name);
    const taskFocusSummary = tasks.filter((task) => task.focusSeconds > 0).map((task) => `${task.name}：${formatFocusDuration(task.focusSeconds)}`);
    addRecordField(body, "当日总学习时长", formatFocusDuration(studyTime.totalStudySeconds));
    addRecordField(body, "当日累计专注", formatFocusDuration(totalFocusSeconds));
    addRecordField(body, "手动补录学习时间", formatFocusDuration(studyTime.manualStudySeconds));
    addRecordField(body, "学习目标", formatTargetDuration(studyTime.dailyStudyTargetSeconds));
    addRecordField(body, "各任务专注时间", taskFocusSummary.length ? taskFocusSummary : "未记录");
    addManualTimeHistory(body, record.date, record.manualTimeRecords, record.manualRecordsSaved);
    addFocusSessionHistory(body, record.date, tasks);
    addScheduleHistory(body, tasks);
    if (typeof addProfessionalHistory === "function") addProfessionalHistory(body, record);
    addRecordField(body, "已完成学习任务", completedNames.length ? completedNames : tasks.filter(taskWasCompleted).map((task) => task.name));
    addRecordField(body, "未完成学习任务", unfinishedNames.length ? unfinishedNames : tasks.filter((task) => !taskWasCompleted(task)).map((task) => task.name));
    addRecordField(body, "锻炼", record.exerciseCompleted === true ? "已完成" : record.exerciseCompleted === false ? "未完成" : "旧记录未单独统计");
    addRecordField(body, "今天完成了什么", record.completedToday);
    addRecordField(body, "今天没完成什么", record.unfinishedToday || record.delayedTasks);
    addRecordField(body, "为什么没完成", record.delayedTasks);
    addRecordField(body, "今天学到了什么", record.learnedToday);
    addRecordField(body, "明天第一优先级", record.tomorrowPriority);
    details.append(summary, body);
    container.appendChild(details);
  });
}
