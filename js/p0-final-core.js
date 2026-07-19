// P0 Checkpoint 5: pure final dashboard facts, snapshot, priority, and Markdown logic.
const P0_FINAL_SCHEMA_VERSION = 1;
const P0_FINAL_MIGRATION_ID = "p0-final-closeout-v1";
const P0_TODAY_SNAPSHOT_TYPE = "study-dashboard-today-snapshot";

function isP0Object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function p0Text(value, fallback = "未记录") {
  const text = String(value || "").trim();
  return text || fallback;
}

function p0TaskStatus(task) {
  if (task && ["not-started", "in-progress", "completed", "skipped", "partial"].includes(task.status)) return task.status;
  return task && task.completed === true ? "completed" : task && task.partial === true ? "partial" : "not-started";
}

function p0IsLearningTask(task) {
  return Boolean(task) && (task.counted === true || task.exercise === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && !task.exercise));
}

function p0CalendarDaysBetween(startKey, endKey) {
  const start = parseLocalPlanDate(startKey);
  const end = parseLocalPlanDate(endKey);
  return Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
}

function getP0MilestoneDate(milestone) {
  if (!isP0Object(milestone)) return "";
  return [milestone.internalTarget, milestone.date, milestone.startDate, milestone.endDate, milestone.deadlineOrPeriod]
    .find((value) => isPlanDateKey(value)) || "";
}

function getP0PhaseOverview(templates, todayKey) {
  const phases = (Array.isArray(templates) ? templates : [])
    .filter((phase) => phase && isPlanDateKey(phase.startDate) && isPlanDateKey(phase.endDate))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
  const current = phases.find((phase) => phase.startDate <= todayKey && phase.endDate >= todayKey) || null;
  const next = phases.find((phase) => phase.startDate > todayKey) || null;
  const milestones = phases.flatMap((phase) => (Array.isArray(phase.milestones) ? phase.milestones : []).map((milestone) => ({ phase, milestone, date: getP0MilestoneDate(milestone) })));
  const nextMilestone = milestones
    .filter((item) => !item.date || item.date >= todayKey)
    .sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"))[0] || null;
  let status = "unconfigured";
  if (current) status = "active";
  else if (next && phases.some((phase) => phase.endDate < todayKey)) status = "transition";
  else if (next) status = "before-start";
  else if (phases.length) status = "completed";
  return {
    status,
    current,
    currentName: current ? current.phaseName : status === "transition" ? "阶段间过渡" : "未配置",
    remainingDays: current ? Math.max(0, p0CalendarDaysBetween(todayKey, current.endDate)) : null,
    next,
    nextMilestone,
  };
}

function normalizeP0Review(record, index = 0) {
  const source = isP0Object(record) ? record : {};
  return {
    ...source,
    reviewId: String(source.reviewId || `review-${index}`),
    reviewKey: String(source.reviewKey || source.reviewId || `review-${index}`),
    reviewLevel: String(source.reviewLevel || ""),
    dueDate: isPlanDateKey(source.dueDate) ? source.dueDate : "",
    status: String(source.status || "pending"),
  };
}

function getP0ReviewFacts(queue, todayKey) {
  const tomorrow = addLocalPlanDays(todayKey, 1);
  const active = (Array.isArray(queue) ? queue : []).map(normalizeP0Review)
    .filter((review) => review.status === "pending" && review.dueDate);
  const completedToday = (Array.isArray(queue) ? queue : []).map(normalizeP0Review)
    .filter((review) => review.status === "completed" && review.completedDate === todayKey);
  return {
    completedToday,
    overdue: active.filter((review) => review.dueDate < todayKey),
    dueToday: active.filter((review) => review.dueDate === todayKey),
    dueTomorrow: active.filter((review) => review.dueDate === tomorrow),
  };
}

function getP0TaskPriorityRank(task) {
  const text = `${task && task.id || ""} ${task && task.taskId || ""} ${task && task.sourceTaskKey || ""} ${task && task.category || ""} ${task && task.name || ""}`.toLowerCase();
  if (/722|mayuan|ma-yuan/.test(text)) return 30;
  if (/844|mahist|ma-history/.test(text)) return 40;
  if (/english|英语/.test(text)) return 50;
  if (/politic|政治/.test(text)) return 60;
  if (/output|输出/.test(text)) return 70;
  if (task && (task.exercise || /training|exercise|训练|锻炼/.test(text))) return 80;
  return 90;
}

