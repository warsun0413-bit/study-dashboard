// Manual study time, daily target, and derived total-study-time display.
function readManualTimeRecords() {
  const records = readJson(manualTimeRecordsKey, []);
  return Array.isArray(records) ? records.filter((record) => record && typeof record === "object") : [];
}

function parseManualStudyTime(value) {
  const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function buildManualStudyInterval(dateKey, startTime, endTime) {
  const start = String(startTime || "").trim();
  const end = String(endTime || "").trim();
  if (!start && !end) return { specified: false, valid: true };
  if (!start || !end) return { specified: true, valid: false, error: "开始时间和结束时间需要同时填写。" };
  const startMinutes = parseManualStudyTime(start);
  const endMinutes = parseManualStudyTime(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { specified: true, valid: false, error: "请输入同一天内有效的开始和结束时间。" };
  }
  const startedAtDate = new Date(`${dateKey}T${start}:00`);
  const endedAtDate = new Date(`${dateKey}T${end}:00`);
  if (Number.isNaN(startedAtDate.getTime()) || Number.isNaN(endedAtDate.getTime())) {
    return { specified: true, valid: false, error: "学习时间段无法识别。" };
  }
  return {
    specified: true,
    valid: true,
    startTime: start,
    endTime: end,
    startedAt: startedAtDate.toISOString(),
    endedAt: endedAtDate.toISOString(),
    durationSeconds: (endMinutes - startMinutes) * 60,
  };
}

function studyIntervalsOverlap(left, right) {
  const leftStart = new Date(left && left.startedAt).getTime();
  const leftEnd = new Date(left && left.endedAt).getTime();
  const rightStart = new Date(right && right.startedAt).getTime();
  const rightEnd = new Date(right && right.endedAt).getTime();
  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) return false;
  return leftStart < rightEnd && leftEnd > rightStart;
}

function findManualStudyIntervalOverlap(interval, manualRecords = [], focusSessions = []) {
  const manual = (Array.isArray(manualRecords) ? manualRecords : []).find((record) => studyIntervalsOverlap(interval, record));
  if (manual) return { type: "manual", record: manual };
  const focus = (Array.isArray(focusSessions) ? focusSessions : []).find((session) => Number(session && session.seconds) > 0 && studyIntervalsOverlap(interval, session));
  return focus ? { type: "focus", record: focus } : null;
}

function formatManualStudyRange(record) {
  if (record && record.startTime && record.endTime) return `${record.startTime}—${record.endTime}`;
  const format = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const start = format(record && record.startedAt);
  const end = format(record && record.endedAt);
  return start && end ? `${start}—${end}` : "未记录具体时段";
}

function readDailyStudyTargets() {
  const targets = readJson(dailyStudyTargetsKey, {});
  return targets && typeof targets === "object" && !Array.isArray(targets) ? targets : {};
}

function normalizeDailyStudyTargetSeconds(value) {
  const seconds = typeof value === "number" ? value : NaN;
  return Number.isInteger(seconds) && seconds >= 60 && seconds <= 24 * 60 * 60 ? seconds : 0;
}

function getExecutionTargetSourceLabel(source) {
  return ({
    manual: "手动设置",
    "confirmed-load": "已确认负荷计划",
    "recent-capacity": "近7日真实承载",
    "standard-load": "证据不足，标准负荷",
    plan: "原计划",
  })[String(source || "")] || "旧记录未注明";
}

function getDefaultStudyTargetSeconds(dateKey = getDateKey()) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.getDay() === 0 ? 5 * 3600 + 30 * 60 : 9 * 3600;
}

function getDailyStudyTargetSeconds(dateKey = getDateKey(), savedRecord = null) {
  const savedTarget = normalizeDailyStudyTargetSeconds(savedRecord && savedRecord.dailyStudyTargetSeconds);
  if (savedTarget) return savedTarget;
  const targets = readDailyStudyTargets();
  if (Object.prototype.hasOwnProperty.call(targets, dateKey)) {
    const liveTarget = normalizeDailyStudyTargetSeconds(targets[dateKey]);
    if (liveTarget) return liveTarget;
  }
  return getDefaultStudyTargetSeconds(dateKey);
}

function getPlanStudyTargetSeconds(dateKey = getDateKey(), savedRecord = null) {
  const savedPlanTarget = normalizeDailyStudyTargetSeconds(savedRecord && savedRecord.planStudyTargetSeconds);
  if (savedPlanTarget) return savedPlanTarget;
  const plans = readDailyPlans();
  const planTargetSeconds = Math.round(Math.max(0, Number(plans[dateKey] && plans[dateKey].targetEffectiveStudyHours) || 0) * 3600);
  if (planTargetSeconds > 0) return planTargetSeconds;
  const savedTarget = normalizeDailyStudyTargetSeconds(savedRecord && savedRecord.dailyStudyTargetSeconds);
  return savedTarget > 0 ? savedTarget : getDefaultStudyTargetSeconds(dateKey);
}

