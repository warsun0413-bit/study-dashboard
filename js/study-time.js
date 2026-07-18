// Manual study time, daily target, and derived total-study-time display.
function readManualTimeRecords() {
  const records = readJson(manualTimeRecordsKey, []);
  return Array.isArray(records) ? records.filter((record) => record && typeof record === "object") : [];
}

function readDailyStudyTargets() {
  const targets = readJson(dailyStudyTargetsKey, {});
  return targets && typeof targets === "object" && !Array.isArray(targets) ? targets : {};
}

function getDefaultStudyTargetSeconds(dateKey = getDateKey()) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.getDay() === 0 ? 5 * 3600 + 30 * 60 : 9 * 3600;
}

function getDailyStudyTargetSeconds(dateKey = getDateKey(), savedRecord = null) {
  const targets = readDailyStudyTargets();
  if (Object.prototype.hasOwnProperty.call(targets, dateKey)) {
    return Math.max(60, Math.floor(Number(targets[dateKey]) || 0));
  }
  const savedTarget = Math.floor(Number(savedRecord && savedRecord.dailyStudyTargetSeconds) || 0);
  return savedTarget > 0 ? savedTarget : getDefaultStudyTargetSeconds(dateKey);
}

function isExcludedManualStudyTask(record) {
  if (!record || record.taskId === "other-study" || !record.taskId) return false;
  const plans = readDailyPlans();
  const plan = plans[record.date];
  const task = plan && Array.isArray(plan.tasks) ? plan.tasks.find((item) => item.id === record.taskId) : null;
  if (task) return task.exercise === true || task.category === "exercise" || !isCountedLearningTask(task);
  return /居家训练|训练|锻炼|运动|午饭|午休|洗澡|吃饭|休息|睡觉|起床|早餐|放松/.test(String(record.taskTitle || ""));
}

function getManualStudySecondsForDate(dateKey = getDateKey()) {
  return readManualTimeRecords()
    .filter((record) => record.date === dateKey && !isExcludedManualStudyTask(record))
    .reduce((total, record) => total + Math.max(0, Math.floor(Number(record.durationSeconds) || 0)), 0);
}

function getStudyTimeSnapshot(dateKey = getDateKey(), savedRecord = null) {
  const liveFocusSeconds = getFocusSecondsForDate(dateKey);
  const savedFocusSeconds = Math.max(0, Number(savedRecord && (savedRecord.totalFocusSeconds ?? savedRecord.focusSeconds)) || 0);
  const totalFocusSeconds = Math.max(liveFocusSeconds, savedFocusSeconds);
  const hasCanonicalManualRecords = Boolean(savedRecord && savedRecord.manualRecordsSaved);
  const liveManualSeconds = getManualStudySecondsForDate(dateKey);
  const manualStudySeconds = hasCanonicalManualRecords || liveManualSeconds > 0
    ? liveManualSeconds
    : Math.max(0, Number(savedRecord && savedRecord.manualStudySeconds) || 0);
  const totalStudySeconds = totalFocusSeconds + manualStudySeconds;
  const dailyStudyTargetSeconds = getDailyStudyTargetSeconds(dateKey, savedRecord);
  const progressRate = dailyStudyTargetSeconds > 0 ? Math.round(totalStudySeconds / dailyStudyTargetSeconds * 100) : 0;
  return { totalFocusSeconds, manualStudySeconds, totalStudySeconds, dailyStudyTargetSeconds, progressRate };
}

function formatTargetDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor(safeSeconds % 3600 / 60);
  return `${hours}小时${String(minutes).padStart(2, "0")}分钟`;
}

