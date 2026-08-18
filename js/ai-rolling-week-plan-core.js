const AI_ROLLING_WEEK_PLAN_TYPE = "nankai-ai-rolling-week-plan";
const AI_ROLLING_WEEK_SCHEMA_VERSION = 1;
const AI_ROLLING_STANDARD_MINUTES = 435;
const AI_ROLLING_FLOOR_MINUTES = 300;
const AI_ROLLING_STAGE_CEILING_MINUTES = 525;
const AI_ROLLING_EXPANSION_COMPLETION_RATE = 80;
const AI_ROLLING_REQUIRED_TASK_KEYS = ["englishWords", "english", "722", "844", "originalTextOrReview", "politics", "outputOrMock"];
const AI_ROLLING_STANDARD_TIMES = Object.freeze({
  englishWords: "08:00—08:25",
  english: "15:45—17:15",
  mainProfessional: "08:35—10:25",
  retrievalProfessional: "10:40—11:30",
  originalTextOrReview: "20:20—20:50",
  politics: "14:00—15:05",
  outputOrMock: "19:00—20:05",
});

function getRollingMedian(values) {
  const sorted = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hasMeaningfulRollingClosedBookText(value) {
  const text = String(value || "").trim();
  return Boolean(text && !/^(?:未记录|未填写|暂无|无|未完成)$/i.test(text));
}

function countRecentRollingClosedBookEvidenceDays(store, todayDate, allowedDates = null) {
  const windowStart = addLocalPlanDays(todayDate, -6);
  const allowed = allowedDates instanceof Set ? allowedDates : null;
  const days = store && typeof store === "object" && store.days && typeof store.days === "object" ? store.days : {};
  return Object.entries(days).filter(([dateKey, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < windowStart || dateKey > todayDate
      || (allowed && !allowed.has(dateKey)) || !day || typeof day !== "object") return false;
    return ["722", "844"].some((subject) => {
      const record = day[subject];
      const units = record && Array.isArray(record.units) ? record.units : [];
      return units.some((unit) => hasMeaningfulRollingClosedBookText(unit && unit.closedBookResult));
    });
  }).length;
}

function auditRollingCapacityRecord(record) {
  if (!record || record.recordSchemaVersion !== 2 || record.manualRecordsSaved !== true) {
    return { valid: false, reason: "unverified-record-schema" };
  }
  const totalStudySeconds = record.totalStudySeconds;
  if (!Number.isInteger(totalStudySeconds) || totalStudySeconds <= 0 || totalStudySeconds > 24 * 60 * 60) {
    return { valid: false, reason: "invalid-study-time" };
  }
  const completionDone = record.completionDone;
  const completionTotal = record.completionTotal;
  if (!Number.isInteger(completionDone) || !Number.isInteger(completionTotal)
    || completionTotal <= 0 || completionDone < 0 || completionDone > completionTotal) {
    return { valid: false, reason: "invalid-completion-facts" };
  }
  return { valid: true, totalStudySeconds, completionDone, completionTotal };
}

function buildRollingCapacityEvidenceAudit(history, todayDate) {
  const windowStart = addLocalPlanDays(todayDate, -6);
  const grouped = new Map();
  (Array.isArray(history) ? history : []).forEach((record) => {
    const date = String(record && record.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < windowStart || date > todayDate) return;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(record);
  });
  const evidence = [];
  const exclusions = [];
  [...grouped.entries()].sort(([left], [right]) => right.localeCompare(left)).forEach(([date, records]) => {
    if (records.length !== 1) {
      exclusions.push({ date, reason: "duplicate-date" });
      return;
    }
    const audit = auditRollingCapacityRecord(records[0]);
    if (!audit.valid) {
      exclusions.push({ date, reason: audit.reason });
      return;
    }
    evidence.push({ date, ...audit });
  });
  const exclusionReasonCounts = exclusions.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});
  return {
    windowDays: grouped.size,
    evidence,
    evidenceDays: evidence.length,
    excludedDays: exclusions.length,
    exclusions,
    exclusionReasonCounts,
  };
}