function getDailyExecutionTargetModel(dateKey = getDateKey(), savedRecord = null) {
  const savedExecutionTarget = normalizeDailyStudyTargetSeconds(savedRecord && savedRecord.executionTargetSeconds);
  const savedExecutionSource = String(savedRecord && savedRecord.executionTargetSource || "").trim();
  if (savedExecutionTarget && savedExecutionSource) {
    const planTargetSeconds = getPlanStudyTargetSeconds(dateKey, savedRecord);
    return {
      planTargetSeconds,
      executionTargetSeconds: savedExecutionTarget,
      source: savedExecutionSource,
      sourceLabel: String(savedRecord.executionTargetSourceLabel || getExecutionTargetSourceLabel(savedExecutionSource)),
      capacityCalibration: savedRecord.executionTargetEvidence && typeof savedRecord.executionTargetEvidence === "object"
        ? { ...savedRecord.executionTargetEvidence } : null,
      frozen: true,
    };
  }
  const plans = readDailyPlans();
  const plan = plans[dateKey] && typeof plans[dateKey] === "object" ? plans[dateKey] : null;
  const targets = readDailyStudyTargets();
  const hasManualTarget = Object.prototype.hasOwnProperty.call(targets, dateKey);
  const manualTargetSeconds = hasManualTarget ? normalizeDailyStudyTargetSeconds(targets[dateKey]) : 0;
  const hasValidManualTarget = hasManualTarget && manualTargetSeconds > 0;
  const planTargetSeconds = getPlanStudyTargetSeconds(dateKey, savedRecord);
  const throughDate = typeof addLocalPlanDays === "function"
    ? addLocalPlanDays(dateKey, -1)
    : new Date(new Date(`${dateKey}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10);
  if (typeof buildDailyExecutionTargetModel !== "function") {
    return {
      planTargetSeconds,
      executionTargetSeconds: manualTargetSeconds || planTargetSeconds,
      source: hasValidManualTarget ? "manual" : "plan",
      sourceLabel: hasValidManualTarget ? "手动设置" : "原计划",
      capacityCalibration: null,
    };
  }
  const model = buildDailyExecutionTargetModel({
    planTargetMinutes: planTargetSeconds / 60,
    hasManualTarget: hasValidManualTarget,
    manualTargetMinutes: manualTargetSeconds / 60,
    loadProfile: plan && plan.studyLoadProfile,
    history: typeof readHistory === "function" ? readHistory() : [],
    throughDate,
    professionalStore: typeof professionalResultsKey === "string" ? readJson(professionalResultsKey, {}) : {},
  });
  return {
    ...model,
    planTargetSeconds: model.planTargetMinutes * 60,
    executionTargetSeconds: model.executionTargetMinutes * 60,
  };
}

function isExcludedManualStudyTask(record) {
  if (!record) return false;
  if (isAuxiliaryManualStudyRecord(record)) return true;
  if (record.taskId === "other-study" || !record.taskId) return false;
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
  const hasCanonicalManualRecords = Boolean(savedRecord && savedRecord.manualRecordsSaved)
    || readManualTimeRecords().some((record) => record.date === dateKey);
  const liveManualSeconds = getManualStudySecondsForDate(dateKey);
  const manualStudySeconds = hasCanonicalManualRecords || liveManualSeconds > 0
    ? liveManualSeconds
    : Math.max(0, Number(savedRecord && savedRecord.manualStudySeconds) || 0);
  const totalStudySeconds = totalFocusSeconds + manualStudySeconds;
  const dailyStudyTargetSeconds = getDailyStudyTargetSeconds(dateKey, savedRecord);
  const targetModel = getDailyExecutionTargetModel(dateKey, savedRecord);
  const executionTargetSeconds = targetModel.executionTargetSeconds;
  const progressRate = executionTargetSeconds > 0 ? Math.round(totalStudySeconds / executionTargetSeconds * 100) : 0;
  return {
    totalFocusSeconds,
    manualStudySeconds,
    totalStudySeconds,
    dailyStudyTargetSeconds,
    planStudyTargetSeconds: targetModel.planTargetSeconds,
    executionTargetSeconds,
    targetModel,
    progressRate,
  };
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

function getStudyTimelineTime(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function buildTodayStudyTimelineEntries(dateKey, manualRecords = [], focusSessions = []) {
  const focusEntries = (Array.isArray(focusSessions) ? focusSessions : [])
    .filter((session) => session && session.date === dateKey && Number(session.seconds) > 0)
    .map((session) => {
      const endedAtTime = getStudyTimelineTime(session.endedAt);
      const directStart = getStudyTimelineTime(session.startedAt);
      const startedAtTime = Number.isFinite(directStart)
        ? directStart
        : (Number.isFinite(endedAtTime) ? endedAtTime - Number(session.seconds) * 1000 : Number.NaN);
      return {
        id: session.id || `focus-${startedAtTime}`,
        source: "focus",
        startedAt: Number.isFinite(startedAtTime) ? new Date(startedAtTime).toISOString() : "",
        endedAt: session.endedAt || "",
        durationSeconds: Number(session.seconds),
        taskTitle: session.taskName || session.taskId || "未归属专注",
        mode: session.mode || "free",
        sortTime: startedAtTime,
      };
    });
  const manualEntries = (Array.isArray(manualRecords) ? manualRecords : [])
    .filter((record) => record && record.date === dateKey && Number(record.durationSeconds) > 0)
    .map((record) => ({
      ...record,
      source: "manual",
      taskTitle: record.taskTitle || "其他考研学习",
      sortTime: getStudyTimelineTime(record.startedAt),
      fallbackSortTime: getStudyTimelineTime(record.createdAt),
    }));
  return [...focusEntries, ...manualEntries].sort((left, right) => {
    const leftScheduled = Number.isFinite(left.sortTime);
    const rightScheduled = Number.isFinite(right.sortTime);
    if (leftScheduled !== rightScheduled) return leftScheduled ? -1 : 1;
    const leftTime = leftScheduled ? left.sortTime : left.fallbackSortTime;
    const rightTime = rightScheduled ? right.sortTime : right.fallbackSortTime;
    if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
    if (!Number.isFinite(leftTime)) return 1;
    if (!Number.isFinite(rightTime)) return -1;
    return leftTime - rightTime;
  });
}

function renderTodayStudyTimeline() {
  const container = document.querySelector("#manualStudyRecords");
  if (!container) return;
  const dateKey = getDateKey();
  const manualRecords = readManualTimeRecords();
  const storedFocusSessions = readJson(focusSessionsKey, []);
  const focusSessions = Array.isArray(storedFocusSessions) ? storedFocusSessions : [];
  const entries = buildTodayStudyTimelineEntries(dateKey, manualRecords, focusSessions);
  container.replaceChildren();
  const summary = document.querySelector("#todayStudyTimelineSummary");
  if (summary) {
    const totalSeconds = entries.reduce((total, entry) => total + Math.max(0, Number(entry.durationSeconds) || 0), 0);
    summary.textContent = entries.length ? `${entries.length} 段 · ${formatFocusDuration(totalSeconds)}` : "0 段 · 暂无记录";
  }
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted today-study-timeline-empty";
    empty.textContent = "今天还没有已结算的时间段。开始专注或手动补录后会显示在这里。";
    container.appendChild(empty);
    return;
  }
  entries.forEach((record) => {
    const row = document.createElement("div");
    row.className = `today-study-timeline-record is-${record.source}`;
    const badge = document.createElement("span");
    badge.className = "today-study-timeline-badge";
    badge.textContent = record.source === "focus" ? "计时器" : "手动补录";
    const detail = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${formatManualStudyRange(record)} · ${record.taskTitle}`;
    const meta = document.createElement("span");
    const modeText = record.source === "focus" ? (record.mode === "pomodoro" ? "25分钟番茄" : "自由专注") : "手动记录";
    meta.textContent = `${formatFocusDuration(record.durationSeconds)} · ${modeText}${record.note ? ` · ${record.note}` : ""}`;
    detail.append(title, meta);
    row.append(badge, detail);
    if (record.source === "manual") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button danger-link";
      button.dataset.deleteManualTime = record.id;
      button.textContent = "删除";
      row.appendChild(button);
    }
    container.appendChild(row);
  });
}

