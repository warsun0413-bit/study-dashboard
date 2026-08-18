// P1 Checkpoint 5: pure weekly statistics and schema-2 snapshot derivation.
const P1_FINAL_MIGRATION_ID = "p1-final-integration-v1";
const P1_SNAPSHOT_SCHEMA_VERSION = 2;
const AUXILIARY_MANUAL_ACTIVITY_PATTERN = /(?:anki(?:制作|制卡|卡片制作|卡片整理)|制作anki|整理anki卡片|网站(?:维护|开发|优化)|数据整理|整理数据|提示词(?:优化|整理|编写)|编写提示词|文件整理|整理文件|工具(?:建设|维护|开发))/i;

function p1FinalObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function p1FinalArray(value) { return Array.isArray(value) ? value : []; }
function p1MeaningfulClosedBookText(value) {
  const text = String(value || "").trim().replace(/\s+/g, "");
  return Boolean(text) && !/^(无|没有|未做|未完成|未记录|否)$/.test(text);
}
function getDailyClosedBookGateStatus(input = {}, dateKey = getLocalPlanDateKey()) {
  const store = p1FinalObject(input.professionalStore) ? input.professionalStore : {};
  const days = p1FinalObject(store.days) ? store.days : {};
  const day = p1FinalObject(days[dateKey]) ? days[dateKey] : {};
  const professionalProducts = [];
  ["722", "844"].forEach((subject) => {
    const subjectRecord = p1FinalObject(day[subject]) ? day[subject] : {};
    p1FinalArray(subjectRecord.units).forEach((unit) => {
      if (!p1FinalObject(unit) || !String(unit.name || "").trim() || !String(unit.nextStart || "").trim()) return;
      const product = p1MeaningfulClosedBookText(unit.closedBookResult)
        ? "闭卷恢复"
        : p1MeaningfulClosedBookText(unit.writtenReconstruction) ? "纸上重构" : "";
      if (product) professionalProducts.push({ subject, product, name: String(unit.name).trim() });
    });
  });
  const outputProducts = p1FinalArray(input.outputRecords).filter((record) => record
    && record.date === dateKey
    && record.closedBook === true
    && Boolean(String(record.question || "").trim())
    && Boolean(String(record.structureResult || "").trim()));
  return {
    hasProduct: professionalProducts.length > 0 || outputProducts.length > 0,
    professionalProducts,
    outputProducts,
  };
}
function getCurrentDailyExecutionGap(items, options = {}) {
  if (options.blocked) return null;
  const nowMinutes = Number(options.nowMinutes);
  const gaps = p1FinalArray(items)
    .filter((item) => item
      && item.taskId
      && item.complete !== true
      && (nowMinutes >= Number(item.deadlineMinutes) || item.forceEligible === true))
    .sort((a, b) => Number(a.priority) - Number(b.priority)
      || Number(a.deadlineMinutes) - Number(b.deadlineMinutes)
      || String(a.key || "").localeCompare(String(b.key || "")));
  return gaps.length ? { ...gaps[0], remainingCount: gaps.length } : null;
}

