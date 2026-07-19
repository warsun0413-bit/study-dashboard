// P1 Checkpoint 5: pure weekly statistics and schema-2 snapshot derivation.
const P1_FINAL_MIGRATION_ID = "p1-final-integration-v1";
const P1_SNAPSHOT_SCHEMA_VERSION = 2;

function p1FinalObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function p1FinalArray(value) { return Array.isArray(value) ? value : []; }
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
  const text = `${record && record.taskId || ""} ${record && record.taskTitle || ""}`;
  return Number(record && record.durationSeconds) > 0 && !/居家训练|训练|锻炼|午饭|午休|洗澡|吃饭|休息|睡觉/.test(text);
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
  const modes = executionModeStore(input.executionModes);
  const modeCounts = Object.fromEntries(EXECUTION_MODES.map((mode) => [mode, range.dates.filter((date) => modes.days[date] && modes.days[date].mode === mode).length]));
  const activeDebts = p1FinalArray(input.debtQueue).map((debt) => normalizeDebt(debt, dateKey)).filter((debt) => !["completed", "cancelled"].includes(debt.status));
  const warnings = [];
  if (activeDebts.some((debt) => debt.ageDays > 3)) warnings.push("存在超过3天的当前欠账");
  if (modeCounts.minimum >= 2) warnings.push("本周至少两天使用保底模式");
  if (politicsTotal.total > 0 && politicsTotal.rate < 0.6) warnings.push("政治总正确率低于60%");
  if (readingAccuracy.total > 0 && readingAccuracy.rate < 0.6) warnings.push("英语阅读正确率低于60%");
  return {
    schemaVersion: 1, range, generatedFor: dateKey,
    effectiveStudy: { dailySeconds, totalSeconds: Object.values(dailySeconds).reduce((sum, seconds) => sum + seconds, 0), effectiveDays, averageSeconds: effectiveDays ? Math.floor(Object.values(dailySeconds).reduce((sum, seconds) => sum + seconds, 0) / effectiveDays) : 0 },
    plan: { completed, denominator: planned, completionRate: planned ? completed / planned : null },
    professional: { formalUnits: formalUnits.length, l2OrL3: masteryDenominator.filter((unit) => ["L2", "L3"].includes(unit.mastery || unit.masteryLevel)).length, l2OrL3Rate: masteryDenominator.length ? masteryDenominator.filter((unit) => ["L2", "L3"].includes(unit.mastery || unit.masteryLevel)).length / masteryDenominator.length : null },
    reviews: { d1Completed: completedD1.length, d1Due: validD1.length, d1CompletionRate: validD1.length ? completedD1.length / validD1.length : null, overdue: reviews.filter((review) => review && review.status === "pending" && review.dueDate < dateKey && !review.duplicateOf).length },
    english: { wordDays: new Set(wordRecords.map((record) => record.date)).size, wordReviewsCompleted: wordRecords.filter((record) => record.reviewCompleted).length, readingCount: readingRecords.length, readingAccuracy, errorTypes: readingErrors },
    politics: { recordCount: politicsRecords.length, single: politicsSingle, multiple: politicsMultiple, total: politicsTotal, errorCodes },
    output: { total: outputRecords.length, byType: outputByType, closedBook: outputRecords.filter((record) => record.closedBook).length, originalUsed: outputRecords.filter((record) => record.originalTextUsage && record.originalTextUsage !== "none").length, pendingRewrite: outputRecords.filter((record) => record.rewriteRequired && record.reviewStatus !== "passed").length },
    training: { completed: trainingCompleted, planned: trainingPlanned },
    execution: { modeCounts, activeDebt: activeDebts.length, overThreeDays: activeDebts.filter((debt) => debt.ageDays > 3).length },
    warnings,
  };
}

function buildP1TodaySnapshot(input = {}) {
  const base = buildP0TodaySnapshot(input);
  const date = base.date;
  const current = (records) => p1FinalArray(records).filter((record) => record && record.date === date);
  const anki = p1FinalArray(input.ankiCandidates);
  const debts = p1FinalArray(input.debtQueue).map((debt) => normalizeDebt(debt, date)).filter((debt) => !["completed", "cancelled"].includes(debt.status));
  return {
    ...base, schemaVersion: P1_SNAPSHOT_SCHEMA_VERSION,
    english: { words: current(input.wordRecords), reading: current(input.readingRecords) },
    politics: current(input.politicsRecords), outputs: current(input.outputRecords),
    anki: { pending: anki.filter((card) => card && card.status === "candidate").length, approved: anki.filter((card) => card && card.status === "approved").length },
    execution: { mode: executionModeStore(input.executionModes).days[date] && executionModeStore(input.executionModes).days[date].mode || "normal", activeDebt: debts.length, overThreeDays: debts.filter((debt) => debt.ageDays > 3).length },
  };
}

function buildP1ControlMarkdown(snapshot) {
  const base = buildP0ControlMarkdown(snapshot);
  const missing = (value) => value === null || value === undefined || value === "" ? "未记录" : value;
  const reading = p1FinalArray(snapshot && snapshot.english && snapshot.english.reading);
  const politics = p1FinalArray(snapshot && snapshot.politics);
  const outputs = p1FinalArray(snapshot && snapshot.outputs);
  return `${base}\n英语单词实际：${snapshot && snapshot.english && snapshot.english.words.length ? snapshot.english.words.length + "条" : "未记录"}\n英语阅读实际：${reading.length ? reading.length + "篇" : "未记录"}\n政治实际：${politics.length ? politics.length + "条" : "未记录"}\n专业课输出：${outputs.length ? outputs.length + "条" : "未记录"}\n执行模式：${missing(snapshot && snapshot.execution && snapshot.execution.mode)}\n当前欠账：${snapshot && snapshot.execution ? snapshot.execution.activeDebt : "未记录"}\nAnki待审核：${snapshot && snapshot.anki ? snapshot.anki.pending : "未记录"}`;
}
