// Exam-period cumulative study overview derived from existing raw data.
const EXAM_STATS_DEFAULT_START_DATE = "2026-07-18";
const EXAM_SUBJECTS = [
  { id: "english", name: "英语", color: "#3d7ea6" },
  { id: "maYuan", name: "722马原", color: "#39745b" },
  { id: "maHistory", name: "844马发史", color: "#9a6a3a" },
  { id: "politics", name: "公共政治", color: "#8763a6" },
  { id: "general", name: "综合复盘/输出", color: "#7b8580" },
];

function isValidExamDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function readExamStatsConfig() {
  const config = readJson(examStatsConfigKey, {});
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function readImportedPlanMeta() {
  const plan = readJson(importedPlanKey, {});
  return plan && typeof plan === "object" && !Array.isArray(plan) ? plan : {};
}

function getExamStatsStartDate() {
  const importedStartDate = readImportedPlanMeta().startDate;
  if (isValidExamDateKey(importedStartDate)) return importedStartDate;
  const configuredStartDate = readExamStatsConfig().startDate;
  return isValidExamDateKey(configuredStartDate) ? configuredStartDate : EXAM_STATS_DEFAULT_START_DATE;
}

function classifyExamSubject(source = {}) {
  const category = String(source.category || "");
  if (["english", "englishWords", "englishReading"].includes(category)) return "english";
  if (category === "maYuan") return "maYuan";
  if (category === "maHistory") return "maHistory";
  if (category === "politics") return "politics";
  if (category === "exercise" || source.exercise === true) return null;

  const text = [source.id, source.taskId, source.name, source.taskName, source.taskTitle, source.description, source.minimum, source.note]
    .filter(Boolean).join(" ");
  if (/居家训练|训练|锻炼|运动|午饭|午休|洗澡|吃饭|休息|睡觉|起床|早餐|放松/.test(text)) return null;
  const matches = [];
  if (/英语|单词|阅读|翻译|新题型/.test(text)) matches.push("english");
  if (/722|马原|马克思主义基本原理/.test(text)) matches.push("maYuan");
  if (/844|马发史|马克思主义发展史/.test(text)) matches.push("maHistory");
  if (/公共政治|政治选择题|政治错题|肖秀荣|腿姐|徐涛/.test(text)) matches.push("politics");
  return matches.length === 1 ? matches[0] : "general";
}

function findExamTask(dateKey, taskId, historyRecord, plans) {
  const plan = plans[dateKey];
  const planTask = plan && Array.isArray(plan.tasks) ? plan.tasks.find((task) => task.id === taskId) : null;
  if (planTask) return planTask;
  const savedTasks = historyRecord && Array.isArray(historyRecord.tasks) ? historyRecord.tasks : [];
  return savedTasks.find((task) => task.id === taskId) || { id: taskId };
}

function addCategorizedSeconds(subjectTotals, subjectId, seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!safeSeconds) return;
  subjectTotals[subjectId || "general"] += safeSeconds;
}

function distributeFocusSeconds(subjectTotals, focusSeconds, entries) {
  const safeFocusSeconds = Math.max(0, Math.floor(Number(focusSeconds) || 0));
  const rawTotals = Object.fromEntries(EXAM_SUBJECTS.map((subject) => [subject.id, 0]));
  entries.forEach((entry) => addCategorizedSeconds(rawTotals, entry.subjectId, entry.seconds));
  const rawTotal = Object.values(rawTotals).reduce((sum, seconds) => sum + seconds, 0);
  if (!rawTotal) {
    addCategorizedSeconds(subjectTotals, "general", safeFocusSeconds);
    return;
  }
  const scale = rawTotal > safeFocusSeconds ? safeFocusSeconds / rawTotal : 1;
  let allocated = 0;
  EXAM_SUBJECTS.forEach((subject) => {
    const seconds = Math.floor(rawTotals[subject.id] * scale);
    subjectTotals[subject.id] += seconds;
    allocated += seconds;
  });
  addCategorizedSeconds(subjectTotals, "general", safeFocusSeconds - allocated);
}