function getAnchorAwareDailyExecutionGap(items, options = {}) {
  if (options.blocked) return null;
  const nowMinutes = Number(options.nowMinutes);
  const records = p1FinalArray(items).filter((item) => item && item.taskId && item.complete !== true);
  const anchorsByTaskId = new Map();
  [...records.filter((item) => item.isProtectedAnchor === true), ...p1FinalArray(options.anchors)]
    .filter((item) => item
      && item.taskId
      && item.complete !== true
      && Number.isFinite(Number(item.startMinutes))
      && Number.isFinite(Number(item.endMinutes)))
    .forEach((item) => anchorsByTaskId.set(String(item.taskId), item));
  const anchors = [...anchorsByTaskId.values()]
    .sort((left, right) => Number(left.startMinutes) - Number(right.startMinutes));
  const activeAnchor = anchors.find((item) => {
    const transitionMinutes = Math.max(0, Number(item.transitionMinutes) || 0);
    return nowMinutes >= Number(item.startMinutes) - transitionMinutes && nowMinutes < Number(item.endMinutes);
  });
  const eligibleGaps = records
    .filter((item) => nowMinutes >= Number(item.deadlineMinutes) || item.forceEligible === true)
    .sort((left, right) => Number(left.priority) - Number(right.priority)
      || Number(left.deadlineMinutes) - Number(right.deadlineMinutes)
      || String(left.key || "").localeCompare(String(right.key || "")));
  if (activeAnchor) {
    return {
      ...activeAnchor,
      anchorState: nowMinutes < Number(activeAnchor.startMinutes) ? "prepare" : "active",
      remainingCount: new Set([...eligibleGaps.map((item) => item.taskId), activeAnchor.taskId]).size,
    };
  }
  const nextAnchor = anchors.find((item) => {
    const transitionMinutes = Math.max(0, Number(item.transitionMinutes) || 0);
    return nowMinutes < Number(item.startMinutes) - transitionMinutes;
  });
  if (!nextAnchor) return eligibleGaps.length ? { ...eligibleGaps[0], remainingCount: eligibleGaps.length } : null;
  const anchorPreparationStart = Number(nextAnchor.startMinutes) - Math.max(0, Number(nextAnchor.transitionMinutes) || 0);
  const availableMinutes = anchorPreparationStart - nowMinutes;
  const fittingGaps = eligibleGaps.filter((item) => Math.max(1, Number(item.minimumBlockMinutes) || 5) <= availableMinutes);
  if (fittingGaps.length) return { ...fittingGaps[0], remainingCount: eligibleGaps.length };
  const minimumBlockMinutes = Math.max(1, Number(options.minimumBlockMinutes) || 5);
  if (availableMinutes < minimumBlockMinutes) {
    return {
      ...nextAnchor,
      anchorState: "upcoming",
      availableMinutes: Math.max(0, availableMinutes),
      remainingCount: new Set([...eligibleGaps.map((item) => item.taskId), nextAnchor.taskId]).size,
    };
  }
  return null;
}

