// Daily learning records and backward-compatible history rendering.
function readHistory() {
  const history = readJson(historyKey, []);
  return Array.isArray(history) ? history : [];
}

function writeHistory(history) {
  writeJson(historyKey, history);
}

let dailyAiReviewRequestInFlight = false;
let aiTomorrowPlanRequestInFlight = false;
let pendingAiTomorrowPlan = null;
let aiRollingWeekRequestInFlight = false;
let pendingAiRollingWeekPlan = null;

function readReviewTaskText(value, preferredFields = []) {
  if (typeof readTaskText === "function") return readTaskText(value, preferredFields);
  if (typeof value === "string") {
    const text = value.trim();
    return /^\[object\s+[^\]]+\]$/i.test(text) ? "" : text;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map((item) => readReviewTaskText(item, preferredFields)).filter(Boolean).join("；");
  if (!value || typeof value !== "object") return "";
  const fields = [...new Set([...preferredFields, "nextStart", "action", "description", "minimumOutput", "text", "label"])];
  for (const field of fields) {
    const text = readReviewTaskText(value[field]);
    if (text) return text;
  }
  return "";
}

function buildDailyAiReviewData(record = {}) {
  const tasks = Array.isArray(record.tasks) ? record.tasks : [];
  return {
    date: String(record.date || ""),
    completion: {
      rate: Math.max(0, Number(record.completionRate) || 0),
      done: Math.max(0, Number(record.completionDone) || 0),
      total: Math.max(0, Number(record.completionTotal) || 0),
    },
    completedToday: String(record.completedToday || ""),
    unfinishedToday: String(record.unfinishedToday || ""),
    delayedTasks: String(record.delayedTasks || ""),
    learnedToday: String(record.learnedToday || ""),
    tomorrowPriority: String(record.tomorrowPriority || ""),
    studyTime: {
      totalSeconds: Math.max(0, Number(record.totalStudySeconds) || 0),
      focusSeconds: Math.max(0, Number(record.totalFocusSeconds) || 0),
      targetSeconds: Math.max(0, Number(record.executionTargetSeconds ?? record.dailyStudyTargetSeconds) || 0),
      planTargetSeconds: Math.max(0, Number(record.planStudyTargetSeconds ?? record.dailyStudyTargetSeconds) || 0),
      targetSource: String(record.executionTargetSource || "legacy"),
      targetSourceLabel: String(record.executionTargetSourceLabel || "旧记录未注明"),
      targetEvidence: record.executionTargetEvidence && typeof record.executionTargetEvidence === "object"
        ? { ...record.executionTargetEvidence } : null,
    },
    tasks: tasks.filter(isDashboardCloseoutTask).map((task) => ({
      name: String(task && task.name || ""),
      status: String(task && task.status || ""),
      completed: task && task.completed === true,
      focusSeconds: Math.max(0, Number(task && task.focusSeconds) || 0),
    })),
    professionalProgress: record.professionalProgress && typeof record.professionalProgress === "object"
      ? record.professionalProgress : {},
    reviewsCompleted: Array.isArray(record.reviewsCompleted) ? record.reviewsCompleted : [],
    reviewsDueNextDay: Array.isArray(record.reviewsDueNextDay) ? record.reviewsDueNextDay : [],
  };
}