function getP0ReviewPriorityRank(review, todayKey) {
  if (review.dueDate < todayKey && review.reviewLevel === "short-retest") return 0;
  const overdueLevels = { D30: 10, D14: 11, D7: 12, D3: 13, D1: 14 };
  if (review.dueDate < todayKey && Object.prototype.hasOwnProperty.call(overdueLevels, review.reviewLevel)) return overdueLevels[review.reviewLevel];
  if (review.dueDate === todayKey) return 20;
  if (review.dueDate < todayKey) return 21;
  return 99;
}

function buildP0TopPriorities(dailyPlan, reviewQueue, todayKey, limit = 3) {
  const candidates = [];
  const seen = new Set();
  (Array.isArray(reviewQueue) ? reviewQueue : []).map(normalizeP0Review)
    .filter((review) => review.status === "pending" && review.dueDate && review.dueDate <= todayKey)
    .forEach((review) => {
      const key = `review:${review.reviewKey || review.reviewId}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        type: "review", key, rank: getP0ReviewPriorityRank(review, todayKey),
        title: `${review.reviewLevel || "复盘"} · ${review.subject || ""} · ${review.knowledgeUnit || review.task || "未命名复盘"}`,
        meta: review.dueDate < todayKey ? `已逾期 · ${review.dueDate}` : "今日到期",
        targetId: review.reviewId,
      });
    });
  const tasks = dailyPlan && Array.isArray(dailyPlan.tasks) ? dailyPlan.tasks : [];
  tasks.filter((task) => p0IsLearningTask(task) && !["completed", "skipped"].includes(p0TaskStatus(task))).forEach((task, index) => {
    const stable = task.taskId || task.id || task.sourceTaskKey || `custom-${index}`;
    const key = `task:${stable}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      type: "task", key, rank: getP0TaskPriorityRank(task),
      title: p0Text(task.name || task.title, "未命名任务"),
      meta: p0TaskStatus(task) === "in-progress" ? "进行中" : p0Text(task.time, "未设置时间"),
      targetId: task.id || task.taskId || "",
    });
  });
  return candidates.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key)).slice(0, limit);
}

function getP0TaskEndMinutes(timeText) {
  const matches = [...String(timeText || "").matchAll(/(\d{1,2}):(\d{2})/g)];
  if (matches.length < 2) return null;
  return Number(matches.at(-1)[1]) * 60 + Number(matches.at(-1)[2]);
}

function getP0FactSummary(dailyPlan, reviewQueue, todayKey, currentMinutes = null) {
  const tasks = dailyPlan && Array.isArray(dailyPlan.tasks) ? dailyPlan.tasks : [];
  const learning = tasks.filter(p0IsLearningTask);
  const reviews = getP0ReviewFacts(reviewQueue, todayKey);
  const unfinished = learning.filter((task) => !["completed", "skipped"].includes(p0TaskStatus(task)));
  const inProgress = learning.filter((task) => p0TaskStatus(task) === "in-progress");
  const overdueBySchedule = Number.isFinite(currentMinutes) ? unfinished.filter((task) => {
    const endMinutes = getP0TaskEndMinutes(task.time);
    return endMinutes !== null && endMinutes < currentMinutes;
  }) : [];
  return { dueTodayCount: reviews.dueToday.length, overdueReviewCount: reviews.overdue.length, unfinishedTaskCount: unfinished.length, inProgress, overdueBySchedule };
}

function getP0ProfessionalSnapshot(store, dateKey) {
  const source = isP0Object(store) && isP0Object(store.days) ? store.days : {};
  const day = isP0Object(source[dateKey]) ? source[dateKey] : {};
  return Object.fromEntries(["722", "844"].map((subject) => {
    const record = isP0Object(day[subject]) ? day[subject] : {};
    const units = Array.isArray(record.units) ? record.units.filter(isP0Object) : [];
    return [subject, {
      actualUnits: units.map((unit) => p0Text(unit.name, "未命名知识单元")),
      mastery: units.map((unit) => ({ unitId: unit.unitId || "", name: p0Text(unit.name, "未命名知识单元"), level: p0Text(unit.mastery) })),
      reviewResults: units.map((unit) => ({ unitId: unit.unitId || "", name: p0Text(unit.name, "未命名知识单元"), result: p0Text(unit.reviewResult) })),
      mainGaps: units.flatMap((unit) => Array.isArray(unit.mainGaps) ? unit.mainGaps.filter(Boolean) : []),
      nextStart: units.map((unit) => String(unit.nextStart || "").trim()).filter(Boolean).at(-1) || "未记录",
    }];
  }));
}