function renderManualStudyTaskOptions() {
  const select = document.querySelector("#manualStudyTask");
  if (!select) return;
  const previous = select.value;
  select.replaceChildren(new Option("其他考研学习", "other-study"));
  getTodayPlan().tasks.forEach((task) => select.add(new Option(task.name, task.id)));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function renderManualStudyRecords() {
  const container = document.querySelector("#manualStudyRecords");
  if (!container) return;
  const records = readManualTimeRecords().filter((record) => record.date === getDateKey());
  container.replaceChildren();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "今天暂无补录。";
    container.appendChild(empty);
    return;
  }
  records.forEach((record) => {
    const row = document.createElement("div");
    row.className = "manual-time-record";
    const text = document.createElement("span");
    text.textContent = `${formatFocusDuration(record.durationSeconds)}｜${record.taskTitle || "其他考研学习"}${record.note ? `｜${record.note}` : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button danger-link";
    button.dataset.deleteManualTime = record.id;
    button.textContent = "删除";
    row.append(text, button);
    container.appendChild(row);
  });
}

function renderStudyTimeSummary() {
  const totalElement = document.querySelector("#todayStudyTotal");
  if (!totalElement) return;
  const snapshot = getStudyTimeSnapshot();
  document.querySelector("#todayManualStudyTotal").textContent = formatFocusClock(snapshot.manualStudySeconds);
  totalElement.textContent = formatFocusClock(snapshot.totalStudySeconds);
  document.querySelector("#todayStudyTarget").textContent = formatTargetDuration(snapshot.dailyStudyTargetSeconds);
  document.querySelector("#todayStudyProgress").textContent = `${snapshot.progressRate}%`;
  const difference = snapshot.totalStudySeconds - snapshot.dailyStudyTargetSeconds;
  document.querySelector("#todayStudyRemaining").textContent = difference >= 0
    ? `今日已超过目标：${formatFocusDuration(difference)}`
    : `还差：${formatFocusDuration(Math.abs(difference))}`;
  const targetHours = document.querySelector("#dailyTargetHours");
  const targetMinutes = document.querySelector("#dailyTargetMinutes");
  if (![targetHours, targetMinutes].includes(document.activeElement)) {
    targetHours.value = Math.floor(snapshot.dailyStudyTargetSeconds / 3600);
    targetMinutes.value = Math.floor(snapshot.dailyStudyTargetSeconds % 3600 / 60);
  }
  if (typeof renderExamStatsOverview === "function") renderExamStatsOverview();
}

function refreshStudyTimeViews() {
  renderStudyTimeSummary();
  renderManualStudyRecords();
  renderRecentSevenDays();
  renderHistory();
}

function saveManualStudyTime() {
  const hours = Math.max(0, Math.floor(Number(document.querySelector("#manualStudyHours").value) || 0));
  const minutes = Math.max(0, Math.floor(Number(document.querySelector("#manualStudyMinutes").value) || 0));
  if (hours > 24 || minutes > 59 || hours * 3600 + minutes * 60 <= 0) {
    return setStatus("#manualStudyStatus", "请输入有效的小时和分钟。", true);
  }
  const select = document.querySelector("#manualStudyTask");
  const taskId = select.value || "other-study";
  const taskTitle = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : "其他考研学习";
  const record = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: getDateKey(),
    createdAt: new Date().toISOString(),
    durationSeconds: hours * 3600 + minutes * 60,
    taskId,
    taskTitle,
    note: document.querySelector("#manualStudyNote").value.trim().slice(0, 120),
  };
  if (isExcludedManualStudyTask(record)) {
    return setStatus("#manualStudyStatus", "该任务不属于考研学习，不能计入总学习时长。", true);
  }
  const records = readManualTimeRecords();
  records.push(record);
  writeJson(manualTimeRecordsKey, records);
  document.querySelector("#manualStudyHours").value = "0";
  document.querySelector("#manualStudyMinutes").value = "0";
  document.querySelector("#manualStudyNote").value = "";
  setStatus("#manualStudyStatus", `已补录 ${formatFocusDuration(record.durationSeconds)}。`);
  refreshStudyTimeViews();
}

function deleteManualStudyTime(recordId) {
  const records = readManualTimeRecords();
  const nextRecords = records.filter((record) => record.id !== recordId);
  if (nextRecords.length === records.length) return;
  writeJson(manualTimeRecordsKey, nextRecords);
  setStatus("#manualStudyStatus", "补录已删除，总学习时长已重新计算。");
  refreshStudyTimeViews();
}

function saveDailyStudyTarget() {
  const hours = Math.max(0, Math.floor(Number(document.querySelector("#dailyTargetHours").value) || 0));
  const minutes = Math.max(0, Math.floor(Number(document.querySelector("#dailyTargetMinutes").value) || 0));
  const seconds = hours * 3600 + minutes * 60;
  if (hours > 24 || minutes > 59 || seconds <= 0) return setStatus("#dailyTargetStatus", "请输入有效的今日目标。", true);
  const targets = readDailyStudyTargets();
  targets[getDateKey()] = seconds;
  writeJson(dailyStudyTargetsKey, targets);
  setStatus("#dailyTargetStatus", "今日目标已保存，只影响今天。 ");
  refreshStudyTimeViews();
}

function initStudyTime() {
  renderManualStudyTaskOptions();
  renderManualStudyRecords();
  renderStudyTimeSummary();
  document.querySelector("#saveManualStudyTimeBtn").addEventListener("click", saveManualStudyTime);
  document.querySelector("#saveDailyTargetBtn").addEventListener("click", saveDailyStudyTarget);
  document.querySelector("#manualStudyRecords").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-manual-time]");
    if (button) deleteManualStudyTime(button.dataset.deleteManualTime);
  });
}

function getManualRecordsSnapshot(dateKey) {
  return readManualTimeRecords().filter((record) => record.date === dateKey && !isExcludedManualStudyTask(record));
}

function addManualTimeHistory(container, dateKey, savedRecords = [], hasCanonicalManualRecords = false) {
  const liveRecords = getManualRecordsSnapshot(dateKey);
  const records = hasCanonicalManualRecords
    ? liveRecords
    : (liveRecords.length ? liveRecords : (Array.isArray(savedRecords) ? savedRecords : []));
  if (!records.length) return;
  const heading = document.createElement("h4");
  heading.textContent = "手动补录明细";
  const list = document.createElement("div");
  list.className = "history-manual-records";
  records.forEach((record) => {
    const row = document.createElement("p");
    row.textContent = `${formatFocusDuration(record.durationSeconds)}｜${record.taskTitle || "其他考研学习"}${record.note ? `｜${record.note}` : ""}`;
    list.appendChild(row);
  });
  container.append(heading, list);
}
