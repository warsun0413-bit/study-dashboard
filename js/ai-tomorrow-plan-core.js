const AI_TOMORROW_PLAN_SOURCE_KEYS = [
  "english", "722", "844", "originalTextOrReview", "training", "politics", "outputOrMock",
];

const AI_TRUSTED_PLAN_SOURCES = Object.freeze({
  "nankai-marxism-control-plan": {
    schemaVersion: 3,
    planId: "nankai-control-2026-08-06",
    label: "2026-08-06总控计划",
    builtInDetailedStart: "2026-08-06",
    builtInDetailedEnd: "2026-08-12",
  },
  "nankai-marxism-exam-plan": { schemaVersion: 2, label: "南开马理论网站计划v2" },
  "nankai-ai-rolling-week-plan": { schemaVersion: 1, label: "AI滚动7日计划", dynamicPlanId: true },
});

function getAiPlanTaskSourceKey(task) {
  const explicit = String(task && task.sourceTaskKey || "").trim();
  if (AI_TOMORROW_PLAN_SOURCE_KEYS.includes(explicit)) return explicit;
  const category = String(task && task.category || "");
  if (["english", "englishWords", "englishReading"].includes(category)) return "english";
  if (category === "maYuan") return "722";
  if (category === "maHistory") return "844";
  if (category === "rollingReview") return "originalTextOrReview";
  if (category === "exercise") return "training";
  if (category === "politics") return "politics";
  if (category === "output") return "outputOrMock";
  return "";
}