function buildRollingWeekCapacityCalibration(history, todayDate, originalTargetMinutes = 0, options = {}) {
  const evidenceAudit = buildRollingCapacityEvidenceAudit(history, todayDate);
  const evidence = evidenceAudit.evidence;
  const targetMinutes = Math.min(AI_ROLLING_STAGE_CEILING_MINUTES, Math.max(0, Math.round(Number(originalTargetMinutes) || 0)));
  const stageCeilingMinutes = targetMinutes || AI_ROLLING_STAGE_CEILING_MINUTES;
  const standardMinutes = Math.min(stageCeilingMinutes, AI_ROLLING_STANDARD_MINUTES);
  const floorMinutes = Math.min(standardMinutes, AI_ROLLING_FLOOR_MINUTES);
  const closedBookEvidenceDays = countRecentRollingClosedBookEvidenceDays(
    options.professionalStore,
    todayDate,
    new Set(evidence.map((record) => record.date)),
  );
  if (evidence.length < 3) {
    return {
      status: "insufficient-data",
      evidenceDays: evidence.length,
      windowDays: evidenceAudit.windowDays,
      excludedDays: evidenceAudit.excludedDays,
      exclusions: evidenceAudit.exclusions,
      exclusionReasonCounts: evidenceAudit.exclusionReasonCounts,
      medianStudyMinutes: 0,
      weightedCompletionRate: null,
      originalTargetMinutes: targetMinutes,
      standardMinutes,
      floorMinutes,
      stageCeilingMinutes,
      closedBookEvidenceDays,
      expansionEligible: false,
      recommendedMaxMinutes: standardMinutes,
      message: `近7日采用${evidence.length}个正式有效日、排除${evidenceAudit.excludedDays}个不完整或异常日；证据不足，暂不判断个人速度，先按标准负荷${standardMinutes}分钟执行。`,
    };
  }
  const medianStudyMinutes = Math.round(getRollingMedian(evidence.map((record) => record.totalStudySeconds / 60)));
  const completionDone = evidence.reduce((sum, record) => sum + record.completionDone, 0);
  const completionTotal = evidence.reduce((sum, record) => sum + record.completionTotal, 0);
  const weightedCompletionRate = completionTotal ? Math.round(completionDone / completionTotal * 100) : null;
  const steadyCeiling = Math.max(120, Math.round(medianStudyMinutes / 15) * 15);
  const expansionEligible = Number.isFinite(weightedCompletionRate)
    && weightedCompletionRate >= AI_ROLLING_EXPANSION_COMPLETION_RATE
    && closedBookEvidenceDays > 0;
  const evidenceCeiling = expansionEligible
    ? Math.max(120, Math.round((medianStudyMinutes * 1.15) / 15) * 15)
    : steadyCeiling;
  const recommendedMaxMinutes = Math.min(stageCeilingMinutes, evidenceCeiling);
  return {
    status: "calibrated",
    evidenceDays: evidence.length,
    windowDays: evidenceAudit.windowDays,
    excludedDays: evidenceAudit.excludedDays,
    exclusions: evidenceAudit.exclusions,
    exclusionReasonCounts: evidenceAudit.exclusionReasonCounts,
    medianStudyMinutes,
    weightedCompletionRate,
    originalTargetMinutes: targetMinutes,
    standardMinutes,
    floorMinutes: Math.min(floorMinutes, recommendedMaxMinutes),
    stageCeilingMinutes,
    closedBookEvidenceDays,
    expansionEligible,
    recommendedMaxMinutes,
    message: expansionEligible
      ? `按近7日${evidence.length}个正式有效日校准（排除${evidenceAudit.excludedDays}日）：中位有效学习${medianStudyMinutes}分钟，完成率与闭卷证据达到扩量门槛，计划上限${recommendedMaxMinutes}分钟。`
      : `按近7日${evidence.length}个正式有效日校准（排除${evidenceAudit.excludedDays}日）：中位有效学习${medianStudyMinutes}分钟；扩量证据不足，计划不超过真实中位承载。`,
  };
}

