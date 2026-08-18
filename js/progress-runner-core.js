// Pure daily / weekly / monthly pace model. Reads facts supplied by the UI and never writes storage.
function progressRunnerObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function progressRunnerArray(value) { return Array.isArray(value) ? value : []; }
function progressRunnerClamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function progressRunnerDate(dateKey) { return new Date(`${dateKey}T12:00:00`); }
function progressRunnerDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function progressRunnerAddDays(dateKey, amount) {
  const date = progressRunnerDate(dateKey); date.setDate(date.getDate() + amount); return progressRunnerDateKey(date);
}
function progressRunnerDates(start, end) {
  const dates = [];
  for (let date = start; date <= end; date = progressRunnerAddDays(date, 1)) dates.push(date);
  return dates;
}
function progressRunnerPeriodRange(period, dateKey) {
  if (period === "daily") return { start: dateKey, end: dateKey, dates: [dateKey] };
  const current = progressRunnerDate(dateKey);
  if (period === "weekly") {
    const offset = (current.getDay() + 6) % 7;
    const start = progressRunnerAddDays(dateKey, -offset);
    const end = progressRunnerAddDays(start, 6);
    return { start, end, dates: progressRunnerDates(start, end) };
  }
  const start = `${dateKey.slice(0, 7)}-01`;
  const endDate = new Date(current.getFullYear(), current.getMonth() + 1, 0, 12);
  const end = progressRunnerDateKey(endDate);
  return { start, end, dates: progressRunnerDates(start, end) };
}
function progressRunnerTaskValue(task) {
  if (!task || task.status === "cancelled" || task.status === "skipped") return null;
  if (String(task.category || "") === "rollingReview") return null;
  if (task.counted !== true || task.exercise === true) return null;
  if (task.completed === true || task.status === "completed") return 1;
  if (task.status === "partial") return 0.5;
  if (task.status === "in-progress") return 0.25;
  return 0;
}
function progressRunnerClock(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}
function progressRunnerScheduleValue(task, nowMinutes) {
  const match = String(task && task.time || "").match(/(\d{1,2}:\d{2})\s*[—–-]\s*(\d{1,2}:\d{2})/);
  const fallback = progressRunnerClamp((Number(nowMinutes) - 8 * 60) / (13 * 60 + 40));
  if (!match) return fallback;
  const start = progressRunnerClock(match[1]); const end = progressRunnerClock(match[2]);
  if (start === null || end === null || end <= start) return fallback;
  return progressRunnerClamp((Number(nowMinutes) - start) / (end - start));
}
function progressRunnerDayFacts(day = {}, options = {}) {
  const tasks = progressRunnerArray(day.plan && day.plan.tasks);
  const taskValues = tasks.map(progressRunnerTaskValue).filter((value) => value !== null);
  const planRate = taskValues.length ? taskValues.reduce((sum, value) => sum + value, 0) / taskValues.length : null;
  const planExpected = taskValues.length
    ? tasks.filter((task) => progressRunnerTaskValue(task) !== null).reduce((sum, task) => sum + progressRunnerScheduleValue(task, options.nowMinutes), 0) / taskValues.length
    : null;
  const effectiveSeconds = Math.max(0, Number(day.effectiveSeconds) || 0);
  const rawTargetSeconds = Math.max(60, Number(day.targetSeconds) || 0);
  const useExecutionTarget = options.useExecutionTarget === true && Number(day.executionTargetSeconds) > 0;
  const targetSeconds = useExecutionTarget ? Math.max(60, Number(day.executionTargetSeconds) || 0) : rawTargetSeconds;
  const timeRate = progressRunnerClamp(effectiveSeconds / targetSeconds);
  const timeExpected = progressRunnerClamp((Number(options.nowMinutes) - 8 * 60) / (13 * 60 + 40));
  const hasReviewBudget = options.useReviewBudget === true && Number.isFinite(Number(day.reviewBudgetDue));
  const reviewDue = Math.max(0, Number(hasReviewBudget ? day.reviewBudgetDue : day.reviewDue) || 0);
  const reviewCompleted = Math.min(reviewDue, Math.max(0, Number(hasReviewBudget ? day.reviewBudgetCompleted : day.reviewCompleted) || 0));
  const reviewBacklog = hasReviewBudget ? Math.max(0, Number(day.reviewBacklog) || 0) : 0;
  const reviewRate = reviewDue ? reviewCompleted / reviewDue : null;
  const reviewTask = tasks.find((task) => task && task.category === "rollingReview") || null;
  const reviewExpected = reviewDue ? reviewTask ? progressRunnerScheduleValue(reviewTask, options.nowMinutes) : timeExpected : null;
  const components = [
    planRate === null ? null : { weight: 0.65, actual: planRate, expected: planExpected },
    { weight: 0.25, actual: timeRate, expected: timeExpected },
    reviewRate === null ? null : { weight: 0.10, actual: reviewRate, expected: reviewExpected },
  ].filter(Boolean);
  const weight = components.reduce((sum, component) => sum + component.weight, 0) || 1;
  const actual = components.reduce((sum, component) => sum + component.actual * component.weight, 0) / weight;
  const expected = components.reduce((sum, component) => sum + component.expected * component.weight, 0) / weight;
  const hasEvidence = effectiveSeconds > 0 || taskValues.some((value) => value > 0)
    || Boolean(day.historySaved) || Number(day.formalCount) > 0 || reviewCompleted > 0;
  return {
    actual, expected, hasEvidence, planRate, planExpected, timeRate, timeExpected, reviewRate, reviewExpected,
    effectiveSeconds, targetSeconds, rawTargetSeconds, targetMode: useExecutionTarget ? "execution" : "plan",
    taskCompleted: taskValues.reduce((sum, value) => sum + value, 0), taskPlanned: taskValues.length,
    reviewCompleted, reviewDue, reviewBacklog, reviewMode: hasReviewBudget ? "daily-budget" : "raw-due",
    formalCount: Math.max(0, Number(day.formalCount) || 0),
  };
}
function progressRunnerMedian(values) {
  const sorted = progressRunnerArray(values).filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function progressRunnerReason(model) {
  if (model.baselineDays < 3) return `再积累${3 - model.baselineDays}个有效学习日后判断个人速度；当前仍按计划时点显示位置。`;
  if (model.status === "behind") {
    if (model.planActual + 0.1 < model.planExpected) return "已到当前时点的正式任务推进偏少，先完成正在进行的一项。";
    if (model.timeActual + 0.1 < model.timeExpected) return "任务推进尚可，但有效学习时长落后于当前时点。";
    if (model.reviewDue > model.reviewCompleted) return `到期复盘尚有${model.reviewDue - model.reviewCompleted}项未清理，正在拖慢总体进度。`;
    if (model.formalCount === 0 && model.totalSeconds >= 3600) return "已有学习时间，但正式结果记录不足，进度证据偏弱。";
    return "当前累计进度低于计划位置，优先补最接近完成的一项。";
  }
  if (model.status === "ahead") return "正式任务与有效学习时间的累计推进快于当前计划位置。";
  return "当前累计进度与计划时点基本一致，保持现有节奏。";
}
function progressRunnerHasConcreteChapter(text) {
  const value = String(text || "").trim();
  return /第[一二三四五六七八九十百0-9]+(?:章|节|编|篇)|(?:章节|专题|知识块|模块)[：:\s]*[^；;，,。]{2,}|(?:真理观|价值观|唯物|辩证|认识论|历史观|剩余价值|资本|青年马克思|人物|著作)/.test(value);
}
function buildProgressRunnerPhaseTasks(overview = {}) {
  const current = progressRunnerObject(overview.current) ? overview.current : null;
  if (!current) return { configured: false, meta: "当前日期没有对应的阶段计划。", tasks: [] };
  const templates = progressRunnerObject(current.taskTemplates) ? current.taskTemplates : {};
  const explicit = progressRunnerObject(current.chapterTasks) ? current.chapterTasks : {};
  const criteria = progressRunnerObject(current.completionCriteria) ? current.completionCriteria : {};
  const definitions = [
    { key: "722", label: "722 章节" },
    { key: "844", label: "844 章节" },
    { key: "politics", label: "政治章节" },
    { key: "english", label: "英语阶段任务" },
  ];
  const tasks = definitions.map((definition) => {
    const explicitText = String(explicit[definition.key] || "").trim();
    const planText = String(templates[definition.key] || "").trim();
    const text = explicitText || planText;
    return {
      ...definition,
      text,
      criterion: String(criteria[definition.key] || "").trim(),
      concrete: Boolean(explicitText || progressRunnerHasConcreteChapter(planText)),
    };
  });
  const meta = [
    String(current.phaseName || "当前阶段").trim(),
    current.startDate && current.endDate ? `${current.startDate} 至 ${current.endDate}` : "",
  ].filter(Boolean).join(" · ");
  return {
    configured: tasks.some((task) => task.concrete),
    meta,
    tasks,
  };
}
function updateProgressRunnerPhaseChapterTasks(templates, dateKey, draft = {}) {
  const phases = progressRunnerArray(templates);
  const currentIndex = phases.findIndex((phase) => progressRunnerObject(phase)
    && String(phase.startDate || "") <= dateKey && String(phase.endDate || "") >= dateKey);
  if (currentIndex < 0) return { changed: false, error: "当前日期没有可编辑的阶段计划。", templates: phases };
  const keys = ["722", "844", "politics"];
  const normalized = {};
  for (const key of keys) {
    const value = String(draft[key] || "").trim();
    if (value.length > 240) return { changed: false, error: `${key}章节范围不能超过240字。`, templates: phases };
    if (value) normalized[key] = value;
  }
  if (!Object.keys(normalized).length) return { changed: false, error: "请至少填写一项真实章节范围。", templates: phases };
  const current = phases[currentIndex];
  const chapterTasks = { ...(progressRunnerObject(current.chapterTasks) ? current.chapterTasks : {}), ...normalized };
  const nextTemplates = phases.map((phase, index) => index === currentIndex ? { ...phase, chapterTasks } : phase);
  return { changed: true, error: "", templates: nextTemplates, phase: nextTemplates[currentIndex] };
}
function buildProgressRunnerModel(input = {}, period = "daily") {
  const dateKey = String(input.dateKey || progressRunnerDateKey(new Date()));
  const range = progressRunnerPeriodRange(period, dateKey);
  const firstDataDate = String(input.firstDataDate || "");
  const activeDates = range.dates.filter((date) => !firstDataDate || date >= firstDataDate);
  const divisor = Math.max(1, activeDates.length);
  const todayMinutes = Number.isFinite(Number(input.nowMinutes)) ? Number(input.nowMinutes) : 12 * 60;
  const dayFacts = activeDates.map((date) => {
    const relative = date < dateKey ? "past" : date > dateKey ? "future" : "today";
    const nowMinutes = relative === "past" ? 24 * 60 : relative === "future" ? 0 : todayMinutes;
    const facts = progressRunnerDayFacts(progressRunnerObject(input.days && input.days[date]) ? input.days[date] : {}, {
      nowMinutes,
      useReviewBudget: period === "daily" && relative === "today",
      useExecutionTarget: period === "daily" && relative === "today",
    });
    if (relative === "past") facts.expected = 1;
    if (relative === "future") facts.expected = 0;
    return { date, relative, ...facts };
  });
  const actual = dayFacts.reduce((sum, day) => sum + day.actual, 0) / divisor;
  const expected = dayFacts.reduce((sum, day) => sum + day.expected, 0) / divisor;
  const baselineStart = progressRunnerAddDays(dateKey, -28);
  const baselineDates = progressRunnerDates(baselineStart, progressRunnerAddDays(dateKey, -1));
  const baselineFacts = baselineDates.map((date) => ({ date, ...progressRunnerDayFacts(input.days && input.days[date] || {}, { nowMinutes: 24 * 60 }) })).filter((day) => day.hasEvidence);
  const baseline = progressRunnerMedian(baselineFacts.map((day) => day.actual));
  const baselineDays = new Set([
    ...baselineFacts.map((day) => day.date),
    ...dayFacts.filter((day) => day.hasEvidence).map((day) => day.date),
  ]).size;
  const gap = actual - expected;
  const status = baselineDays < 3 ? "insufficient" : gap >= 0.1 ? "ahead" : gap <= -0.1 ? "behind" : "on-track";
  const aggregate = (field) => dayFacts.reduce((sum, day) => sum + (Number(day[field]) || 0), 0);
  const plannedDays = dayFacts.filter((day) => day.planRate !== null);
  const planActual = plannedDays.length ? plannedDays.reduce((sum, day) => sum + day.planRate, 0) / plannedDays.length : 0;
  const planExpected = plannedDays.length ? plannedDays.reduce((sum, day) => sum + day.planExpected, 0) / plannedDays.length : 0;
  const totalSeconds = aggregate("effectiveSeconds");
  const targetSeconds = aggregate("targetSeconds");
  const actualPercent = Math.round(actual * 100);
  const expectedPercent = Math.round(expected * 100);
  const model = {
    period, range: { start: activeDates[0] || range.start, end: activeDates[activeDates.length - 1] || range.end },
    actualPercent, expectedPercent, gapPercent: actualPercent - expectedPercent,
    status, baselineDays, baselinePercent: baseline === null ? null : Math.round(baseline * 100),
    effectiveDays: dayFacts.filter((day) => day.hasEvidence).length,
    planActual, planExpected, totalSeconds, targetSeconds,
    timeActual: targetSeconds ? progressRunnerClamp(totalSeconds / targetSeconds) : 0,
    timeExpected: dayFacts.reduce((sum, day) => sum + day.timeExpected, 0) / divisor,
    taskCompleted: aggregate("taskCompleted"), taskPlanned: aggregate("taskPlanned"),
    reviewCompleted: aggregate("reviewCompleted"), reviewDue: aggregate("reviewDue"), reviewBacklog: aggregate("reviewBacklog"),
    reviewMode: period === "daily" ? dayFacts.find((day) => day.relative === "today")?.reviewMode || "raw-due" : "raw-due",
    targetMode: period === "daily" ? dayFacts.find((day) => day.relative === "today")?.targetMode || "plan" : "plan",
    formalCount: aggregate("formalCount"),
  };
  model.reason = progressRunnerReason(model);
  return model;
}