function parseAiPlanTimeRange(value) {
  const normalized = String(value || "").trim().replace(/[-–~～至]/g, "—");
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)—([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (end <= start) return null;
  return { value: normalized, start, end, minutes: end - start };
}

function getAiTomorrowAvailableTasks(plan) {
  const seen = new Set();
  return (plan && Array.isArray(plan.tasks) ? plan.tasks : []).flatMap((task) => {
    const sourceTaskKey = getAiPlanTaskSourceKey(task);
    if (!sourceTaskKey || seen.has(sourceTaskKey)) return [];
    seen.add(sourceTaskKey);
    return [{
      taskId: String(task.taskId || task.id || ""),
      sourceTaskKey,
      name: String(task.name || task.subject || sourceTaskKey),
      time: String(task.time || ""),
      description: String(task.description || ""),
      nextStart: String(task.nextStart || ""),
      completionCriteria: String(task.completionCriteria || task.minimum || ""),
      fallback: String(task.fallbackPlan || task.fallback || ""),
      counted: task.counted === true,
      exercise: task.exercise === true,
      category: String(task.category || ""),
      protected: task.manualEdited === true || ["completed", "in-progress"].includes(String(task.status || "")) || task.completed === true,
    }];
  });
}

function buildAiTomorrowTaskCandidates(tomorrowPlan, todayRecord = {}) {
  const todayTasks = Array.isArray(todayRecord.tasks) ? todayRecord.tasks : [];
  return getAiTomorrowAvailableTasks(tomorrowPlan).map((available) => {
    const originalDescription = String(available.description || "").trim();
    const original = {
      basis: "original-plan",
      description: originalDescription,
      nextStart: String(available.nextStart || originalDescription).trim(),
      completionCriteria: String(available.completionCriteria || originalDescription).trim(),
      fallback: String(available.fallback || "时间不足时保留真实未完成状态，并记录下一准确起点。").trim(),
    };
    const todayTask = todayTasks.find((task) => getAiPlanTaskSourceKey(task) === available.sourceTaskKey);
    const todayCompleted = todayTask && (todayTask.completed === true || String(todayTask.status || "") === "completed");
    const carryoverDescription = String(todayTask && (todayTask.description || todayTask.minimum) || "").trim();
    const carryover = todayTask && !todayCompleted && carryoverDescription ? {
      basis: "today-carryover",
      description: carryoverDescription,
      nextStart: String(todayTask.nextStart || carryoverDescription).trim(),
      completionCriteria: String(todayTask.completionCriteria || todayTask.minimum || carryoverDescription).trim(),
      fallback: String(todayTask.fallbackPlan || "时间不足时保留真实未完成状态，并记录下一准确起点。").trim(),
    } : null;
    const protectedTask = available.protected === true;
    return {
      ...available,
      requiredBasis: protectedTask ? "original-plan" : carryover ? "today-carryover" : "original-plan",
      planCandidates: carryover ? [original, carryover] : [original],
    };
  });
}

function getAiTomorrowPlanSourceStatus(tomorrowPlan = {}, importedPlan = {}, tomorrowDate = "") {
  const planType = String(tomorrowPlan.sourcePlanType || "").trim();
  const schemaVersion = Number(tomorrowPlan.sourceSchemaVersion) || 0;
  const trusted = AI_TRUSTED_PLAN_SOURCES[planType];
  const importedMatches = String(importedPlan.planType || "") === planType
    && Number(importedPlan.schemaVersion) === schemaVersion;
  const expectedPlanId = String(tomorrowPlan.sourcePlanId || "").trim();
  const importedPlanId = String(importedPlan.planId || "").trim();
  const dynamicPlanIdMatches = Boolean(trusted && trusted.dynamicPlanId
    && /^rolling-week-\d{4}-\d{2}-\d{2}$/.test(importedPlanId)
    && expectedPlanId === importedPlanId);
  const planIdMatches = dynamicPlanIdMatches || ((!expectedPlanId || importedPlanId === expectedPlanId)
    && (!trusted || !trusted.planId || (expectedPlanId === trusted.planId && importedPlanId === trusted.planId)));
  const startDate = String(importedPlan.startDate || "");
  const endDate = String(importedPlan.endDate || "");
  const dateInRange = !tomorrowDate || ((!startDate || tomorrowDate >= startDate) && (!endDate || tomorrowDate <= endDate));
  const detailedPlanDates = Array.isArray(importedPlan.detailedPlanDates)
    ? importedPlan.detailedPlanDates.map((dateKey) => String(dateKey || "")).filter(Boolean)
    : [];
  const detailedPlanStart = String(importedPlan.detailedPlanStart || detailedPlanDates[0] || "");
  const detailedPlanEnd = String(importedPlan.detailedPlanEnd || detailedPlanDates.at(-1) || "");
  const hasExactTomorrowPlan = Boolean(tomorrowDate && detailedPlanDates.includes(tomorrowDate));
  const importedAt = String(importedPlan.importedAt || "");
  const ready = Boolean(trusted
    && schemaVersion === trusted.schemaVersion
    && importedMatches
    && planIdMatches
    && dateInRange
    && hasExactTomorrowPlan
    && importedAt);
  const sourceLabel = String(importedPlan.sourceDocumentTitle || tomorrowPlan.sourceDocumentTitle || trusted && trusted.label || "").trim();
  const builtIn = AI_TRUSTED_PLAN_SOURCES["nankai-marxism-control-plan"];
  const canImportBuiltIn = Boolean(tomorrowDate
    && tomorrowDate >= builtIn.builtInDetailedStart
    && tomorrowDate <= builtIn.builtInDetailedEnd);
  const message = ready
    ? "已锁定可信逐日原计划，AI只能在原任务与今日真实顺延任务之间编排。"
    : importedAt && detailedPlanEnd && tomorrowDate > detailedPlanEnd
      ? `已导入的原文件只逐日安排至 ${detailedPlanEnd}；请先按最新进度制定并导入包含 ${tomorrowDate} 的逐日计划。`
      : "明日没有已导入的可信逐日原计划，请先导入总控计划。";
  return {
    ready,
    planType,
    schemaVersion,
    planId: importedPlanId || expectedPlanId,
    sourceLabel: sourceLabel || "未识别原计划",
    importedAt,
    tomorrowDate: String(tomorrowDate || tomorrowPlan.date || ""),
    detailedPlanStart,
    detailedPlanEnd,
    detailedPlanDate: hasExactTomorrowPlan ? tomorrowDate : "",
    canImportBuiltIn,
    message,
  };
}

function normalizeAiTomorrowPlan(rawPlan, options = {}) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) throw new Error("AI计划不是有效对象。");
  const expectedDate = String(options.expectedDate || "");
  const date = String(rawPlan.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (expectedDate && date !== expectedDate)) throw new Error("AI计划日期与明日日期不一致。");
  const availableTasks = Array.isArray(options.availableTasks) ? options.availableTasks : [];
  const availableKeys = new Set(availableTasks.map((task) => String(task.sourceTaskKey || "")));
  const rawTasks = Array.isArray(rawPlan.tasks) ? rawPlan.tasks : [];
  if (rawTasks.length < 3 || rawTasks.length > 8) throw new Error("AI计划应包含3至8个任务块。");
  const seen = new Set();
  const tasks = rawTasks.map((task) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) throw new Error("AI计划包含无效任务。");
    const sourceTaskKey = String(task.sourceTaskKey || "").trim();
    if (!availableKeys.has(sourceTaskKey)) throw new Error(`AI计划包含未知或未开放的任务：${sourceTaskKey || "未命名"}。`);
    if (seen.has(sourceTaskKey)) throw new Error(`AI计划重复安排了任务：${sourceTaskKey}。`);
    seen.add(sourceTaskKey);
    const availableTask = availableTasks.find((item) => String(item.sourceTaskKey || "") === sourceTaskKey) || {};
    const candidates = Array.isArray(availableTask.planCandidates) ? availableTask.planCandidates : [];
    const basis = String(task.basis || "").trim();
    const candidate = candidates.find((item) => String(item && item.basis || "") === basis);
    if (candidates.length && (!candidate || basis !== String(availableTask.requiredBasis || ""))) {
      throw new Error(`AI计划任务 ${sourceTaskKey} 未按今日完成度选择原计划或顺延任务。`);
    }
    const range = parseAiPlanTimeRange(task.time);
    if (!range || range.minutes < 10 || range.minutes > 240) throw new Error(`AI计划时间无效：${task.time || sourceTaskKey}。`);
    const description = String(task.description || "").trim();
    const nextStart = String(task.nextStart || "").trim();
    const completionCriteria = String(task.completionCriteria || "").trim();
    const fallback = String(task.fallback || "").trim();
    if (!description || !nextStart || !completionCriteria) throw new Error(`AI计划任务 ${sourceTaskKey} 缺少内容、准确起点或完成标准。`);
    if ([description, nextStart, completionCriteria, fallback].some((value) => value.length > 500)) throw new Error(`AI计划任务 ${sourceTaskKey} 内容过长。`);
    if (candidate && ["description", "nextStart", "completionCriteria", "fallback"].some((key) => String(task[key] || "").trim() !== String(candidate[key] || "").trim())) {
      throw new Error(`AI计划任务 ${sourceTaskKey} 改写了原计划或真实剩余内容。`);
    }
    return { sourceTaskKey, basis: basis || "original-plan", time: range.value, description, nextStart, completionCriteria, fallback, start: range.start, end: range.end };
  }).sort((left, right) => left.start - right.start);
  for (let index = 1; index < tasks.length; index += 1) {
    if (tasks[index].start < tasks[index - 1].end) throw new Error("AI计划存在时间重叠。");
  }
  const totalMinutes = tasks.reduce((sum, task) => sum + (task.end - task.start), 0);
  if (totalMinutes > 720) throw new Error("AI计划总任务时间超过12小时。");
  const maxPlannedMinutes = Math.min(720, Math.max(0, Math.floor(Number(options.maxPlannedMinutes) || 0)));
  if (maxPlannedMinutes && totalMinutes > maxPlannedMinutes) throw new Error(`AI计划总任务时间超过个人承载上限${maxPlannedMinutes}分钟。`);
  const requiredTaskKeys = Array.isArray(options.requiredTaskKeys)
    ? options.requiredTaskKeys.map((key) => String(key || "")).filter((key) => availableKeys.has(key))
    : ["english", "722", "844"].filter((key) => availableKeys.has(key));
  requiredTaskKeys.forEach((key) => {
    if (!seen.has(key)) throw new Error(`AI计划缺少必需任务：${key}。`);
  });
  if (options.hasDueReviews && availableKeys.has("originalTextOrReview") && !seen.has("originalTextOrReview")) {
    throw new Error("明日有到期复盘，但AI计划未安排复盘任务。");
  }
  return {
    schemaVersion: 1,
    date,
    summary: String(rawPlan.summary || "").trim().slice(0, 500),
    tasks: tasks.map(({ start, end, ...task }) => task),
  };
}