function p0SnapshotTask(task, taskFocusSeconds = {}) {
  const id = task.taskId || task.id || task.sourceTaskKey || "";
  return {
    taskId: id,
    sourceTaskKey: task.sourceTaskKey || "",
    title: p0Text(task.name || task.title, "未命名任务"),
    status: p0TaskStatus(task),
    plannedTime: String(task.time || ""),
    actualFocusSeconds: Math.max(0, Math.floor(Number(taskFocusSeconds[id] ?? taskFocusSeconds[task.id]) || 0)),
  };
}

function buildP0TodaySnapshot(input = {}) {
  const date = isPlanDateKey(input.date) ? input.date : getLocalPlanDateKey();
  const plan = isP0Object(input.dailyPlan) ? input.dailyPlan : {};
  const tasks = Array.isArray(plan.tasks) ? plan.tasks.filter(p0IsLearningTask) : [];
  const taskFocus = isP0Object(input.taskFocusSeconds) ? input.taskFocusSeconds : {};
  const taskSnapshots = tasks.map((task) => p0SnapshotTask(task, taskFocus));
  const phaseOverview = getP0PhaseOverview(input.phaseTemplates, date);
  const professionalProgress = getP0ProfessionalSnapshot(input.professionalStore, date);
  const reviews = getP0ReviewFacts(input.reviewQueue, date);
  const history = Array.isArray(input.history) ? input.history : [];
  const todayRecord = history.find((record) => record && record.date === date) || null;
  const warnings = [];
  if (!Array.isArray(plan.tasks)) warnings.push("今日计划未记录");
  ["722", "844"].forEach((subject) => {
    professionalProgress[subject].reviewResults.filter((item) => item.result === "未验收").forEach((item) => warnings.push(`${subject} ${item.name}尚未验收`));
  });
  const byStatus = (status) => taskSnapshots.filter((task) => task.status === status);
  const unfinished = taskSnapshots.filter((task) => !["completed", "partial", "in-progress", "skipped"].includes(task.status));
  return {
    schemaVersion: P0_FINAL_SCHEMA_VERSION,
    type: P0_TODAY_SNAPSHOT_TYPE,
    date,
    phase: phaseOverview.current ? {
      id: phaseOverview.current.phaseId || "",
      name: phaseOverview.current.phaseName || "",
      startDate: phaseOverview.current.startDate || "",
      endDate: phaseOverview.current.endDate || "",
    } : { id: "", name: phaseOverview.currentName, startDate: "", endDate: "" },
    effectiveStudySeconds: Math.max(0, Math.floor(Number(input.effectiveStudySeconds) || 0)),
    taskFocusSeconds: Object.fromEntries(Object.entries(taskFocus).map(([key, seconds]) => [key, Math.max(0, Math.floor(Number(seconds) || 0))])),
    tasks: { completed: byStatus("completed"), partial: byStatus("partial"), inProgress: byStatus("in-progress"), unfinished },
    professionalProgress,
    reviews: { completedToday: reviews.completedToday, overdue: reviews.overdue, dueTomorrow: reviews.dueTomorrow },
    unfinishedSummary: unfinished.map((task) => task.title),
    warnings,
    tomorrowPriority: p0Text(todayRecord && todayRecord.tomorrowPriority),
  };
}

function formatP0Duration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!safe) return "未记录";
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe % 3600 / 60);
  return `${hours ? `${hours}小时` : ""}${minutes ? `${minutes}分钟` : hours ? "" : "不足1分钟"}`;
}

function p0JoinSnapshotItems(items, selector) {
  const values = (Array.isArray(items) ? items : []).map(selector).filter(Boolean);
  return values.length ? values.join("；") : "未记录";
}