function getNightExecutionState(items, options = {}) {
  if (options.blocked || Number(options.nowMinutes) < Number(options.cutoffMinutes)) return null;
  const records = p1FinalArray(items);
  const incomplete = (key) => records.find((item) => item && item.key === key && item.taskId && item.complete !== true) || null;
  const earliestProfessional = incomplete("722") || incomplete("844") || incomplete("closed-book");
  const dailyProduct = records.find((item) => item && item.key === "closed-book") || null;
  const professional = dailyProduct && dailyProduct.complete !== true ? earliestProfessional : null;
  const english = incomplete("english");
  const politics = incomplete("politics");
  const support = english || (!options.englishCompletedAfterCutoff ? politics : null);
  const selected = [professional, support].filter((item, index, source) => item
    && source.findIndex((candidate) => candidate && candidate.taskId === item.taskId) === index);
  if (Number(options.nowMinutes) >= Number(options.hardCutoffMinutes) || !selected.length) {
    return { mode: "closeout", items: [], current: null, remainingCount: 0 };
  }
  return { mode: "tasks", items: selected, current: selected[0], remainingCount: selected.length };
}
function manualStudyRecordText(record) { return `${record && record.taskId || ""} ${record && record.taskTitle || ""} ${record && record.note || ""}`.replace(/\s+/g, ""); }
function isAuxiliaryManualStudyRecord(record) { return AUXILIARY_MANUAL_ACTIVITY_PATTERN.test(manualStudyRecordText(record)); }
function p1FinalDateInRange(date, start, end) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && date >= start && date <= end; }
function getP1WeekRange(dateKey) {
  const date = parseLocalPlanDate(dateKey);
  const mondayOffset = (date.getDay() + 6) % 7;
  const start = addLocalPlanDays(dateKey, -mondayOffset);
  const end = addLocalPlanDays(start, 6);
  return { start, end, dates: Array.from({ length: 7 }, (_, index) => addLocalPlanDays(start, index)) };
}
function p1WeightedRate(records, correctField, totalField) {
  let correct = 0; let total = 0;
  p1FinalArray(records).forEach((record) => {
    const currentCorrect = record && record[correctField]; const currentTotal = record && record[totalField];
    if (Number.isInteger(currentCorrect) && Number.isInteger(currentTotal) && currentTotal > 0) { correct += currentCorrect; total += currentTotal; }
  });
  return { correct, total, rate: total > 0 ? correct / total : null };
}
function p1ValidManualRecord(record) {
  const text = manualStudyRecordText(record);
  return Number(record && record.durationSeconds) > 0 && !isAuxiliaryManualStudyRecord(record) && !/居家训练|训练|锻炼|午饭|午休|洗澡|吃饭|休息|睡觉/.test(text);
}
function getP1EffectiveSecondsByDate(input, date) {
  const focus = Math.max(0, Math.floor(Number(input.focusTotals && input.focusTotals[date]) || 0));
  const manualForDate = p1FinalArray(input.manualRecords).filter((record) => record && record.date === date);
  const manual = manualForDate.filter(p1ValidManualRecord).reduce((sum, record) => sum + Math.max(0, Math.floor(Number(record.durationSeconds) || 0)), 0);
  if (focus > 0 || manualForDate.length > 0) return focus + manual;
  const history = p1FinalArray(input.history).find((record) => record && record.date === date);
  return Math.max(0, Math.floor(Number(history && (history.totalStudySeconds ?? history.totalFocusSeconds ?? history.focusSeconds)) || 0));
}
function p1FormalProfessionalUnits(store, range) {
  const days = p1FinalObject(store && store.days) ? store.days : {};
  const units = [];
  Object.entries(days).forEach(([date, day]) => {
    if (!p1FinalDateInRange(date, range.start, range.end) || !p1FinalObject(day)) return;
    ["722", "844"].forEach((subject) => {
      const subjectData = day[subject];
      p1FinalArray(subjectData && subjectData.units).forEach((unit) => {
        const formal = unit && (unit.reviewResult || unit.result || unit.acceptanceResult);
        if (formal && !["未验收", "unverified", "pending"].includes(formal)) units.push({ ...unit, subject, date });
      });
    });
  });
  return units;
}
function p1ReviewCompletedDate(review) { return String(review && (review.completedDate || review.completedAt || "")).slice(0, 10); }
function buildP1WeeklyStats(input = {}, dateKey = getLocalPlanDateKey()) {
  const range = getP1WeekRange(dateKey);
  const within = (record) => record && p1FinalDateInRange(record.date, range.start, range.end);
  const wordRecords = p1FinalArray(input.wordRecords).filter(within);
  const readingRecords = p1FinalArray(input.readingRecords).filter(within);
  const politicsRecords = p1FinalArray(input.politicsRecords).filter(within);
  const outputRecords = p1FinalArray(input.outputRecords).filter(within);
  const reviews = p1FinalArray(input.reviewQueue);
  const validD1 = reviews.filter((review) => review && review.reviewLevel === "D1" && review.status !== "cancelled" && !review.duplicateOf && p1FinalDateInRange(review.dueDate, range.start, range.end));
  const completedD1 = validD1.filter((review) => review.status === "completed");
  const readingAccuracy = p1WeightedRate(readingRecords, "correctCount", "totalQuestions");
  const politicsSingle = p1WeightedRate(politicsRecords, "singleChoiceCorrect", "singleChoiceTotal");
  const politicsMultiple = p1WeightedRate(politicsRecords, "multipleChoiceCorrect", "multipleChoiceTotal");
  const politicsTotal = {
    correct: politicsSingle.correct + politicsMultiple.correct,
    total: politicsSingle.total + politicsMultiple.total,
  };
  politicsTotal.rate = politicsTotal.total > 0 ? politicsTotal.correct / politicsTotal.total : null;
  const errorCodes = Object.fromEntries(["K", "M", "L", "W", "C", "G"].map((code) => [code, politicsRecords.reduce((sum, record) => sum + Math.max(0, Number(record.errorCodes && record.errorCodes[code]) || 0), 0)]));
  const readingErrors = {};
  readingRecords.forEach((record) => p1FinalArray(record.errorTypes).forEach((type) => { readingErrors[type] = (readingErrors[type] || 0) + 1; }));
  const outputByType = Object.fromEntries(["level1-outline", "detailed-outline", "core-paragraph", "full-essay", "mock"].map((type) => [type, outputRecords.filter((record) => record.outputType === type).length]));
  const formalUnits = p1FormalProfessionalUnits(input.professionalStore, range);
  const masteryDenominator = formalUnits.filter((unit) => /^L[0-5]$/.test(String(unit.mastery || unit.masteryLevel || "")));
  const plans = p1FinalObject(input.dailyPlans) ? input.dailyPlans : {};
  let planned = 0; let completed = 0; let trainingPlanned = 0; let trainingCompleted = 0;
  range.dates.forEach((date) => p1FinalArray(plans[date] && plans[date].tasks).forEach((task) => {
    if (task && task.exercise === true) { trainingPlanned += 1; if (task.status === "completed" || task.completed === true) trainingCompleted += 1; return; }
    if (!task || task.counted !== true || ["skipped", "cancelled"].includes(task.status)) return;
    planned += 1; if (task.status === "completed" || task.completed === true) completed += 1;
  }));
  const dailySeconds = Object.fromEntries(range.dates.map((date) => [date, getP1EffectiveSecondsByDate(input, date)]));
  const effectiveDays = Object.values(dailySeconds).filter((seconds) => seconds > 0).length;
  const totalEffectiveSeconds = Object.values(dailySeconds).reduce((sum, seconds) => sum + seconds, 0);
  const formalResultCount = wordRecords.length + readingRecords.length + politicsRecords.length + outputRecords.length + formalUnits.length;
  const warnings = [];
  if (totalEffectiveSeconds > 0 && formalResultCount === 0) warnings.push("本周已有学习时间，但未保存英语、政治或专业课正式结果");
  if (politicsTotal.total > 0 && politicsTotal.rate < 0.6) warnings.push("政治总正确率低于60%");
  if (readingAccuracy.total > 0 && readingAccuracy.rate < 0.6) warnings.push("英语阅读正确率低于60%");
  return {
    schemaVersion: 1, range, generatedFor: dateKey,
    effectiveStudy: { dailySeconds, totalSeconds: totalEffectiveSeconds, effectiveDays, averageSeconds: effectiveDays ? Math.floor(totalEffectiveSeconds / effectiveDays) : 0 },
    plan: { completed, denominator: planned, completionRate: planned ? completed / planned : null },
    professional: { formalUnits: formalUnits.length, l2OrL3: masteryDenominator.filter((unit) => ["L2", "L3"].includes(unit.mastery || unit.masteryLevel)).length, l2OrL3Rate: masteryDenominator.length ? masteryDenominator.filter((unit) => ["L2", "L3"].includes(unit.mastery || unit.masteryLevel)).length / masteryDenominator.length : null },
    reviews: { d1Completed: completedD1.length, d1Due: validD1.length, d1CompletionRate: validD1.length ? completedD1.length / validD1.length : null, overdue: reviews.filter((review) => review && review.status === "pending" && review.dueDate < dateKey && !review.duplicateOf).length },
    english: { wordDays: new Set(wordRecords.map((record) => record.date)).size, wordReviewsCompleted: wordRecords.filter((record) => record.reviewCompleted).length, readingCount: readingRecords.length, readingAccuracy, errorTypes: readingErrors },
    politics: { recordCount: politicsRecords.length, single: politicsSingle, multiple: politicsMultiple, total: politicsTotal, errorCodes },
    output: { total: outputRecords.length, byType: outputByType, closedBook: outputRecords.filter((record) => record.closedBook).length, originalUsed: outputRecords.filter((record) => record.originalTextUsage && record.originalTextUsage !== "none").length, pendingRewrite: outputRecords.filter((record) => record.rewriteRequired && record.reviewStatus !== "passed").length },
    training: { completed: trainingCompleted, planned: trainingPlanned },
    warnings,
  };
}

function buildP1TodaySnapshot(input = {}) {
  const base = buildP0TodaySnapshot(input);
  const date = base.date;
  const current = (records) => p1FinalArray(records).filter((record) => record && record.date === date);
  return {
    ...base, schemaVersion: P1_SNAPSHOT_SCHEMA_VERSION,
    english: { words: current(input.wordRecords), reading: current(input.readingRecords) },
    politics: current(input.politicsRecords), outputs: current(input.outputRecords),
  };
}

function buildP1ControlMarkdown(snapshot) {
  const base = buildP0ControlMarkdown(snapshot);
  const reading = p1FinalArray(snapshot && snapshot.english && snapshot.english.reading);
  const politics = p1FinalArray(snapshot && snapshot.politics);
  const outputs = p1FinalArray(snapshot && snapshot.outputs);
  return `${base}\n英语单词实际：${snapshot && snapshot.english && snapshot.english.words.length ? snapshot.english.words.length + "条" : "未记录"}\n英语阅读实际：${reading.length ? reading.length + "篇" : "未记录"}\n政治实际：${politics.length ? politics.length + "条" : "未记录"}\n专业课输出：${outputs.length ? outputs.length + "条" : "未记录"}`;
}