function renderManualStudyRecords() {
  renderTodayStudyTimeline();
}

function renderStudyTimeSummary() {
  const totalElement = document.querySelector("#todayStudyTotal");
  if (!totalElement) return;
  const snapshot = getStudyTimeSnapshot();
  document.querySelector("#todayManualStudyTotal").textContent = formatFocusClock(snapshot.manualStudySeconds);
  totalElement.textContent = formatFocusClock(snapshot.totalStudySeconds);
  document.querySelector("#todayStudyTarget").textContent = formatTargetDuration(snapshot.executionTargetSeconds);
  document.querySelector("#todayPlanStudyTarget").textContent = formatTargetDuration(snapshot.planStudyTargetSeconds);
  document.querySelector("#todayStudyTargetSource").textContent = snapshot.targetModel.sourceLabel;
  document.querySelector("#todayStudyProgress").textContent = `${snapshot.progressRate}%`;
  const difference = snapshot.totalStudySeconds - snapshot.executionTargetSeconds;
  document.querySelector("#todayStudyRemaining").textContent = difference >= 0
    ? `今日已超过目标：${formatFocusDuration(difference)}`
    : `还差：${formatFocusDuration(Math.abs(difference))}`;
  const targetHours = document.querySelector("#dailyTargetHours");
  const targetMinutes = document.querySelector("#dailyTargetMinutes");
  if (![targetHours, targetMinutes].includes(document.activeElement)) {
    targetHours.value = Math.floor(snapshot.executionTargetSeconds / 3600);
    targetMinutes.value = Math.floor(snapshot.executionTargetSeconds % 3600 / 60);
  }
  if (typeof renderExamStatsOverview === "function") renderExamStatsOverview();
}