function buildP0ControlMarkdown(snapshot) {
  const data = isP0Object(snapshot) ? snapshot : buildP0TodaySnapshot();
  const professionalLine = (subject, field, selector) => p0JoinSnapshotItems(data.professionalProgress && data.professionalProgress[subject] && data.professionalProgress[subject][field], selector);
  const reviewLine = (field) => p0JoinSnapshotItems(data.reviews && data.reviews[field], (item) => `${item.reviewLevel || "复盘"} ${item.subject || ""} ${item.knowledgeUnit || item.task || ""}`.trim());
  return [
    `日期：${p0Text(data.date)}`,
    `当前阶段：${p0Text(data.phase && data.phase.name)}`,
    `有效学习时长：${formatP0Duration(data.effectiveStudySeconds)}`,
    `今日已完成：${p0JoinSnapshotItems(data.tasks && data.tasks.completed, (item) => item.title)}`,
    `今日部分完成：${p0JoinSnapshotItems(data.tasks && data.tasks.partial, (item) => item.title)}`,
    `今日未完成：${p0JoinSnapshotItems([...(data.tasks && data.tasks.inProgress || []), ...(data.tasks && data.tasks.unfinished || [])], (item) => item.title)}`,
    `722实际完成：${professionalLine("722", "actualUnits", (item) => typeof item === "string" ? item : item.name)}`,
    `722掌握情况：${professionalLine("722", "mastery", (item) => `${item.name} ${item.level}`)}`,
    `722主要遗漏：${professionalLine("722", "mainGaps", (item) => item)}`,
    `722下一起点：${p0Text(data.professionalProgress && data.professionalProgress["722"] && data.professionalProgress["722"].nextStart)}`,
    `844实际完成：${professionalLine("844", "actualUnits", (item) => typeof item === "string" ? item : item.name)}`,
    `844掌握情况：${professionalLine("844", "mastery", (item) => `${item.name} ${item.level}`)}`,
    `844主要遗漏：${professionalLine("844", "mainGaps", (item) => item)}`,
    `844下一起点：${p0Text(data.professionalProgress && data.professionalProgress["844"] && data.professionalProgress["844"].nextStart)}`,
    `今日完成复盘：${reviewLine("completedToday")}`,
    `逾期复盘：${reviewLine("overdue")}`,
    `明日到期复盘：${reviewLine("dueTomorrow")}`,
    `今日主要问题：${p0JoinSnapshotItems([...(data.unfinishedSummary || []), ...(data.warnings || [])], (item) => item)}`,
    `明日最高优先级：${p0Text(data.tomorrowPriority)}`,
  ].join("\n");
}

function getLatestP0FormalActivityDate(values = {}) {
  const dates = [];
  const add = (dateKey) => { if (isPlanDateKey(dateKey)) dates.push(dateKey); };
  (Array.isArray(values.history) ? values.history : []).forEach((record) => add(record && record.date));
  Object.entries(isP0Object(values.focusTotals) ? values.focusTotals : {}).forEach(([date, seconds]) => { if (Number(seconds) > 0) add(date); });
  Object.entries(isP0Object(values.taskFocusTotals) ? values.taskFocusTotals : {}).forEach(([date, totals]) => { if (Object.values(isP0Object(totals) ? totals : {}).some((seconds) => Number(seconds) > 0)) add(date); });
  (Array.isArray(values.manualRecords) ? values.manualRecords : []).forEach((record) => { if (Number(record && record.durationSeconds) > 0) add(record.date); });
  (Array.isArray(values.focusSessions) ? values.focusSessions : []).forEach((session) => { if (Number(session && session.seconds) > 0) add(session.date); });
  const professionalDays = isP0Object(values.professionalStore) && isP0Object(values.professionalStore.days) ? values.professionalStore.days : {};
  Object.keys(professionalDays).forEach(add);
  (Array.isArray(values.reviewQueue) ? values.reviewQueue : []).forEach((review) => { if (review && review.status === "completed") add(review.completedDate); });
  Object.entries(isP0Object(values.dailyPlans) ? values.dailyPlans : {}).forEach(([date, plan]) => {
    if (plan && Array.isArray(plan.tasks) && plan.tasks.some((task) => ["in-progress", "completed", "skipped", "partial"].includes(p0TaskStatus(task)))) add(date);
  });
  return dates.sort().at(-1) || "";
}