function mergeAiTomorrowPlan(existingPlan, aiPlan, options = {}) {
  const generatedAt = String(options.generatedAt || new Date().toISOString());
  const planSource = options.planSource && typeof options.planSource === "object" ? { ...options.planSource } : null;
  const sourceEvidence = options.sourceEvidence && typeof options.sourceEvidence === "object"
    ? {
      recordDate: String(options.sourceEvidence.recordDate || ""),
      fingerprint: String(options.sourceEvidence.fingerprint || ""),
    }
    : null;
  const plannedByKey = new Map(aiPlan.tasks.map((task) => [task.sourceTaskKey, task]));
  const updated = [];
  const protectedTasks = [];
  const tasks = (existingPlan && Array.isArray(existingPlan.tasks) ? existingPlan.tasks : []).map((task) => {
    const sourceTaskKey = getAiPlanTaskSourceKey(task);
    const planned = plannedByKey.get(sourceTaskKey);
    if (!planned) return { ...task };
    const protectedTask = task.manualEdited === true
      || ["completed", "in-progress"].includes(String(task.status || ""))
      || task.completed === true;
    if (protectedTask) {
      protectedTasks.push({ sourceTaskKey, name: String(task.name || sourceTaskKey), reason: task.manualEdited === true ? "人工编辑" : "已有执行状态" });
      return { ...task };
    }
    updated.push({ sourceTaskKey, name: String(task.name || sourceTaskKey) });
    return {
      ...task,
      time: planned.time,
      description: planned.description,
      nextStart: planned.nextStart,
      completionCriteria: planned.completionCriteria,
      fallbackPlan: planned.fallback,
      importedDescription: planned.description,
      aiPlanned: true,
      aiPlanBasis: planned.basis,
      aiPlanGeneratedAt: generatedAt,
    };
  });
  return {
    day: {
      ...existingPlan,
      date: aiPlan.date,
      tasks,
      aiTomorrowPlan: {
        provider: "deepseek",
        generatedAt,
        summary: aiPlan.summary,
        schemaVersion: 1,
        ...(planSource ? { planSource } : {}),
        ...(sourceEvidence && sourceEvidence.recordDate && sourceEvidence.fingerprint ? { sourceEvidence } : {}),
      },
    },
    updated,
    protectedTasks,
  };
}