function refreshStudyTimeViews() {
  renderStudyTimeSummary();
  renderManualStudyRecords();
  renderRecentSevenDays();
  renderHistory();
  if (typeof renderStudyProgressRunner === "function") renderStudyProgressRunner();
}

function saveManualStudyTime() {
  const hours = Math.max(0, Math.floor(Number(document.querySelector("#manualStudyHours").value) || 0));
  const minutes = Math.max(0, Math.floor(Number(document.querySelector("#manualStudyMinutes").value) || 0));
  const date = getDateKey();
  const interval = buildManualStudyInterval(date, document.querySelector("#manualStudyStartTime").value, document.querySelector("#manualStudyEndTime").value);
  if (!interval.valid) return setStatus("#manualStudyStatus", interval.error, true);
  const durationSeconds = interval.specified ? interval.durationSeconds : hours * 3600 + minutes * 60;
  if ((!interval.specified && (hours > 24 || minutes > 59)) || durationSeconds <= 0) {
    return setStatus("#manualStudyStatus", "请输入有效的小时和分钟。", true);
  }
  if (interval.specified) {
    const manualRecords = readManualTimeRecords().filter((record) => record.date === date);
    const storedFocusSessions = readJson(focusSessionsKey, []);
    const focusSessions = (Array.isArray(storedFocusSessions) ? storedFocusSessions : []).filter((session) => session && session.date === date);
    const overlap = findManualStudyIntervalOverlap(interval, manualRecords, focusSessions);
    if (overlap) {
      return setStatus("#manualStudyStatus", overlap.type === "focus"
        ? "该时间段与已有专注记录重叠，请核对后再保存。"
        : "该时间段与已有手动补录重叠，请核对后再保存。", true);
    }
  }
  const select = document.querySelector("#manualStudyTask");
  const taskId = select.value || "other-study";
  const taskTitle = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : "其他考研学习";
  const record = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    createdAt: new Date().toISOString(),
    durationSeconds,
    taskId,
    taskTitle,
    note: document.querySelector("#manualStudyNote").value.trim().slice(0, 120),
    ...(interval.specified ? {
      startTime: interval.startTime,
      endTime: interval.endTime,
      startedAt: interval.startedAt,
      endedAt: interval.endedAt,
    } : {}),
  };
  if (isExcludedManualStudyTask(record)) {
    return setStatus("#manualStudyStatus", "辅助活动不计入有效学习时长；只补录英语、政治、专业课、闭卷输出或复盘。", true);
  }
  const records = readManualTimeRecords();
  records.push(record);
  writeJson(manualTimeRecordsKey, records);
  document.querySelector("#manualStudyStartTime").value = "";
  document.querySelector("#manualStudyEndTime").value = "";
  document.querySelector("#manualStudyHours").value = "0";
  document.querySelector("#manualStudyMinutes").value = "0";
  document.querySelector("#manualStudyNote").value = "";
  setStatus("#manualStudyStatus", `已补录 ${formatManualStudyRange(record)}，共 ${formatFocusDuration(record.durationSeconds)}。`);
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
  if (hours > 24 || minutes > 59 || seconds <= 0 || seconds > 24 * 60 * 60) {
    return setStatus("#dailyTargetStatus", "今日目标必须大于0且不超过24小时。", true);
  }
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
    row.textContent = `${formatManualStudyRange(record)}｜${formatFocusDuration(record.durationSeconds)}｜${record.taskTitle || "其他考研学习"}${record.note ? `｜${record.note}` : ""}`;
    list.appendChild(row);
  });
  container.append(heading, list);
}