function buildDailyExecutionTargetModel(input = {}) {
  const planTargetMinutes = Math.max(1, Math.round(Number(input.planTargetMinutes) || 0));
  const hasManualTarget = input.hasManualTarget === true && Number(input.manualTargetMinutes) > 0;
  const manualTargetMinutes = Math.max(1, Math.round(Number(input.manualTargetMinutes) || 0));
  const loadProfile = input.loadProfile && typeof input.loadProfile === "object" ? input.loadProfile : null;
  const confirmedLoadMinutes = Math.max(0, Math.round(Number(loadProfile && loadProfile.plannedCoreMinutes) || 0));
  if (hasManualTarget) {
    return {
      planTargetMinutes,
      executionTargetMinutes: manualTargetMinutes,
      source: "manual",
      sourceLabel: "手动设置",
      capacityCalibration: null,
    };
  }
  if (confirmedLoadMinutes > 0) {
    return {
      planTargetMinutes,
      executionTargetMinutes: Math.min(planTargetMinutes, confirmedLoadMinutes),
      source: "confirmed-load",
      sourceLabel: "已确认负荷计划",
      capacityCalibration: null,
    };
  }
  const capacityCalibration = buildRollingWeekCapacityCalibration(
    input.history,
    String(input.throughDate || ""),
    planTargetMinutes,
    { professionalStore: input.professionalStore },
  );
  return {
    planTargetMinutes,
    executionTargetMinutes: Math.min(planTargetMinutes, Math.max(1, capacityCalibration.recommendedMaxMinutes)),
    source: capacityCalibration.status === "calibrated" ? "recent-capacity" : "standard-load",
    sourceLabel: capacityCalibration.status === "calibrated" ? "近7日真实承载" : "证据不足，标准负荷",
    capacityCalibration,
  };
}

function getLatestRollingProfessionalAssessment(store, subject, throughDate) {
  const days = store && typeof store === "object" && store.days && typeof store.days === "object" ? store.days : {};
  const candidates = [];
  Object.entries(days).forEach(([dateKey, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey > throughDate || !day || typeof day !== "object") return;
    const record = day[subject];
    const units = record && Array.isArray(record.units) ? record.units : [];
    units.forEach((unit, index) => {
      const masteryMatch = String(unit && unit.mastery || "").match(/^L([0-5])$/);
      const reviewResult = String(unit && unit.reviewResult || "").trim();
      if (!masteryMatch || !reviewResult) return;
      const reviewRank = reviewResult === "通过" ? 2 : reviewResult === "部分通过" ? 1 : 0;
      candidates.push({
        subject,
        date: dateKey,
        updatedAt: String(unit.updatedAt || unit.createdAt || unit.savedAt || ""),
        index,
        strength: reviewRank * 10 + Number(masteryMatch[1]),
      });
    });
  });
  candidates.sort((left, right) => right.date.localeCompare(left.date)
    || right.updatedAt.localeCompare(left.updatedAt)
    || right.index - left.index);
  return candidates[0] || null;
}

function chooseRollingWeekWeakSubject(store, throughDate) {
  const assessment722 = getLatestRollingProfessionalAssessment(store, "722", throughDate);
  const assessment844 = getLatestRollingProfessionalAssessment(store, "844", throughDate);
  if (!assessment722 || !assessment844 || assessment722.strength === assessment844.strength) return null;
  return assessment722.strength < assessment844.strength ? "722" : "844";
}

function buildRollingWeekSubjectRoles(dates, professionalStore, throughDate) {
  const weakSubject = chooseRollingWeekWeakSubject(professionalStore, throughDate);
  let nextAlternatingSubject = weakSubject || "722";
  return dates.map((date) => {
    const isSunday = parseLocalPlanDate(date).getDay() === 0;
    const mainSubject = isSunday && weakSubject ? weakSubject : nextAlternatingSubject;
    const secondarySubject = mainSubject === "722" ? "844" : "722";
    if (!isSunday || !weakSubject) nextAlternatingSubject = secondarySubject;
    return {
      date,
      mainSubject,
      secondarySubject,
      reason: weakSubject ? (isSunday ? "weekly-weakness-review" : "assessment-first-alternation") : "balanced-alternation",
    };
  });
}

function getRollingWeekStudyRole(sourceTaskKey, roles) {
  if (sourceTaskKey === roles.mainSubject) return "main-professional";
  if (sourceTaskKey === roles.secondarySubject) return "retrieval-professional";
  if (sourceTaskKey === "outputOrMock") return "main-output";
  if (sourceTaskKey === "originalTextOrReview") return "spaced-review";
  return "core";
}