function summarizeAiPlanExecution(record = {}) {
  const aiPlan = record.aiTomorrowPlan && typeof record.aiTomorrowPlan === "object" ? record.aiTomorrowPlan : null;
  const tasks = (Array.isArray(record.tasks) ? record.tasks : []).filter((task) => task && task.aiPlanned === true);
  if (!aiPlan || !tasks.length) return null;
  const taskFacts = tasks.map((task) => {
    const range = parseAiPlanTimeRange(task.time);
    const focusSeconds = Math.max(0, Math.floor(Number(task.focusSeconds) || 0));
    const completed = task.completed === true || String(task.status || "") === "completed";
    const started = !completed && (focusSeconds > 0 || String(task.status || "") === "in-progress");
    return {
      sourceTaskKey: getAiPlanTaskSourceKey(task),
      name: String(task.name || getAiPlanTaskSourceKey(task) || "未命名任务"),
      plannedMinutes: range ? range.minutes : 0,
      trackedFocusSeconds: focusSeconds,
      executionState: completed ? "completed" : started ? "started-without-completion" : "not-started",
      nextStart: String(task.nextStart || ""),
      completionCriteria: String(task.completionCriteria || ""),
    };
  });
  return {
    date: String(record.date || ""),
    planGeneratedAt: String(aiPlan.generatedAt || ""),
    plannedTaskCount: taskFacts.length,
    completedCount: taskFacts.filter((task) => task.executionState === "completed").length,
    startedWithoutCompletionCount: taskFacts.filter((task) => task.executionState === "started-without-completion").length,
    notStartedCount: taskFacts.filter((task) => task.executionState === "not-started").length,
    totalPlannedMinutes: taskFacts.reduce((sum, task) => sum + task.plannedMinutes, 0),
    trackedFocusSeconds: taskFacts.reduce((sum, task) => sum + task.trackedFocusSeconds, 0),
    userReportedCause: String(record.delayedTasks || "").trim(),
    tasks: taskFacts,
  };
}

function buildRecentAiPlanExecution(history, limit = 3) {
  const safeLimit = Math.min(7, Math.max(1, Math.floor(Number(limit) || 3)));
  const days = (Array.isArray(history) ? history : [])
    .map(summarizeAiPlanExecution)
    .filter(Boolean)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, safeLimit);
  const unfinishedDaysByTask = new Map();
  days.forEach((day) => {
    const dayKeys = new Set(day.tasks
      .filter((task) => task.executionState !== "completed" && task.sourceTaskKey)
      .map((task) => task.sourceTaskKey));
    dayKeys.forEach((key) => unfinishedDaysByTask.set(key, (unfinishedDaysByTask.get(key) || 0) + 1));
  });
  return {
    evidenceDays: days.length,
    days,
    repeatedUnfinished: [...unfinishedDaysByTask.entries()]
      .filter(([, count]) => count >= 2)
      .map(([sourceTaskKey, daysCount]) => ({ sourceTaskKey, daysCount })),
  };
}