function canonicalizeDailyEvidence(value) {
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : canonicalizeDailyEvidence(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalizeDailyEvidence(value[key]);
      return result;
    }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

function buildDailyRecordEvidenceFingerprint(record = {}) {
  const source = JSON.stringify(canonicalizeDailyEvidence(buildDailyAiReviewData(record)));
  let first = 2166136261;
  let second = 2654435761;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 2246822519);
  }
  return `daily-evidence-v1-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function matchesDailyRecordEvidence(record, expectedEvidenceFingerprint) {
  return Boolean(record && expectedEvidenceFingerprint
    && buildDailyRecordEvidenceFingerprint(record) === expectedEvidenceFingerprint);
}

function getDailyAiReviewEvidenceState(record = {}) {
  const review = record.aiReview && typeof record.aiReview === "object" ? record.aiReview : null;
  if (!review) return "missing";
  const sourceFingerprint = String(review.sourceEvidenceFingerprint || "");
  if (!sourceFingerprint) return "unknown";
  return matchesDailyRecordEvidence(record, sourceFingerprint) ? "current" : "stale";
}

function getTodayAiReviewRecord() {
  return readHistory().find((record) => record && record.date === getDateKey()) || null;
}

function renderDailyAiReview() {
  const card = document.querySelector("#dailyAiReview");
  const content = document.querySelector("#dailyAiReviewContent");
  const meta = document.querySelector("#dailyAiReviewMeta");
  if (!card || !content || !meta) return;
  const record = getTodayAiReviewRecord();
  const review = record && record.aiReview && typeof record.aiReview === "object" ? record.aiReview : null;
  const advice = String(review && review.content || "").trim();
  const evidenceState = record ? getDailyAiReviewEvidenceState(record) : "missing";
  card.hidden = !record;
  content.textContent = advice || "今日记录已保存，点击“生成评价”即可获取 DeepSeek 的评价和明日建议。";
  content.classList.toggle("is-empty", !advice);
  if (!advice) {
    meta.textContent = "只发送当天已保存的学习事实，不发送其他历史记录。";
    return;
  }
  const generatedAt = new Date(review.generatedAt || "");
  const generatedText = Number.isNaN(generatedAt.getTime()) ? "" : generatedAt.toLocaleString("zh-CN", { hour12: false });
  const evidenceText = evidenceState === "current"
    ? "依据当前正式记录"
    : evidenceState === "stale" ? "依据已过期，请重新生成" : "历史评价，依据版本未记录";
  meta.textContent = ["DeepSeek", generatedText, evidenceText].filter(Boolean).join(" · ");
}

function saveDailyAiReview(date, result, expectedEvidenceFingerprint) {
  const history = readHistory();
  const index = history.findIndex((record) => record && record.date === date);
  if (index < 0) return false;
  if (!matchesDailyRecordEvidence(history[index], expectedEvidenceFingerprint)) return false;
  history[index] = {
    ...history[index],
    aiReview: {
      provider: "deepseek",
      content: String(result.content || result.advice || "").trim(),
      mode: String(result.mode || "concise"),
      generatedAt: new Date().toISOString(),
      sourceEvidenceFingerprint: expectedEvidenceFingerprint,
    },
  };
  writeHistory(history);
  renderDailyAiReview();
  renderHistory();
  return true;
}

async function requestDailyAiReview() {
  if (dailyAiReviewRequestInFlight) return false;
  const record = getTodayAiReviewRecord();
  if (!record) {
    setStatus("#dailyAiReviewStatus", "请先保存今日学习记录。", true);
    return false;
  }
  const button = document.querySelector("#regenerateDailyAiReviewBtn");
  const card = document.querySelector("#dailyAiReview");
  const expectedEvidenceFingerprint = buildDailyRecordEvidenceFingerprint(record);
  dailyAiReviewRequestInFlight = true;
  if (card) card.hidden = false;
  if (button) button.disabled = true;
  setStatus("#dailyAiReviewStatus", "正在根据今日记录生成评价……");
  try {
    const response = await fetch("/api/ai-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "concise", reviewData: buildDailyAiReviewData(record) }),
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok || result.ok !== true) {
      throw new Error(String(result.error || `DeepSeek 请求失败（${response.status}）`).slice(0, 300));
    }
    if (!String(result.content || result.advice || "").trim()) throw new Error("DeepSeek 未返回评价内容。");
    if (!saveDailyAiReview(record.date, result, expectedEvidenceFingerprint)) {
      throw new Error("生成期间今日记录已发生变化；旧评价未写入，请基于最新记录重新生成。");
    }
    setStatus("#dailyAiReviewStatus", "评价已生成并保存到今日历史记录。", false);
    return true;
  } catch (error) {
    setStatus("#dailyAiReviewStatus", error.message || "AI评价生成失败，请稍后重试。", true);
    return false;
  } finally {
    dailyAiReviewRequestInFlight = false;
    if (button) button.disabled = false;
  }
}

function getTomorrowPlanContext(todayRecord = {}) {
  const todayDate = getDateKey();
  const tomorrowDate = addLocalPlanDays(todayDate, 1);
  const plans = readDailyPlans();
  const savedPlan = plans[tomorrowDate];
  const existingPlan = savedPlan && Array.isArray(savedPlan.tasks)
    ? JSON.parse(JSON.stringify(savedPlan))
    : createInitialTodayPlan(parseLocalPlanDate(tomorrowDate));
  const importedPlan = readJson(importedPlanKey, {});
  const sourceStatus = getAiTomorrowPlanSourceStatus(existingPlan, importedPlan, tomorrowDate);
  const rawTasks = Array.isArray(existingPlan.tasks) ? existingPlan.tasks : [];
  const availableTasks = buildAiTomorrowTaskCandidates(existingPlan, todayRecord).map((available) => {
    const task = rawTasks.find((item) => getAiPlanTaskSourceKey(item) === available.sourceTaskKey) || {};
    const exactStart = typeof getTaskExactStartAction === "function" ? getTaskExactStartAction(task) : "";
    return { ...available, nextStart: String(exactStart || available.nextStart || available.description || "").trim() };
  });
  return { todayDate, tomorrowDate, plans, plansJson: JSON.stringify(plans), existingPlan, availableTasks, sourceStatus };
}

function buildAiTomorrowPlanData() {
  const todayRecord = getTodayAiReviewRecord();
  if (!todayRecord) throw new Error("请先保存今日学习记录。");
  const context = getTomorrowPlanContext(todayRecord);
  if (!context.sourceStatus.ready) throw new Error(context.sourceStatus.message);
  const reviewsDueTomorrow = (Array.isArray(todayRecord.reviewsDueNextDay) ? todayRecord.reviewsDueNextDay : []).map((review) => ({
    reviewId: String(review && (review.reviewId || review.id) || ""),
    subject: String(review && (review.subject || review.category) || ""),
    name: String(typeof review === "string" ? review : review && (review.name || review.title || review.unitName) || ""),
    dueDate: String(review && (review.dueDate || review.date) || ""),
    reviewType: String(review && (review.reviewType || review.interval) || ""),
  }));
  return {
    ...context,
    todayEvidenceFingerprint: buildDailyRecordEvidenceFingerprint(todayRecord),
    planData: {
      todayDate: context.todayDate,
      tomorrowDate: context.tomorrowDate,
      planSource: context.sourceStatus,
      todayReview: buildDailyAiReviewData(todayRecord),
      reviewsDueTomorrow,
      recentAiPlanExecution: buildRecentAiPlanExecution(readHistory(), 3),
      targetEffectiveStudyHours: Math.max(0, Number(context.existingPlan.targetEffectiveStudyHours) || 0),
      dailyStudyTargetSeconds: Math.max(0, Number(todayRecord.dailyStudyTargetSeconds) || 0),
      availableTasks: context.availableTasks,
    },
  };
}

function renderAiTomorrowPlanSource(todayRecord = null) {
  const panel = document.querySelector("#aiTomorrowPlanSource");
  const badge = document.querySelector("#aiTomorrowPlanSourceBadge");
  const name = document.querySelector("#aiTomorrowPlanSourceName");
  const meta = document.querySelector("#aiTomorrowPlanSourceMeta");
  const message = document.querySelector("#aiTomorrowPlanSourceMessage");
  const importButton = document.querySelector("#aiTomorrowImportSourceBtn");
  if (!panel || !badge || !name || !meta || !message || !importButton) return null;
  const context = getTomorrowPlanContext(todayRecord || {});
  const source = context.sourceStatus;
  panel.classList.toggle("is-missing", !source.ready);
  badge.textContent = source.ready ? "原计划已核验" : "原计划未核验";
  name.textContent = source.sourceLabel;
  let importedText = "尚无可信导入记录";
  if (source.importedAt) {
    const importedAt = new Date(source.importedAt);
    importedText = Number.isNaN(importedAt.getTime()) ? source.importedAt : importedAt.toLocaleString("zh-CN", { hour12: false });
  }
  meta.textContent = `${context.tomorrowDate} · ${source.planType || "无来源类型"} · 导入时间：${importedText}`;
  message.textContent = source.message;
  importButton.hidden = source.ready || !source.canImportBuiltIn;
  return source;
}

function appendAiTomorrowPlanTasks(list, tasks, names, protectedKeys = new Map()) {
  tasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = "ai-tomorrow-plan-item";
    const heading = document.createElement("div");
    heading.className = "ai-tomorrow-plan-item-heading";
    const title = document.createElement("strong");
    title.textContent = `${task.time} · ${names.get(task.sourceTaskKey) || task.sourceTaskKey}`;
    heading.appendChild(title);
    const badges = document.createElement("div");
    badges.className = "ai-plan-item-badges";
    const basisBadge = document.createElement("span");
    const knownBasis = task.basis === "today-carryover" || task.basis === "original-plan";
    basisBadge.className = `ai-plan-basis-badge${task.basis === "today-carryover" ? " is-carryover" : knownBasis ? "" : " is-unknown"}`;
    basisBadge.textContent = task.basis === "today-carryover" ? "今日未完成顺延" : task.basis === "original-plan" ? "按原计划推进" : "来源未记录";
    badges.appendChild(basisBadge);
    if (protectedKeys.has(task.sourceTaskKey)) {
      const badge = document.createElement("span");
      badge.className = "ai-plan-protected-badge";
      badge.textContent = `保留原计划：${protectedKeys.get(task.sourceTaskKey)}`;
      badges.appendChild(badge);
      item.classList.add("is-protected");
    }
    heading.appendChild(badges);
    const description = document.createElement("p");
    description.textContent = task.description;
    const start = document.createElement("p");
    start.className = "muted";
    start.textContent = `准确起点：${task.nextStart}`;
    const criteria = document.createElement("p");
    criteria.className = "muted";
    criteria.textContent = `最低完成证据：${task.completionCriteria}`;
    item.append(heading, description, start, criteria);
    if (task.fallback) {
      const fallback = document.createElement("p");
      fallback.className = "muted";
      fallback.textContent = `时间不足：${task.fallback}`;
      item.appendChild(fallback);
    }
    list.appendChild(item);
  });
}

function renderAiTomorrowPlanPreview() {
  const card = document.querySelector("#aiTomorrowPlan");
  const list = document.querySelector("#aiTomorrowPlanList");
  const summary = document.querySelector("#aiTomorrowPlanSummary");
  const conflicts = document.querySelector("#aiTomorrowPlanConflicts");
  const applyButton = document.querySelector("#applyAiTomorrowPlanBtn");
  if (!card || !list || !summary || !conflicts || !applyButton) return;
  const todayRecord = getTodayAiReviewRecord();
  card.hidden = !todayRecord;
  renderAiTomorrowPlanSource(todayRecord);
  list.replaceChildren();
  conflicts.replaceChildren();
  if (!pendingAiTomorrowPlan) {
    const storedContext = getTomorrowPlanContext(todayRecord || {});
    const storedPlan = storedContext.existingPlan || {};
    const storedAiPlan = storedPlan.aiTomorrowPlan && typeof storedPlan.aiTomorrowPlan === "object" ? storedPlan.aiTomorrowPlan : null;
    const storedTasks = (Array.isArray(storedPlan.tasks) ? storedPlan.tasks : []).filter((task) => task && task.aiPlanned === true).map((task) => ({
      sourceTaskKey: getAiPlanTaskSourceKey(task),
      basis: ["today-carryover", "original-plan"].includes(task.aiPlanBasis) ? task.aiPlanBasis : "",
      time: readReviewTaskText(task.time),
      description: readReviewTaskText(task.description, ["description", "minimumOutput", "text"]),
      nextStart: readReviewTaskText(task.nextStart || task.description, ["nextStart", "action", "description"]),
      completionCriteria: readReviewTaskText(task.completionCriteria || task.minimum, ["completionCriteria", "minimumOutput", "description"]),
      fallback: readReviewTaskText(task.fallbackPlan || task.fallback, ["fallback", "description", "text"]),
      name: readReviewTaskText(task.name || task.subject || getAiPlanTaskSourceKey(task)),
    })).filter((task) => task.sourceTaskKey);
    if (todayRecord && storedAiPlan && storedTasks.length) {
      summary.textContent = `${String(storedAiPlan.summary || "已生成并应用AI明日计划")}（已应用到 ${storedPlan.date || storedContext.tomorrowDate}）`;
      appendAiTomorrowPlanTasks(list, storedTasks, new Map(storedTasks.map((task) => [task.sourceTaskKey, task.name])));
      applyButton.hidden = true;
      return;
    }
    summary.textContent = todayRecord
      ? "保存每日记录后会自动生成并导入明日计划；人工编辑和已有执行状态仍会保留。"
      : "请先保存今日学习记录。";
    applyButton.hidden = true;
    return;
  }
  const { plan, preview, availableTasks, applied } = pendingAiTomorrowPlan;
  const names = new Map(availableTasks.map((task) => [task.sourceTaskKey, task.name]));
  const protectedKeys = new Map(preview.protectedTasks.map((task) => [task.sourceTaskKey, task.reason]));
  summary.textContent = plan.summary || `已生成 ${plan.tasks.length} 个任务块，请核对后再应用。`;
  appendAiTomorrowPlanTasks(list, plan.tasks, names, protectedKeys);
  if (preview.protectedTasks.length) {
    const note = document.createElement("p");
    note.textContent = `${preview.protectedTasks.length} 个已有人工编辑或执行状态的任务将保持原样。`;
    conflicts.appendChild(note);
  }
  applyButton.hidden = Boolean(applied);
  applyButton.disabled = preview.updated.length === 0;
}

function renderAiPlanCalibration() {
  const panel = document.querySelector("#aiPlanCalibration");
  const facts = document.querySelector("#aiPlanCalibrationFacts");
  const time = document.querySelector("#aiPlanCalibrationTime");
  if (!panel || !facts || !time || typeof getTodayPlan !== "function") return;
  const plan = getTodayPlan();
  const date = getDateKey();
  const tasks = (Array.isArray(plan.tasks) ? plan.tasks : []).map((task) => ({
    ...task,
    focusSeconds: typeof getTaskFocusSeconds === "function" ? getTaskFocusSeconds(date, task.id) : Number(task.focusSeconds) || 0,
  }));
  const summary = summarizeAiPlanExecution({ date, aiTomorrowPlan: plan.aiTomorrowPlan, tasks });
  panel.hidden = !summary;
  if (!summary) return;
  facts.textContent = `AI安排 ${summary.plannedTaskCount} 项 · 正式完成 ${summary.completedCount} · 已开始未完成 ${summary.startedWithoutCompletionCount} · 未开始 ${summary.notStartedCount}`;
  time.textContent = `计划任务 ${summary.totalPlannedMinutes} 分钟 · 已跟踪专注 ${formatFocusDuration(summary.trackedFocusSeconds)}。专注记录不等于全部学习，也不代表掌握程度。`;
}

async function requestAiTomorrowPlan() {
  if (aiTomorrowPlanRequestInFlight) return false;
  let context;
  try {
    context = buildAiTomorrowPlanData();
  } catch (error) {
    setStatus("#aiTomorrowPlanStatus", error.message || "无法生成明日计划。", true);
    return false;
  }
  const card = document.querySelector("#aiTomorrowPlan");
  const button = document.querySelector("#regenerateAiTomorrowPlanBtn");
  aiTomorrowPlanRequestInFlight = true;
  pendingAiTomorrowPlan = null;
  if (card) card.hidden = false;
  if (button) button.disabled = true;
  renderAiTomorrowPlanPreview();
  setStatus("#aiTomorrowPlanStatus", "正在结合今日进度和明日任务生成计划……");
  try {
    const response = await fetch("/api/ai-tomorrow-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planData: context.planData }),
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok || result.ok !== true) {
      throw new Error(String(result.error || `DeepSeek 请求失败（${response.status}）`).slice(0, 300));
    }
    const plan = normalizeAiTomorrowPlan(result.plan, {
      expectedDate: context.tomorrowDate,
      availableTasks: context.availableTasks,
      hasDueReviews: context.planData.reviewsDueTomorrow.length > 0,
    });
    const generatedAt = new Date().toISOString();
    const sourceEvidence = { recordDate: context.todayDate, fingerprint: context.todayEvidenceFingerprint };
    const preview = mergeAiTomorrowPlan(context.existingPlan, plan, { generatedAt, planSource: context.sourceStatus, sourceEvidence });
    pendingAiTomorrowPlan = {
      targetDate: context.tomorrowDate,
      baselinePlansJson: context.plansJson,
      existingPlan: context.existingPlan,
      availableTasks: context.availableTasks,
      plan,
      preview,
      generatedAt,
      sourceStatus: context.sourceStatus,
      sourceEvidence,
      hasDueReviews: context.planData.reviewsDueTomorrow.length > 0,
      applied: false,
    };
    renderAiTomorrowPlanPreview();
    const applied = applyAiTomorrowPlan();
    if (!applied) return false;
    return true;
  } catch (error) {
    pendingAiTomorrowPlan = null;
    renderAiTomorrowPlanPreview();
    setStatus("#aiTomorrowPlanStatus", error.message || "AI明日计划生成失败，请稍后重试。", true);
    return false;
  } finally {
    aiTomorrowPlanRequestInFlight = false;
    if (button) button.disabled = false;
  }
}

function applyAiTomorrowPlan() {
  if (!pendingAiTomorrowPlan || pendingAiTomorrowPlan.applied) return false;
  const currentPlans = readDailyPlans();
  if (JSON.stringify(currentPlans) !== pendingAiTomorrowPlan.baselinePlansJson) {
    setStatus("#aiTomorrowPlanStatus", "预览期间计划已发生变化。为保护手动修改，请重新生成后再应用。", true);
    return false;
  }
  const latestTodayRecord = getTodayAiReviewRecord();
  const expectedEvidenceFingerprint = String(pendingAiTomorrowPlan.sourceEvidence?.fingerprint || "");
  if (!matchesDailyRecordEvidence(latestTodayRecord, expectedEvidenceFingerprint)) {
    setStatus("#aiTomorrowPlanStatus", "生成期间今日记录已发生变化。为确保计划依据最新，请重新生成后再应用。", true);
    return false;
  }
  const revalidated = normalizeAiTomorrowPlan(pendingAiTomorrowPlan.plan, {
    expectedDate: pendingAiTomorrowPlan.targetDate,
    availableTasks: pendingAiTomorrowPlan.availableTasks,
    hasDueReviews: pendingAiTomorrowPlan.hasDueReviews,
  });
  const preview = mergeAiTomorrowPlan(pendingAiTomorrowPlan.existingPlan, revalidated, {
    generatedAt: pendingAiTomorrowPlan.generatedAt,
    planSource: pendingAiTomorrowPlan.sourceStatus,
    sourceEvidence: pendingAiTomorrowPlan.sourceEvidence,
  });
  if (!preview.updated.length) {
    setStatus("#aiTomorrowPlanStatus", "现有任务均受保护，没有可应用的AI计划项。", true);
    return false;
  }
  currentPlans[pendingAiTomorrowPlan.targetDate] = preview.day;
  writeJson(dailyPlansKey, currentPlans);
  pendingAiTomorrowPlan.preview = preview;
  pendingAiTomorrowPlan.applied = true;
  pendingAiTomorrowPlan.baselinePlansJson = JSON.stringify(currentPlans);
  renderAiTomorrowPlanPreview();
  setStatus("#aiTomorrowPlanStatus", `已应用到 ${pendingAiTomorrowPlan.targetDate}；${preview.protectedTasks.length} 个受保护任务保持原样。`);
  return true;
}

function buildAiRollingWeekPlanData() {
  const todayRecord = getTodayAiReviewRecord();
  if (!todayRecord) throw new Error("请先保存今日学习记录。");
  const history = readHistory();
  const context = buildAiRollingWeekPlanContext({
    todayDate: getDateKey(),
    importedPlan: readJson(importedPlanKey, {}),
    phaseTemplates: readJson(planPhaseTemplatesKey, []),
    plans: readDailyPlans(),
    professionalStore: readJson(professionalResultsKey, {}),
    reviewQueue: typeof normalizeReviewQueueRecords === "function"
      ? normalizeReviewQueueRecords(readJson(reviewQueueKey, [])) : readJson(reviewQueueKey, []),
    history,
  });
  return {
    context,
    plansJson: JSON.stringify(readDailyPlans()),
    planData: {
      schemaVersion: 1,
      startDate: context.startDate,
      endDate: context.endDate,
      sourcePlan: context.sourcePlan,
      capacityCalibration: context.capacityCalibration,
      recentAiPlanExecution: buildRecentAiPlanExecution(history, 3),
      days: context.days.map((day) => ({
        date: day.date,
        phaseId: day.phaseId,
        phaseName: day.phaseName,
        phaseGoal: day.phaseGoal,
        phaseAcceptance: day.phaseAcceptance,
        targetEffectiveStudyHours: day.targetEffectiveStudyHours,
        reviewsDue: day.reviewsDue,
        requiredTaskKeys: day.requiredTaskKeys,
        maxPlannedMinutes: day.maxPlannedMinutes,
        availableTasks: day.availableTasks,
      })),
    },
  };
}

function renderAiRollingWeekPlanPreview() {
  const card = document.querySelector("#aiRollingWeekPlan");
  const range = document.querySelector("#aiRollingWeekRange");
  const list = document.querySelector("#aiRollingWeekList");
  const calibration = document.querySelector("#aiRollingWeekCalibration");
  const applyButton = document.querySelector("#applyAiRollingWeekBtn");
  if (!card || !range || !list || !calibration || !applyButton) return;
  card.hidden = !getTodayAiReviewRecord();
  list.replaceChildren();
  applyButton.hidden = true;
  if (!pendingAiRollingWeekPlan) {
    const imported = readJson(importedPlanKey, {});
    const end = String(imported.detailedPlanEnd || "");
    range.textContent = end
      ? `当前逐日计划至 ${end}。生成下一轮计划后先预览，不会自动写入。`
      : "请先导入总控计划。";
    calibration.textContent = "生成时会用近7日真实学习时长和正式任务完成数校准强度；少于3个有效日时不判断速度。";
    return;
  }
  const { plan, preview, applied } = pendingAiRollingWeekPlan;
  const capacity = pendingAiRollingWeekPlan.context.capacityCalibration;
  range.textContent = `${plan.startDate}—${plan.endDate} · ${plan.summary || "按阶段任务与真实停点续接"}`;
  const completionText = Number.isFinite(capacity.weightedCompletionRate) ? `，正式任务加权完成率${capacity.weightedCompletionRate}%` : "";
  const evidenceAuditText = `采用${capacity.evidenceDays}日 · 排除${Math.max(0, Number(capacity.excludedDays) || 0)}日`;
  calibration.textContent = capacity.status === "calibrated"
    ? `强度依据：近7日${evidenceAuditText}，中位有效学习${capacity.medianStudyMinutes}分钟${completionText}；每日计划不超过${capacity.recommendedMaxMinutes}分钟。时长与完成数不代表掌握程度。`
    : `${capacity.message} 时长与完成数只用于执行强度，不代表掌握程度。`;
  plan.days.forEach((day) => {
    const section = document.createElement("section");
    section.className = "ai-rolling-week-day";
    const title = document.createElement("h4");
    const sourceDay = pendingAiRollingWeekPlan.context.days.find((item) => item.date === day.date);
    const plannedMinutes = day.tasks.reduce((sum, task) => {
      const range = parseAiPlanTimeRange(task.time);
      return sum + (range ? range.minutes : 0);
    }, 0);
    title.textContent = `${day.date} · ${day.phaseName} · 计划${plannedMinutes}分钟 / 上限${sourceDay && sourceDay.maxPlannedMinutes || "未记录"}分钟`;
    const taskList = document.createElement("ul");
    day.tasks.forEach((task) => {
      const item = document.createElement("li");
      item.textContent = `${task.time} · ${task.description}`;
      taskList.appendChild(item);
    });
    section.append(title, taskList);
    list.appendChild(section);
  });
  if (preview.protectedTasks.length) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = `${preview.protectedTasks.length} 个已有人工编辑或执行状态的任务将在导入时保持原样。`;
    list.appendChild(note);
  }
  applyButton.hidden = Boolean(applied);
  applyButton.disabled = preview.updated.length === 0;
}

async function requestAiRollingWeekPlan() {
  if (aiRollingWeekRequestInFlight) return false;
  let requestContext;
  try {
    requestContext = buildAiRollingWeekPlanData();
  } catch (error) {
    setStatus("#aiRollingWeekStatus", error.message || "无法生成下一轮7日计划。", true);
    return false;
  }
  const button = document.querySelector("#generateAiRollingWeekBtn");
  aiRollingWeekRequestInFlight = true;
  pendingAiRollingWeekPlan = null;
  if (button) button.disabled = true;
  renderAiRollingWeekPlanPreview();
  setStatus("#aiRollingWeekStatus", "正在按阶段范围和真实进度编排未来7天……");
  try {
    const response = await fetch("/api/ai-week-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planData: requestContext.planData }),
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok || result.ok !== true) throw new Error(String(result.error || `DeepSeek 请求失败（${response.status}）`).slice(0, 300));
    const plan = normalizeAiRollingWeekPlan(result.plan, requestContext.context);
    const generatedAt = new Date().toISOString();
    const preview = mergeAiRollingWeekPlan(readDailyPlans(), plan, requestContext.context, { generatedAt });
    pendingAiRollingWeekPlan = {
      plan,
      context: requestContext.context,
      baselinePlansJson: requestContext.plansJson,
      generatedAt,
      preview,
      applied: false,
    };
    renderAiRollingWeekPlanPreview();
    setStatus("#aiRollingWeekStatus", "7日计划已生成，请核对后点击“确认导入7日计划”。");
    return true;
  } catch (error) {
    setStatus("#aiRollingWeekStatus", error.message || "AI滚动计划生成失败，请稍后重试。", true);
    return false;
  } finally {
    aiRollingWeekRequestInFlight = false;
    if (button) button.disabled = false;
  }
}

function applyAiRollingWeekPlan() {
  if (!pendingAiRollingWeekPlan || pendingAiRollingWeekPlan.applied) return false;
  const currentPlans = readDailyPlans();
  if (JSON.stringify(currentPlans) !== pendingAiRollingWeekPlan.baselinePlansJson) {
    setStatus("#aiRollingWeekStatus", "预览期间计划已变化。为保护本地修改，请重新生成。", true);
    return false;
  }
  const plan = normalizeAiRollingWeekPlan(pendingAiRollingWeekPlan.plan, pendingAiRollingWeekPlan.context);
  const preview = mergeAiRollingWeekPlan(currentPlans, plan, pendingAiRollingWeekPlan.context, {
    generatedAt: pendingAiRollingWeekPlan.generatedAt,
  });
  const snapshot = readRawStorageSnapshot();
  applyStorageSnapshotTransaction({
    ...snapshot,
    [dailyPlansKey]: JSON.stringify(preview.dailyPlans),
    [importedPlanKey]: JSON.stringify(preview.metadata),
  }, "ai-rolling-week-import-v1", false);
  pendingAiRollingWeekPlan.preview = preview;
  pendingAiRollingWeekPlan.applied = true;
  pendingAiRollingWeekPlan.baselinePlansJson = JSON.stringify(preview.dailyPlans);
  renderTasks();
  renderRecentSevenDays();
  renderAiTomorrowPlanPreview();
  renderAiRollingWeekPlanPreview();
  setStatus("#aiRollingWeekStatus", `已导入 ${plan.startDate} 至 ${plan.endDate}；${preview.protectedTasks.length} 个受保护任务保持原样。`);
  return true;
}

function isDashboardCloseoutTask(task) {
  if (!task || String(task.category || "") === "rollingReview") return false;
  return task.counted === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && task.exercise !== true);
}

function buildDailyCloseoutSummary(snapshot = {}, todayRecord = null, dailyTasks = null) {
  const taskGroups = snapshot && snapshot.tasks && typeof snapshot.tasks === "object" ? snapshot.tasks : {};
  let completed = Array.isArray(taskGroups.completed) ? taskGroups.completed : [];
  let unfinished = ["partial", "inProgress", "unfinished"]
    .flatMap((key) => Array.isArray(taskGroups[key]) ? taskGroups[key] : []);
  if (Array.isArray(dailyTasks)) {
    const learningTasks = dailyTasks.filter(isDashboardCloseoutTask);
    completed = learningTasks.filter((task) => task.status === "completed" || task.completed === true);
    unfinished = learningTasks.filter((task) => !(task.status === "completed" || task.completed === true));
  }
  const taskTitle = (task) => String(task && (task.title || task.name) || "").trim();
  const professional = snapshot && snapshot.professionalProgress && typeof snapshot.professionalProgress === "object"
    ? snapshot.professionalProgress : {};
  const professionalCount = ["722", "844"].reduce((sum, subject) => {
    const actualUnits = professional[subject] && professional[subject].actualUnits;
    return sum + (Array.isArray(actualUnits) ? actualUnits.length : 0);
  }, 0);
  const englishReadingCount = snapshot && snapshot.english && Array.isArray(snapshot.english.reading) ? snapshot.english.reading.length : 0;
  const politicsCount = Array.isArray(snapshot && snapshot.politics) ? snapshot.politics.length : 0;
  const outputCount = Array.isArray(snapshot && snapshot.outputs) ? snapshot.outputs.length : 0;
  const reviewsCompleted = snapshot && snapshot.reviews && Array.isArray(snapshot.reviews.completedToday)
    ? snapshot.reviews.completedToday.length : 0;
  return {
    effectiveStudySeconds: Math.max(0, Math.floor(Number(snapshot && snapshot.effectiveStudySeconds) || 0)),
    completedNames: [...new Set(completed.map(taskTitle).filter(Boolean))],
    unfinishedNames: [...new Set(unfinished.map(taskTitle).filter(Boolean))],
    professionalCount,
    englishReadingCount,
    politicsCount,
    outputCount,
    formalResultCount: professionalCount + englishReadingCount + politicsCount + outputCount,
    reviewsCompleted,
    saved: Boolean(todayRecord),
  };
}

function buildDailyCloseoutSuggestion(summary = {}, tasks = [], options = {}) {
  const facts = [
    Number(summary.professionalCount) > 0 ? `专业课验收${Number(summary.professionalCount)}项` : "",
    Number(summary.englishReadingCount) > 0 ? `英语阅读${Number(summary.englishReadingCount)}项` : "",
    Number(summary.politicsCount) > 0 ? `政治结果${Number(summary.politicsCount)}项` : "",
    Number(summary.outputCount) > 0 ? `闭卷输出${Number(summary.outputCount)}项` : "",
    summary.closedBookProductSaved ? "今日闭卷产物已保存" : "",
  ].filter(Boolean);
  const executionTasks = (Array.isArray(tasks) ? tasks : []).filter(isDashboardCloseoutTask);
  const unfinishedTasks = executionTasks.filter((task) => {
    const status = String(task && task.status || "");
    return task && task.completed !== true && !["completed", "skipped", "cancelled"].includes(status);
  });
  const currentTaskId = String(options.currentTaskId || "");
  const guidance = options.guidance && typeof options.guidance === "object" ? options.guidance : null;
  const guidanceAction = String(guidance && guidance.action || "").trim();
  const guidanceTaskId = String(guidance && guidance.taskId || "").trim();
  const guidanceTask = guidanceTaskId
    ? unfinishedTasks.find((task) => String(task.id || "") === guidanceTaskId) || null
    : null;
  const nextTask = guidanceAction ? guidanceTask : unfinishedTasks.find((task) => String(task.id || "") === currentTaskId)
    || unfinishedTasks.find((task) => task.status === "in-progress")
    || unfinishedTasks[0]
    || null;
  const fallbackGap = String(guidanceAction && guidance && guidance.label || nextTask && nextTask.name || "").trim()
    || (Array.isArray(summary.unfinishedNames) ? summary.unfinishedNames : [])[0]
    || "";
  const outcome = facts.length
    ? `今日已保存：${facts.join("、")}`
    : fallbackGap ? `今日卡点：${fallbackGap}尚未完成` : "";
  const startAction = nextTask && typeof options.getStartAction === "function"
    ? String(options.getStartAction(nextTask) || "").trim()
    : "";
  return {
    outcome,
    tomorrow: guidanceAction || (nextTask ? startAction || `继续${String(nextTask.name || "当前任务").trim()}` : ""),
    taskId: guidanceAction ? guidanceTaskId : nextTask ? String(nextTask.id || "") : "",
  };
}

function buildDailyReviewQuickTemplate(tasks) {
  const learningTasks = (Array.isArray(tasks) ? tasks : []).filter(isDashboardCloseoutTask);
  const taskNames = (records) => [...new Set(records.map((task) => String(task && task.name || "").trim()).filter(Boolean))].join("、");
  const completed = taskNames(learningTasks.filter(taskWasCompleted));
  const unfinished = taskNames(learningTasks.filter((task) => !taskWasCompleted(task)));
  return `完成=${completed}\n未完成=${unfinished}\n原因=\n收获=\n明日第一优先=`;
}

function parseDailyReviewQuickRecord(value) {
  const aliases = {
    "完成": "completedToday", "未完成": "unfinishedToday", "原因": "delayedTasks",
    "收获": "learnedToday", "明日第一优先": "tomorrowPriority", "明日优先": "tomorrowPriority",
  };
  const parsed = { completedToday: "", unfinishedToday: "", delayedTasks: "", learnedToday: "", tomorrowPriority: "" };
  const seen = new Set();
  let currentKey = "";
  String(value || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim(); if (!line) return;
    const match = line.match(/^([^=＝]+)[=＝](.*)$/);
    const key = match ? aliases[match[1].trim()] : "";
    if (match && !key) throw new Error(`无法识别字段：${match[1].trim()}`);
    if (key) {
      if (seen.has(key)) throw new Error(`字段重复：${match[1].trim()}`);
      seen.add(key);
      currentKey = key; parsed[key] = match[2].trim(); return;
    }
    if (!currentKey) throw new Error(`无法识别内容：${line}`);
    parsed[currentKey] = [parsed[currentKey], line].filter(Boolean).join("\n");
  });
  if (!parsed.completedToday && !parsed.learnedToday && !parsed.tomorrowPriority) throw new Error("至少填写完成、收获或明日第一优先中的一项。");
  return parsed;
}
function fillDailyReviewFields(values) {
  const mappings = {
    "completed-today": values.completedToday, "unfinished-today": values.unfinishedToday,
    "delayed-tasks": values.delayedTasks, "learned-today": values.learnedToday,
    "tomorrow-priority": values.tomorrowPriority,
  };
  Object.entries(mappings).forEach(([key, value]) => { document.querySelector(`[data-review-field="${key}"]`).value = value; });
}
function getDailyCloseoutDraftKey() {
  return `studyDailyCloseoutDraft:${getDateKey()}`;
}

function readDailyCloseoutDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(getDailyCloseoutDraftKey()) || "null");
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

function saveDailyCloseoutDraft() {
  try {
    sessionStorage.setItem(getDailyCloseoutDraftKey(), JSON.stringify({
      outcome: document.querySelector("#reviewOutcomeNote").value,
      tomorrow: document.querySelector("#reviewTomorrowAction").value,
    }));
  } catch {
    // A blocked sessionStorage must not block the formal daily record.
  }
}

function clearDailyCloseoutDraft() {
  try { sessionStorage.removeItem(getDailyCloseoutDraftKey()); } catch {}
}

function hasTodayReview() {
  const date = getDateKey();
  return readHistory().some((record) => record && record.date === date);
}

function getDailyCloseoutSummary() {
  const date = getDateKey();
  const todayRecord = readHistory().find((record) => record && record.date === date) || null;
  const snapshot = typeof getCurrentP1Snapshot === "function"
    ? getCurrentP1Snapshot()
    : typeof getCurrentP0Snapshot === "function" ? getCurrentP0Snapshot() : {};
  const plan = typeof getTodayPlan === "function" ? getTodayPlan() : {};
  const summary = buildDailyCloseoutSummary(snapshot, todayRecord, Array.isArray(plan.tasks) ? plan.tasks : null);
  const gate = typeof getDailyClosedBookGateStatus === "function" && typeof getP1IntegrationInput === "function"
    ? getDailyClosedBookGateStatus(getP1IntegrationInput(date), date)
    : { hasProduct: false };
  return { ...summary, closedBookProductSaved: gate.hasProduct };
}

function buildDailyCloseoutGuidanceContext(plan = {}, selectedTaskId = "") {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const normalizedSelectedTaskId = String(selectedTaskId || "");
  const selectedTask = tasks.find((task) => String(task && task.id || "") === normalizedSelectedTaskId);
  const selectedStatus = selectedTask && typeof getTaskStatus === "function"
    ? getTaskStatus(selectedTask)
    : String(selectedTask && selectedTask.status || "");
  const currentTaskId = selectedStatus === "in-progress" ? normalizedSelectedTaskId : "";
  const guidance = typeof buildDailyExecutionGapItems === "function" && typeof selectDailyGuidanceItem === "function"
    ? selectDailyGuidanceItem(buildDailyExecutionGapItems(plan), {
      actionField: "tomorrowAction",
      excludeTaskId: currentTaskId ? "" : normalizedSelectedTaskId,
    })
    : null;
  return { currentTaskId, guidance };
}

function applyDailyCloseoutSuggestion() {
  const outcomeInput = document.querySelector("#reviewOutcomeNote");
  const tomorrowInput = document.querySelector("#reviewTomorrowAction");
  const container = document.querySelector("#dailyCloseout");
  if (!outcomeInput || !tomorrowInput || !container) return false;
  if (outcomeInput.value.trim() || tomorrowInput.value.trim()) return false;
  if (readDailyCloseoutDraft() || hasTodayReview()) return false;
  const plan = typeof getTodayPlan === "function" ? getTodayPlan() : { tasks: [] };
  const selectedTaskId = plan.currentTaskId || document.querySelector("#focusTask")?.value || "";
  const guidanceContext = buildDailyCloseoutGuidanceContext(plan, selectedTaskId);
  const suggestion = buildDailyCloseoutSuggestion(getDailyCloseoutSummary(), plan.tasks, {
    guidance: guidanceContext.guidance,
    currentTaskId: guidanceContext.currentTaskId,
    getStartAction: (task) => {
      const exact = typeof getTaskExactStartAction === "function" ? getTaskExactStartAction(task) : "";
      return exact || (typeof getFiveMinuteStartAction === "function" ? getFiveMinuteStartAction(task) : "");
    },
  });
  if (!suggestion.outcome && !suggestion.tomorrow) return false;
  outcomeInput.value = suggestion.outcome;
  tomorrowInput.value = suggestion.tomorrow;
  container.dataset.autoCloseoutSuggestion = "true";
  setStatus("#reviewQuickStatus", "已根据正式结果和下一准确起点生成可编辑草稿；核对后点击“一键收工”才会正式保存。");
  return true;
}

function saveEditedDailyCloseoutDraft() {
  const container = document.querySelector("#dailyCloseout");
  if (container) container.dataset.autoCloseoutSuggestion = "false";
  saveDailyCloseoutDraft();
}

function renderDailyCloseout() {
  const container = document.querySelector("#dailyCloseout");
  if (!container) return;
  const summary = getDailyCloseoutSummary();
  document.querySelector("#closeoutStudyTime").textContent = formatFocusDuration(summary.effectiveStudySeconds);
  document.querySelector("#closeoutTaskProgress").textContent = `${summary.completedNames.length}/${summary.completedNames.length + summary.unfinishedNames.length}`;
  document.querySelector("#closeoutResultCount").textContent = `${summary.formalResultCount}项`;
  document.querySelector("#closeoutReviewCount").textContent = `${summary.reviewsCompleted}项`;
  const closedBookStatus = document.querySelector("#closeoutClosedBookStatus");
  closedBookStatus.textContent = summary.closedBookProductSaved ? "已保存" : "尚未保存";
  closedBookStatus.classList.toggle("is-missing", !summary.closedBookProductSaved);
  const resultFacts = [
    `专业课验收 ${summary.professionalCount}`,
    `英语阅读 ${summary.englishReadingCount}`,
    `政治 ${summary.politicsCount}`,
    `闭卷输出 ${summary.outputCount}`,
  ].join(" · ");
  const unfinished = summary.unfinishedNames.length ? `；未完成：${summary.unfinishedNames.join("、")}` : "";
  document.querySelector("#closeoutFactDetail").textContent = `正式结果：${resultFacts}${unfinished}`;
  const status = document.querySelector("#reviewQuickStatus");
  if (status && !status.classList.contains("error")) {
    const hasDraft = Boolean(readDailyCloseoutDraft());
    setStatus("#reviewQuickStatus", hasDraft
      ? "有未保存修改；点击“一键收工”后才会写入今日记录。"
      : summary.saved ? "今日闭环已保存；修改后可再次保存。" : "尚未收工：事实已自动汇总，只需补充下面两句话。");
  }
  renderAiPlanCalibration();
}

function loadDailyCloseoutFields() {
  const todayRecord = readHistory().find((record) => record && record.date === getDateKey()) || {};
  const draft = readDailyCloseoutDraft();
  document.querySelector("#reviewOutcomeNote").value = String(draft ? draft.outcome || "" : todayRecord.learnedToday || "");
  document.querySelector("#reviewTomorrowAction").value = String(draft ? draft.tomorrow || "" : todayRecord.tomorrowPriority || "");
  const container = document.querySelector("#dailyCloseout");
  if (container) container.dataset.autoCloseoutSuggestion = "false";
}

async function saveDailyCloseout() {
  try {
    const summary = getDailyCloseoutSummary();
    const existing = readHistory().find((record) => record && record.date === getDateKey()) || {};
    fillDailyReviewFields({
      completedToday: summary.completedNames.join("、"),
      unfinishedToday: summary.unfinishedNames.join("、"),
      delayedTasks: String(existing.delayedTasks || ""),
      learnedToday: document.querySelector("#reviewOutcomeNote").value.trim(),
      tomorrowPriority: document.querySelector("#reviewTomorrowAction").value.trim(),
    });
    if (!saveTodayReview()) {
      setStatus("#reviewQuickStatus", "还没有已完成任务；请至少填写一条今日产出、卡点或明日第一动作。", true);
      return;
    }
    clearDailyCloseoutDraft();
    const container = document.querySelector("#dailyCloseout");
    if (container) container.dataset.autoCloseoutSuggestion = "false";
    renderDailyCloseout();
    if (typeof renderTasks === "function") renderTasks();
    setStatus("#reviewQuickStatus", "今日闭环已保存，正在生成 DeepSeek 评价和明日计划……");
    const [aiReviewSaved, aiPlanReady] = await Promise.all([requestDailyAiReview(), requestAiTomorrowPlan()]);
    setStatus("#reviewQuickStatus", aiReviewSaved && aiPlanReady
      ? "今日闭环已保存，DeepSeek 评价和明日计划已生成。"
      : "今日闭环已保存；部分AI内容暂未生成，可在对应卡片中重试。");
  } catch (error) {
    setStatus("#reviewQuickStatus", error.message || "保存失败。", true);
  }
}

function openDailyCloseout() {
  applyDailyCloseoutSuggestion();
  document.querySelector("#dailyCloseout").scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#reviewOutcomeNote").focus({ preventScroll: true });
}

function initDailyReviewQuickRecord() {
  document.querySelector("#saveReviewQuickBtn").addEventListener("click", saveDailyCloseout);
  document.querySelector("#regenerateDailyAiReviewBtn").addEventListener("click", requestDailyAiReview);
  document.querySelector("#regenerateAiTomorrowPlanBtn").addEventListener("click", requestAiTomorrowPlan);
  document.querySelector("#applyAiTomorrowPlanBtn").addEventListener("click", applyAiTomorrowPlan);
  document.querySelector("#generateAiRollingWeekBtn").addEventListener("click", requestAiRollingWeekPlan);
  document.querySelector("#applyAiRollingWeekBtn").addEventListener("click", applyAiRollingWeekPlan);
  document.querySelector("#reviewOutcomeNote").addEventListener("input", saveEditedDailyCloseoutDraft);
  document.querySelector("#reviewTomorrowAction").addEventListener("input", saveEditedDailyCloseoutDraft);
  document.querySelector("#dailyCloseout").addEventListener("focusin", applyDailyCloseoutSuggestion);
  loadDailyCloseoutFields();
  renderDailyCloseout();
  renderDailyAiReview();
  renderAiTomorrowPlanPreview();
  renderAiRollingWeekPlanPreview();
}

function loadReviewFields() {
  const todayRecord = readHistory().find((record) => record && record.date === getDateKey()) || {};
  const mappings = {
    "completed-today": "completedToday", "unfinished-today": "unfinishedToday", "delayed-tasks": "delayedTasks",
    "learned-today": "learnedToday", "tomorrow-priority": "tomorrowPriority",
  };
  document.querySelectorAll("[data-review-field]").forEach((field) => { field.value = String(todayRecord[mappings[field.dataset.reviewField]] || ""); });
  renderTodayFocusOutputs();
  if (document.querySelector("#reviewOutcomeNote")) {
    loadDailyCloseoutFields();
    renderDailyCloseout();
    renderDailyAiReview();
    renderAiTomorrowPlanPreview();
  }
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
    taskId: task.taskId || task.id,
    sourceTaskKey: task.sourceTaskKey || "",
    time: readReviewTaskText(task.time),
    name: readReviewTaskText(task.name),
    description: readReviewTaskText(task.description || task.minimum, ["description", "minimumOutput", "text"]),
    minimum: readReviewTaskText(task.minimum, ["minimumOutput", "description", "text"]),
    status: getTaskStatus(task),
    completed: getTaskStatus(task) === "completed",
    counted: task.counted,
    exercise: task.exercise,
    category: task.category || "",
    focusSeconds: getTaskFocusSeconds(getDateKey(), task.id),
    nextStart: readReviewTaskText(task.nextStart, ["nextStart", "action", "description"]),
    completionCriteria: readReviewTaskText(task.completionCriteria, ["completionCriteria", "minimumOutput", "description"]),
    fallbackPlan: readReviewTaskText(task.fallbackPlan, ["fallback", "description", "text"]),
    aiPlanned: task.aiPlanned === true,
    aiPlanGeneratedAt: task.aiPlanGeneratedAt || "",
  };
}

function saveTodayReview() {
  const plan = getTodayPlan();
  const { done, total, rate } = getCompletionStats(plan);
  const tasks = plan.tasks.map(snapshotTask);
  const learningTasks = tasks.filter(isDashboardCloseoutTask);
  const exerciseTask = tasks.find((task) => task.exercise || task.category === "exercise");
  const studyTime = getStudyTimeSnapshot();
  const reviewSnapshot = typeof getReviewSnapshot === "function" ? getReviewSnapshot() : { completed: [], dueNextDay: [] };
  const existingRecord = readHistory().find((item) => item && item.date === getDateKey()) || {};
  const capacity = studyTime.targetModel.capacityCalibration;
  const executionTargetEvidence = capacity && typeof capacity === "object" ? {
    status: String(capacity.status || ""),
    evidenceDays: Math.max(0, Number(capacity.evidenceDays) || 0),
    excludedDays: Math.max(0, Number(capacity.excludedDays) || 0),
    medianStudyMinutes: Math.max(0, Number(capacity.medianStudyMinutes) || 0),
    weightedCompletionRate: Number.isFinite(capacity.weightedCompletionRate) ? capacity.weightedCompletionRate : null,
    recommendedMaxMinutes: Math.max(0, Number(capacity.recommendedMaxMinutes) || 0),
  } : null;
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
    plan: tasks.filter(isDashboardCloseoutTask).map((task) => task.name),
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
    planStudyTargetSeconds: studyTime.planStudyTargetSeconds,
    executionTargetSeconds: studyTime.executionTargetSeconds,
    executionTargetSource: String(studyTime.targetModel.source || "plan"),
    executionTargetSourceLabel: String(studyTime.targetModel.sourceLabel || "原计划"),
    ...(executionTargetEvidence ? { executionTargetEvidence } : {}),
    manualRecordsSaved: true,
    manualTimeRecords: getManualRecordsSnapshot(getDateKey()),
    professionalProgress: typeof getProfessionalProgressSnapshot === "function" ? getProfessionalProgressSnapshot() : {},
    reviewsCompleted: reviewSnapshot.completed,
    reviewsDueNextDay: reviewSnapshot.dueNextDay,
    ...(plan.aiTomorrowPlan && typeof plan.aiTomorrowPlan === "object" ? { aiTomorrowPlan: plan.aiTomorrowPlan } : {}),
    ...(existingRecord.aiReview && typeof existingRecord.aiReview === "object" ? { aiReview: existingRecord.aiReview } : {}),
  };
  if (!record.completedToday && !record.learnedToday && !record.tomorrowPriority) {
    setStatus("#reviewSaveStatus", "至少填写完成内容、学习收获或明日优先级中的一项。", true);
    return false;
  }
  const history = [record, ...readHistory().filter((item) => item && item.date !== record.date)]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  writeHistory(history);
  renderHistory();
  renderDailyAiReview();
  renderRecentSevenDays();
  renderExamStatsOverview();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  renderDailyCloseout();
  setStatus("#reviewSaveStatus", "今日学习记录已更新；同一天不会重复生成记录。");
  return true;
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
  const sessions = groupFocusSessionsForHistory(getFocusSessionsForDate(dateKey));
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
    const interruptionText = session.interruptionCount ? ` · 自动中断 ${session.interruptionCount} 次` : "";
    meta.textContent = `${formatFocusDuration(session.seconds)} · ${session.mode === POMODORO_FOCUS_MODE ? "25分钟番茄" : "自由专注"} · ${getFocusSessionReasonLabel(session.reason)}${interruptionText}`;
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
    if (session.grouped && session.parts.length > 1) {
      const rawDetails = document.createElement("details");
      rawDetails.className = "history-focus-raw";
      const rawSummary = document.createElement("summary");
      rawSummary.textContent = `查看 ${session.parts.length} 个原始片段`;
      const rawList = document.createElement("div");
      session.parts.forEach((part) => {
        const row = document.createElement("p");
        row.textContent = `${formatFocusSessionRange(part)} · ${formatFocusDuration(part.seconds)} · ${getFocusSessionReasonLabel(part.reason)}`;
        rawList.appendChild(row);
      });
      rawDetails.append(rawSummary, rawList);
      item.appendChild(rawDetails);
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
    addRecordField(body, "实际执行目标", formatTargetDuration(studyTime.executionTargetSeconds));
    addRecordField(body, "目标依据", String(studyTime.targetModel.sourceLabel || "旧记录未注明"));
    addRecordField(body, "原计划目标", formatTargetDuration(studyTime.planStudyTargetSeconds));
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
    addRecordField(body, "今日产出或卡点", record.learnedToday);
    addRecordField(body, "明天第一优先级", record.tomorrowPriority);
    if (record.aiReview && record.aiReview.content) addRecordField(body, "DeepSeek评价与建议", record.aiReview.content);
    const aiExecution = summarizeAiPlanExecution(record);
    if (aiExecution) {
      addRecordField(body, "AI计划执行", `安排${aiExecution.plannedTaskCount}项；正式完成${aiExecution.completedCount}；已开始未完成${aiExecution.startedWithoutCompletionCount}；未开始${aiExecution.notStartedCount}`);
      addRecordField(body, "AI计划与跟踪时间", `计划${aiExecution.totalPlannedMinutes}分钟；已跟踪专注${formatFocusDuration(aiExecution.trackedFocusSeconds)}`);
    }
    details.append(summary, body);
    container.appendChild(details);
  });
}