function formatRollingWeekTime(startMinutes, durationMinutes) {
  const format = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(startMinutes)}—${format(startMinutes + durationMinutes)}`;
}

function buildRollingWeekSchedule(roles, maxPlannedMinutes) {
  const safeMax = Math.max(60, Math.floor(Number(maxPlannedMinutes) || AI_ROLLING_STANDARD_MINUTES));
  if (safeMax >= AI_ROLLING_STANDARD_MINUTES) {
    return {
      profileId: "standard",
      plannedCoreMinutes: AI_ROLLING_STANDARD_MINUTES,
      times: {
        englishWords: AI_ROLLING_STANDARD_TIMES.englishWords,
        english: AI_ROLLING_STANDARD_TIMES.english,
        [roles.mainSubject]: AI_ROLLING_STANDARD_TIMES.mainProfessional,
        [roles.secondarySubject]: AI_ROLLING_STANDARD_TIMES.retrievalProfessional,
        originalTextOrReview: AI_ROLLING_STANDARD_TIMES.originalTextOrReview,
        politics: AI_ROLLING_STANDARD_TIMES.politics,
        outputOrMock: AI_ROLLING_STANDARD_TIMES.outputOrMock,
      },
    };
  }
  const plannedCoreMinutes = safeMax >= AI_ROLLING_FLOOR_MINUTES ? AI_ROLLING_FLOOR_MINUTES : safeMax;
  const vocabularyMinutes = Math.min(25, Math.max(0, plannedCoreMinutes - 60));
  const taskBudget = Math.max(60, plannedCoreMinutes - vocabularyMinutes);
  const keys = [roles.mainSubject, "english", "politics", "outputOrMock", roles.secondarySubject, "originalTextOrReview"];
  const desired = {
    [roles.mainSubject]: 90,
    english: 60,
    politics: 45,
    outputOrMock: 35,
    [roles.secondarySubject]: 30,
    originalTextOrReview: 15,
  };
  const durations = Object.fromEntries(keys.map((key) => [key, 10]));
  let remaining = taskBudget - 60;
  while (remaining > 0) {
    let changed = false;
    keys.forEach((key) => {
      if (remaining <= 0 || durations[key] >= desired[key]) return;
      const increment = Math.min(5, remaining, desired[key] - durations[key]);
      durations[key] += increment;
      remaining -= increment;
      changed = true;
    });
    if (!changed) break;
  }
  return {
    profileId: plannedCoreMinutes >= AI_ROLLING_FLOOR_MINUTES ? "floor" : "evidence-reduced",
    plannedCoreMinutes,
    times: {
      englishWords: formatRollingWeekTime(8 * 60, vocabularyMinutes),
      [roles.mainSubject]: formatRollingWeekTime(8 * 60 + 35, durations[roles.mainSubject]),
      [roles.secondarySubject]: formatRollingWeekTime(8 * 60 + 35 + durations[roles.mainSubject] + 15, durations[roles.secondarySubject]),
      politics: formatRollingWeekTime(14 * 60, durations.politics),
      english: formatRollingWeekTime(15 * 60 + 45, durations.english),
      outputOrMock: formatRollingWeekTime(19 * 60, durations.outputOrMock),
      originalTextOrReview: formatRollingWeekTime(20 * 60 + 20, durations.originalTextOrReview),
    },
  };
}

function getRollingWeekDates(startDate) {
  return Array.from({ length: 7 }, (_, index) => addLocalPlanDays(startDate, index));
}

function findLatestPlanTaskBySourceKey(plans, sourceTaskKey, throughDate) {
  return Object.entries(plans && typeof plans === "object" ? plans : {})
    .filter(([dateKey, day]) => dateKey <= throughDate && day && Array.isArray(day.tasks))
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([, day]) => day.tasks)
    .find((task) => getAiPlanTaskSourceKey(task) === sourceTaskKey) || null;
}

function buildRollingWeekTaskCandidates(day, phase, options = {}) {
  const plans = options.plans && typeof options.plans === "object" ? options.plans : {};
  const professionalStore = options.professionalStore && typeof options.professionalStore === "object" ? options.professionalStore : {};
  const reviews = Array.isArray(options.reviews) ? options.reviews : [];
  return (Array.isArray(day.tasks) ? day.tasks : []).flatMap((task) => {
    const sourceTaskKey = getAiPlanTaskSourceKey(task);
    if (!sourceTaskKey || sourceTaskKey === "training") return [];
    const latestTask = findLatestPlanTaskBySourceKey(plans, sourceTaskKey, options.throughDate || day.date) || {};
    const chapterTask = ["722", "844"].includes(sourceTaskKey)
      ? String(phase && phase.chapterTasks && phase.chapterTasks[sourceTaskKey] || "").trim() : "";
    const breakpoint = ["722", "844"].includes(sourceTaskKey)
      ? findLatestProfessionalBreakpoint(professionalStore, sourceTaskKey, options.throughDate || day.date) : null;
    const dueNames = sourceTaskKey === "originalTextOrReview"
      ? reviews.map((review) => String(review && (review.name || review.title || review.unitName) || "").trim()).filter(Boolean) : [];
    const originalDescription = dueNames.length
      ? `完成到期复盘：${dueNames.join("；")}`
      : chapterTask || String(task.description || latestTask.description || "").trim();
    if (!originalDescription) return [];
    const studyRole = getRollingWeekStudyRole(sourceTaskKey, options.roles);
    const description = studyRole === "retrieval-professional"
      ? `闭卷提取与纠错，不开启新范围：${originalDescription}`
      : studyRole === "main-professional"
        ? `当日主科推进：${originalDescription}`
        : studyRole === "main-output"
          ? `围绕当日主科${options.roles.mainSubject}完成：${originalDescription}`
          : originalDescription;
    const nextStart = String(breakpoint && breakpoint.nextStart || task.nextStart || latestTask.nextStart || originalDescription).trim();
    const originalCompletionCriteria = String(task.completionCriteria || latestTask.completionCriteria || phase && phase.acceptance || originalDescription).trim();
    const completionCriteria = studyRole === "retrieval-professional"
      ? `留下闭卷恢复内容、遗漏和下一准确起点；${originalCompletionCriteria}`
      : originalCompletionCriteria;
    const fallback = String(task.fallbackPlan || latestTask.fallbackPlan || "时间不足时保留真实未完成状态，并记录下一准确起点。").trim();
    return [{
      taskId: String(task.taskId || task.id || latestTask.taskId || latestTask.id || ""),
      sourceTaskKey,
      name: String(task.name || latestTask.name || sourceTaskKey),
      time: String(options.schedule && options.schedule.times && options.schedule.times[sourceTaskKey] || ""),
      description,
      nextStart,
      completionCriteria,
      fallback,
      studyRole,
      outputSubject: studyRole === "main-output" ? options.roles.mainSubject : "",
      requiredBasis: "phase-plan",
      planCandidates: [{ basis: "phase-plan", description, nextStart, completionCriteria, fallback }],
      protected: task.manualEdited === true || ["completed", "in-progress"].includes(String(task.status || "")) || task.completed === true,
    }];
  });
}

function buildAiRollingWeekPlanContext(options = {}) {
  const todayDate = String(options.todayDate || "");
  const importedPlan = options.importedPlan && typeof options.importedPlan === "object" ? options.importedPlan : {};
  const importedAt = String(importedPlan.importedAt || "").trim();
  const detailedPlanEnd = String(importedPlan.detailedPlanEnd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayDate)) throw new Error("当前日期无效。");
  if (!importedAt || !/^\d{4}-\d{2}-\d{2}$/.test(detailedPlanEnd)) throw new Error("请先导入总控计划，再生成下一轮7日计划。");
  const startDate = addLocalPlanDays(detailedPlanEnd, 1);
  const dates = getRollingWeekDates(startDate);
  const phaseTemplates = Array.isArray(options.phaseTemplates) ? options.phaseTemplates : [];
  const plans = options.plans && typeof options.plans === "object" ? options.plans : {};
  const reviewQueue = Array.isArray(options.reviewQueue) ? options.reviewQueue : [];
  const professionalStore = options.professionalStore && typeof options.professionalStore === "object" ? options.professionalStore : {};
  const history = Array.isArray(options.history) ? options.history : [];
  const phaseTargets = dates.map((date) => {
    const phase = findPhaseTemplateForDate(phaseTemplates, date);
    return Math.round(Math.max(0, Number(phase && phase.targetEffectiveStudyHours) || 0) * 60);
  }).filter((minutes) => minutes > 0);
  const originalTargetMinutes = phaseTargets.length ? Math.min(...phaseTargets) : 0;
  const capacityCalibration = buildRollingWeekCapacityCalibration(history, todayDate, originalTargetMinutes, { professionalStore });
  const subjectRoles = buildRollingWeekSubjectRoles(dates, professionalStore, todayDate);
  const days = dates.map((date, index) => {
    const phase = findPhaseTemplateForDate(phaseTemplates, date);
    if (!phase) throw new Error(`${date} 没有对应的阶段计划，不能生成逐日任务。`);
    const baseDay = materializeDayFromPhaseTemplate(date, phase);
    const reviews = reviewQueue.filter((review) => String(review && review.dueDate || "") === date && String(review && review.status || "pending") !== "completed");
    const roles = subjectRoles[index];
    const phaseTargetMinutes = Math.round(Math.max(0, Number(baseDay.targetEffectiveStudyHours) || 0) * 60);
    const maxPlannedMinutes = phaseTargetMinutes
      ? Math.min(phaseTargetMinutes, capacityCalibration.recommendedMaxMinutes)
      : capacityCalibration.recommendedMaxMinutes;
    const schedule = buildRollingWeekSchedule(roles, maxPlannedMinutes);
    const availableTasks = buildRollingWeekTaskCandidates(baseDay, phase, {
      plans, professionalStore, reviews, roles, schedule, throughDate: todayDate,
    });
    const availableTaskKeys = new Set(availableTasks.map((task) => task.sourceTaskKey));
    const missingCoreKeys = AI_ROLLING_REQUIRED_TASK_KEYS.filter((key) => !availableTaskKeys.has(key));
    if (missingCoreKeys.length) throw new Error(`${date} 缺少科学负荷核心任务：${missingCoreKeys.join("、")}，请先完善阶段模板。`);
    const requiredTaskKeys = [...AI_ROLLING_REQUIRED_TASK_KEYS];
    return {
      date,
      phaseId: String(phase.phaseId || ""),
      phaseName: String(phase.phaseName || ""),
      phaseGoal: String(phase.goal || ""),
      phaseAcceptance: String(phase.acceptance || ""),
      targetEffectiveStudyHours: Math.max(0, Number(baseDay.targetEffectiveStudyHours) || 0),
      reviewsDue: reviews,
      requiredTaskKeys,
      maxPlannedMinutes,
      loadProfile: {
        profileId: schedule.profileId,
        standardMinutes: capacityCalibration.standardMinutes,
        floorMinutes: capacityCalibration.floorMinutes,
        plannedCoreMinutes: schedule.plannedCoreMinutes,
        mainSubject: roles.mainSubject,
        secondarySubject: roles.secondarySubject,
        roleReason: roles.reason,
      },
      baseDay,
      availableTasks,
    };
  });
  return {
    schemaVersion: 1,
    startDate,
    endDate: dates.at(-1),
    sourcePlan: {
      planType: String(importedPlan.planType || ""),
      schemaVersion: Number(importedPlan.schemaVersion) || 0,
      planId: String(importedPlan.planId || ""),
      sourceDocumentTitle: String(importedPlan.sourceDocumentTitle || ""),
      importedAt,
      detailedPlanEnd,
    },
    capacityCalibration,
    days,
  };
}

function normalizeAiRollingWeekPlan(rawPlan, context) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) throw new Error("AI滚动计划不是有效对象。");
  if (Number(rawPlan.schemaVersion) !== 1 || rawPlan.startDate !== context.startDate || rawPlan.endDate !== context.endDate) {
    throw new Error("AI滚动计划版本或日期范围不正确。");
  }
  const rawDays = Array.isArray(rawPlan.days) ? rawPlan.days : [];
  if (rawDays.length !== 7) throw new Error("AI滚动计划必须完整包含7天。");
  const days = context.days.map((sourceDay, index) => {
    const rawDay = rawDays[index];
    if (!rawDay || rawDay.date !== sourceDay.date) throw new Error(`AI滚动计划缺少 ${sourceDay.date}。`);
    const scheduledTasks = (Array.isArray(rawDay.tasks) ? rawDay.tasks : []).map((task) => {
      const available = sourceDay.availableTasks.find((item) => item.sourceTaskKey === String(task && task.sourceTaskKey || ""));
      return available && available.time ? { ...task, time: available.time } : task;
    });
    const normalized = normalizeAiTomorrowPlan({
      schemaVersion: 1,
      date: rawDay.date,
      summary: rawDay.summary,
      tasks: scheduledTasks,
    }, {
      expectedDate: sourceDay.date,
      availableTasks: sourceDay.availableTasks,
      hasDueReviews: sourceDay.reviewsDue.length > 0,
      requiredTaskKeys: sourceDay.requiredTaskKeys,
      maxPlannedMinutes: sourceDay.maxPlannedMinutes,
    });
    return {
      ...normalized,
      phaseId: sourceDay.phaseId,
      phaseName: sourceDay.phaseName,
      loadProfile: { ...sourceDay.loadProfile },
    };
  });
  return { schemaVersion: 1, startDate: context.startDate, endDate: context.endDate, summary: String(rawPlan.summary || "").trim().slice(0, 500), days };
}

function mergeAiRollingWeekPlan(existingPlans, normalizedPlan, context, options = {}) {
  const generatedAt = String(options.generatedAt || new Date().toISOString());
  const planId = `rolling-week-${normalizedPlan.startDate}`;
  const sourceDocumentTitle = `AI滚动7日计划 ${normalizedPlan.startDate}—${normalizedPlan.endDate}`;
  const nextPlans = { ...(existingPlans && typeof existingPlans === "object" ? existingPlans : {}) };
  const protectedTasks = [];
  const updated = [];
  normalizedPlan.days.forEach((aiDay, index) => {
    const sourceDay = context.days[index];
    const existingDay = nextPlans[aiDay.date] && Array.isArray(nextPlans[aiDay.date].tasks)
      ? nextPlans[aiDay.date] : sourceDay.baseDay;
    const merged = mergeAiTomorrowPlan(existingDay, aiDay, { generatedAt });
    const availableByKey = new Map(sourceDay.availableTasks.map((task) => [task.sourceTaskKey, task]));
    const tasks = merged.day.tasks.map((task) => {
      const sourceTaskKey = getAiPlanTaskSourceKey(task);
      const available = availableByKey.get(sourceTaskKey);
      if (!available || task.manualEdited === true || ["completed", "in-progress"].includes(String(task.status || "")) || task.completed === true) return task;
      return {
        ...task,
        studyRole: available.studyRole,
        ...(available.outputSubject ? { outputSubject: available.outputSubject } : {}),
      };
    });
    nextPlans[aiDay.date] = {
      ...merged.day,
      tasks,
      template: "ai-rolling-week-v1",
      sourcePlanType: AI_ROLLING_WEEK_PLAN_TYPE,
      sourceSchemaVersion: AI_ROLLING_WEEK_SCHEMA_VERSION,
      sourcePlanId: planId,
      sourceDocumentTitle,
      phase: sourceDay.phaseName,
      phaseId: sourceDay.phaseId,
      targetEffectiveStudyHours: Math.round(Number(sourceDay.loadProfile.plannedCoreMinutes || 0) / 60 * 100) / 100,
      studyLoadProfile: { ...sourceDay.loadProfile },
    };
    protectedTasks.push(...merged.protectedTasks.map((task) => ({ ...task, date: aiDay.date })));
    updated.push(...merged.updated.map((task) => ({ ...task, date: aiDay.date })));
  });
  return {
    dailyPlans: nextPlans,
    updated,
    protectedTasks,
    metadata: {
      planType: AI_ROLLING_WEEK_PLAN_TYPE,
      schemaVersion: AI_ROLLING_WEEK_SCHEMA_VERSION,
      planId,
      startDate: normalizedPlan.startDate,
      endDate: normalizedPlan.endDate,
      sourceDocumentTitle,
      detailedPlanDates: normalizedPlan.days.map((day) => day.date),
      detailedPlanStart: normalizedPlan.startDate,
      detailedPlanEnd: normalizedPlan.endDate,
      importedAt: generatedAt,
      generatedAt,
      parentPlanType: context.sourcePlan.planType,
      parentPlanId: context.sourcePlan.planId,
    },
  };
}