function getExamStatsSummary() {
  const startDate = getExamStatsStartDate();
  const endDate = getDateKey();
  const focusTotals = readFocusTotals();
  const taskFocusTotals = readTaskFocusTotals();
  const manualRecords = readManualTimeRecords();
  const focusSessions = readJson(focusSessionsKey, []);
  const safeFocusSessions = Array.isArray(focusSessions) ? focusSessions.filter((session) => session && isValidExamDateKey(session.date)) : [];
  const history = readHistory();
  const historyByDate = Object.fromEntries(history.filter((record) => record && isValidExamDateKey(record.date)).map((record) => [record.date, record]));
  const plans = readDailyPlans();
  const dateKeys = new Set([
    ...Object.keys(focusTotals),
    ...Object.keys(taskFocusTotals),
    ...manualRecords.map((record) => record.date),
    ...safeFocusSessions.map((session) => session.date),
    ...Object.keys(historyByDate),
  ]);
  const subjectTotals = Object.fromEntries(EXAM_SUBJECTS.map((subject) => [subject.id, 0]));
  let totalSeconds = 0;

  [...dateKeys].filter((dateKey) => isValidExamDateKey(dateKey) && dateKey >= startDate && dateKey <= endDate).sort().forEach((dateKey) => {
    const historyRecord = historyByDate[dateKey];
    const savedFocus = Math.max(0, Number(historyRecord && (historyRecord.totalFocusSeconds ?? historyRecord.focusSeconds)) || 0);
    const focusSeconds = Math.max(Math.max(0, Number(focusTotals[dateKey]) || 0), savedFocus);
    const liveTaskSeconds = taskFocusTotals[dateKey] && typeof taskFocusTotals[dateKey] === "object" ? taskFocusTotals[dateKey] : {};
    const savedTaskSeconds = historyRecord && historyRecord.taskFocusSeconds && typeof historyRecord.taskFocusSeconds === "object" ? historyRecord.taskFocusSeconds : {};
    const taskSnapshotSeconds = Object.fromEntries((historyRecord && Array.isArray(historyRecord.tasks) ? historyRecord.tasks : [])
      .filter((task) => task && task.id)
      .map((task) => [task.id, Math.max(0, Number(task.focusSeconds) || 0)]));
    const taskIds = new Set([...Object.keys(liveTaskSeconds), ...Object.keys(savedTaskSeconds), ...Object.keys(taskSnapshotSeconds)]);
    const focusEntries = [...taskIds].map((taskId) => {
      const task = findExamTask(dateKey, taskId, historyRecord, plans);
      return {
        subjectId: classifyExamSubject(task),
        seconds: Math.max(0, Number(liveTaskSeconds[taskId]) || 0, Number(savedTaskSeconds[taskId]) || 0, Number(taskSnapshotSeconds[taskId]) || 0),
      };
    }).filter((entry) => entry.seconds > 0);
    if (!focusEntries.length && focusSeconds > 0) {
      safeFocusSessions.filter((session) => session.date === dateKey).forEach((session) => {
        const task = findExamTask(dateKey, session.taskId, historyRecord, plans);
        focusEntries.push({ subjectId: classifyExamSubject({ ...task, ...session }), seconds: session.seconds });
      });
    }
    const rawFocusEntryTotal = focusEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.seconds) || 0), 0);
    const focusEntryScale = rawFocusEntryTotal > focusSeconds && rawFocusEntryTotal > 0 ? focusSeconds / rawFocusEntryTotal : 1;
    const excludedFocusSeconds = Math.floor(focusEntries
      .filter((entry) => !entry.subjectId)
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.seconds) || 0), 0) * focusEntryScale);
    const eligibleFocusSeconds = Math.max(0, focusSeconds - excludedFocusSeconds);
    distributeFocusSeconds(subjectTotals, eligibleFocusSeconds, focusEntries.filter((entry) => entry.subjectId));

    const liveManualRecordsForDate = manualRecords.filter((record) => record.date === dateKey);
    const liveManualRecords = liveManualRecordsForDate.filter((record) => !isExcludedManualStudyTask(record));
    const savedManualRecords = historyRecord && Array.isArray(historyRecord.manualTimeRecords)
      ? historyRecord.manualTimeRecords.filter((record) => !isExcludedManualStudyTask(record))
      : [];
    const hasCanonicalManualRecords = liveManualRecordsForDate.length || (historyRecord && historyRecord.manualRecordsSaved);
    const detailedManualRecords = hasCanonicalManualRecords
      ? liveManualRecords
      : savedManualRecords;
    let manualSeconds = 0;
    detailedManualRecords.forEach((record) => {
      const seconds = Math.max(0, Math.floor(Number(record.durationSeconds) || 0));
      manualSeconds += seconds;
      const task = findExamTask(dateKey, record.taskId, historyRecord, plans);
      addCategorizedSeconds(subjectTotals, classifyExamSubject({ ...task, ...record, category: task.category || record.category }), seconds);
    });
    if (!detailedManualRecords.length && !hasCanonicalManualRecords) {
      manualSeconds = Math.max(0, Math.floor(Number(historyRecord && historyRecord.manualStudySeconds) || 0));
      addCategorizedSeconds(subjectTotals, "general", manualSeconds);
    }

    let dailyTotal = eligibleFocusSeconds + manualSeconds;
    if (historyRecord && !hasCanonicalManualRecords && !historyRecord.manualRecordsSaved) {
      const legacyTotal = Math.max(0, Math.floor(Number(historyRecord.totalStudySeconds) || 0));
      if (legacyTotal > dailyTotal) {
        addCategorizedSeconds(subjectTotals, "general", legacyTotal - dailyTotal);
        dailyTotal = legacyTotal;
      }
    }
    totalSeconds += dailyTotal;
  });

  return {
    startDate,
    endDate,
    totalSeconds,
    subjects: EXAM_SUBJECTS.map((subject) => ({
      ...subject,
      seconds: subjectTotals[subject.id],
      percentage: totalSeconds > 0 ? Math.round(subjectTotals[subject.id] / totalSeconds * 100) : 0,
    })),
  };
}

function formatExamStatsDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor(safeSeconds % 3600 / 60);
  if (hours) return `${hours}小时${String(minutes).padStart(2, "0")}分钟`;
  return minutes ? `${minutes}分钟` : safeSeconds ? `${safeSeconds}秒` : "0分钟";
}

function renderExamStatsOverview() {
  const container = document.querySelector("#examSubjectBars");
  if (!container) return;
  const summary = getExamStatsSummary();
  document.querySelector("#examStatsTotal").textContent = formatExamStatsDuration(summary.totalSeconds);
  document.querySelector("#examStatsRange").textContent = `统计区间：${summary.startDate} 至 ${summary.endDate}`;
  container.replaceChildren();
  summary.subjects.forEach((subject) => {
    const row = document.createElement("div");
    row.className = "exam-subject-row";
    const name = document.createElement("span");
    name.className = "exam-subject-name";
    name.textContent = subject.name;
    const track = document.createElement("div");
    track.className = "exam-subject-track";
    const fill = document.createElement("span");
    fill.className = "exam-subject-fill";
    fill.style.width = `${Math.min(100, subject.percentage)}%`;
    fill.style.setProperty("--subject-color", subject.color);
    track.appendChild(fill);
    const value = document.createElement("span");
    value.className = "exam-subject-value";
    value.textContent = `${formatExamStatsDuration(subject.seconds)}（${subject.percentage}%）`;
    row.append(name, track, value);
    container.appendChild(row);
  });
}

function renderExamStatsConfig() {
  const input = document.querySelector("#examStatsStartDate");
  if (!input) return;
  const importedPlan = readImportedPlanMeta();
  const hasImportedStartDate = isValidExamDateKey(importedPlan.startDate);
  input.value = getExamStatsStartDate();
  input.disabled = hasImportedStartDate;
  document.querySelector("#saveExamStatsStartDateBtn").disabled = hasImportedStartDate;
  document.querySelector("#examStatsStartHint").textContent = hasImportedStartDate
    ? `当前使用已导入计划的开始日期：${importedPlan.startDate}`
    : "未导入计划时，可在这里修改统计开始日期；只影响累计汇总。";
}

function saveExamStatsStartDate() {
  if (isValidExamDateKey(readImportedPlanMeta().startDate)) return;
  const input = document.querySelector("#examStatsStartDate");
  if (!isValidExamDateKey(input.value) || input.value > getDateKey()) {
    return setStatus("#examStatsStartStatus", "请选择不晚于今天的有效日期。", true);
  }
  writeJson(examStatsConfigKey, { ...readExamStatsConfig(), startDate: input.value });
  setStatus("#examStatsStartStatus", "考研统计开始日期已保存，累计概览已重新计算。 ");
  renderExamStatsOverview();
}

function initExamStats() {
  renderExamStatsConfig();
  renderExamStatsOverview();
  const saveButton = document.querySelector("#saveExamStatsStartDateBtn");
  if (saveButton) saveButton.addEventListener("click", saveExamStatsStartDate);
}
