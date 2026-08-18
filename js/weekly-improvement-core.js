// Rolling seven-day learning diagnosis. All functions are pure and never write learning data.
const WEEKLY_IMPROVEMENT_SCHEMA_VERSION = 1;
const WEEKLY_IMPROVEMENT_MIN_FORMAL_DAYS = 3;
const WEEKLY_IMPROVEMENT_RATE_DELTA = 0.05;

function weeklyImprovementArray(value) { return Array.isArray(value) ? value : []; }
function weeklyImprovementObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function weeklyImprovementDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""; }
function weeklyImprovementAddDays(dateKey, offset) {
  if (typeof addLocalPlanDays === "function") return addLocalPlanDays(dateKey, offset);
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  const date = new Date(year, month - 1, day + offset, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function buildWeeklyImprovementRange(endDate, offsetDays = 0) {
  const end = weeklyImprovementAddDays(endDate, offsetDays);
  const start = weeklyImprovementAddDays(end, -6);
  return { start, end, dates: Array.from({ length: 7 }, (_, index) => weeklyImprovementAddDays(start, index)) };
}
function weeklyImprovementInRange(date, range) {
  const key = weeklyImprovementDate(date);
  return Boolean(key && key >= range.start && key <= range.end);
}
function weeklyImprovementMedian(values) {
  const sorted = weeklyImprovementArray(values).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function weeklyImprovementWeightedRate(records, correctField, totalField) {
  return weeklyImprovementArray(records).reduce((result, record) => {
    const correct = record && record[correctField];
    const total = record && record[totalField];
    if (Number.isInteger(correct) && Number.isInteger(total) && total > 0 && correct >= 0 && correct <= total) {
      result.correct += correct;
      result.total += total;
    }
    result.rate = result.total > 0 ? result.correct / result.total : null;
    return result;
  }, { correct: 0, total: 0, rate: null });
}
function weeklyImprovementHasValidScore(record, fieldPairs) {
  return weeklyImprovementArray(fieldPairs).some(([correctField, totalField]) => {
    const correct = record && record[correctField];
    const total = record && record[totalField];
    return Number.isInteger(correct) && Number.isInteger(total) && total > 0 && correct >= 0 && correct <= total;
  });
}
function weeklyImprovementMaxContinuityDays(records, range) {
  const recordedDates = new Set(weeklyImprovementArray(records)
    .map((record) => weeklyImprovementDate(record && record.date))
    .filter((date) => date && weeklyImprovementInRange(date, range)));
  let longest = 0;
  let current = 0;
  range.dates.forEach((date) => {
    current = recordedDates.has(date) ? current + 1 : 0;
    longest = Math.max(longest, current);
  });
  return longest;
}
function weeklyImprovementMeaningfulText(value) {
  const text = String(value || "").trim().replace(/\s+/g, "");
  return Boolean(text && !/^(?:无|没有|未做|未完成|未记录|未填写|暂无|否)$/i.test(text));
}
function weeklyImprovementFormalResult(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["通过", "passed", "pass"].includes(text)) return "passed";
  if (["部分通过", "partial", "partially-passed"].includes(text)) return "partial";
  if (["未通过", "failed", "fail"].includes(text)) return "failed";
  return "unverified";
}

function auditWeeklyImprovementHistory(history, range) {
  const grouped = new Map();
  const exclusions = [];
  weeklyImprovementArray(history).forEach((record) => {
    const date = weeklyImprovementDate(record && record.date);
    if (!date) return;
    if (date > range.end) {
      exclusions.push({ date, reason: "future-record" });
      return;
    }
    if (!weeklyImprovementInRange(date, range)) return;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(record);
  });
  const evidence = [];
  [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([date, records]) => {
    if (records.length !== 1) {
      exclusions.push({ date, reason: "duplicate-date" });
      return;
    }
    const record = records[0];
    const audit = typeof auditRollingCapacityRecord === "function"
      ? auditRollingCapacityRecord(record)
      : (!record || record.recordSchemaVersion !== 2 || record.manualRecordsSaved !== true
        ? { valid: false, reason: "unverified-record-schema" }
        : (!Number.isInteger(record.totalStudySeconds) || record.totalStudySeconds <= 0 || record.totalStudySeconds > 86400
          ? { valid: false, reason: "invalid-study-time" }
          : (!Number.isInteger(record.completionDone) || !Number.isInteger(record.completionTotal)
            || record.completionTotal <= 0 || record.completionDone < 0 || record.completionDone > record.completionTotal
            ? { valid: false, reason: "invalid-completion-facts" }
            : { valid: true, totalStudySeconds: record.totalStudySeconds, completionDone: record.completionDone, completionTotal: record.completionTotal })));
    if (!audit.valid) exclusions.push({ date, reason: audit.reason });
    else evidence.push({ date, record, ...audit });
  });
  const exclusionReasonCounts = exclusions.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});
  return { evidence, evidenceDays: evidence.length, excludedDays: exclusions.length, exclusions, exclusionReasonCounts };
}

function weeklyImprovementEffectiveSeconds(input, date) {
  if (typeof getP1EffectiveSecondsByDate === "function") return getP1EffectiveSecondsByDate(input, date);
  const focus = Math.max(0, Math.floor(Number(input.focusTotals && input.focusTotals[date]) || 0));
  const manual = weeklyImprovementArray(input.manualRecords)
    .filter((record) => record && record.date === date && Number(record.durationSeconds) > 0)
    .reduce((sum, record) => sum + Math.floor(Number(record.durationSeconds) || 0), 0);
  if (focus > 0 || manual > 0) return focus + manual;
  const history = weeklyImprovementArray(input.history).find((record) => record && record.date === date);
  return Math.max(0, Math.floor(Number(history && history.totalStudySeconds) || 0));
}

function collectWeeklyImprovementProfessionalUnits(store, range) {
  const days = weeklyImprovementObject(weeklyImprovementObject(store).days);
  const units = [];
  Object.entries(days).forEach(([date, day]) => {
    if (!weeklyImprovementInRange(date, range)) return;
    ["722", "844"].forEach((subject) => {
      weeklyImprovementArray(day && day[subject] && day[subject].units).forEach((unit) => {
        const result = weeklyImprovementFormalResult(unit && (unit.reviewResult || unit.result || unit.acceptanceResult));
        if (result !== "unverified") units.push({ ...unit, date, subject, normalizedResult: result });
      });
    });
  });
  return units;
}

function collectWeeklyImprovementReviews(reviewQueue, range) {
  const d1 = weeklyImprovementArray(reviewQueue).filter((review) => review
    && review.reviewLevel === "D1"
    && review.status !== "cancelled"
    && !review.duplicateOf
    && weeklyImprovementInRange(review.dueDate, range));
  const completed = d1.filter((review) => {
    const completedDate = weeklyImprovementDate(String(review.completedDate || review.completedAt || "").slice(0, 10));
    return review.status === "completed" && Boolean(completedDate && completedDate <= range.end);
  });
  const overdue = weeklyImprovementArray(reviewQueue).filter((review) => {
    if (!review || review.status === "cancelled" || review.duplicateOf) return false;
    const dueDate = weeklyImprovementDate(review.dueDate);
    if (!dueDate || dueDate >= range.end) return false;
    const completedDate = weeklyImprovementDate(String(review.completedDate || review.completedAt || "").slice(0, 10));
    return review.status !== "completed" || !completedDate || completedDate > range.end;
  });
  return { d1Due: d1.length, d1Completed: completed.length, d1CompletionRate: d1.length ? completed.length / d1.length : null, overdue: overdue.length };
}

function buildWeeklyImprovementMetrics(input = {}, range) {
  const historyAudit = auditWeeklyImprovementHistory(input.history, range);
  const effectiveByDate = Object.fromEntries(range.dates.map((date) => [date, weeklyImprovementEffectiveSeconds(input, date)]));
  const effectiveStudyDays = Object.values(effectiveByDate).filter((seconds) => seconds > 0).length;
  const targetRatios = historyAudit.evidence.map(({ record }) => {
    const target = record.executionTargetSeconds ?? record.dailyStudyTargetSeconds;
    return Number.isInteger(target) && target > 0 && target <= 86400 ? record.totalStudySeconds / target : null;
  }).filter(Number.isFinite);
  const completionDone = historyAudit.evidence.reduce((sum, item) => sum + item.completionDone, 0);
  const completionTotal = historyAudit.evidence.reduce((sum, item) => sum + item.completionTotal, 0);

  const readingRecords = weeklyImprovementArray(input.readingRecords).filter((record) => record && weeklyImprovementInRange(record.date, range));
  const politicsRecords = weeklyImprovementArray(input.politicsRecords).filter((record) => record && weeklyImprovementInRange(record.date, range));
  const outputRecords = weeklyImprovementArray(input.outputRecords).filter((record) => record && weeklyImprovementInRange(record.date, range));
  const wordRecords = weeklyImprovementArray(input.wordRecords).filter((record) => record && weeklyImprovementInRange(record.date, range));
  const professionalUnits = collectWeeklyImprovementProfessionalUnits(input.professionalStore, range);
  const readingAccuracy = weeklyImprovementWeightedRate(readingRecords, "correctCount", "totalQuestions");
  const scoredReadingRecords = readingRecords.filter((record) => weeklyImprovementHasValidScore(record, [["correctCount", "totalQuestions"]]));
  const scoredPoliticsRecords = politicsRecords.filter((record) => weeklyImprovementHasValidScore(record, [
    ["singleChoiceCorrect", "singleChoiceTotal"], ["multipleChoiceCorrect", "multipleChoiceTotal"],
  ]));
  const politicsSingle = weeklyImprovementWeightedRate(politicsRecords, "singleChoiceCorrect", "singleChoiceTotal");
  const politicsMultiple = weeklyImprovementWeightedRate(politicsRecords, "multipleChoiceCorrect", "multipleChoiceTotal");
  const politicsAccuracy = {
    correct: politicsSingle.correct + politicsMultiple.correct,
    total: politicsSingle.total + politicsMultiple.total,
  };
  politicsAccuracy.rate = politicsAccuracy.total ? politicsAccuracy.correct / politicsAccuracy.total : null;
  const closedBookDates = new Set();
  professionalUnits.forEach((unit) => {
    if (weeklyImprovementMeaningfulText(unit.closedBookResult) || weeklyImprovementMeaningfulText(unit.writtenReconstruction)) closedBookDates.add(unit.date);
  });
  outputRecords.forEach((record) => {
    if (record.closedBook === true && weeklyImprovementMeaningfulText(record.question) && weeklyImprovementMeaningfulText(record.structureResult)) closedBookDates.add(record.date);
  });
  const reviews = collectWeeklyImprovementReviews(input.reviewQueue, range);
  const professionalBySubject = { "722": 0, "844": 0 };
  const professionalResults = { passed: 0, partial: 0, failed: 0 };
  professionalUnits.forEach((unit) => {
    professionalBySubject[unit.subject] += 1;
    professionalResults[unit.normalizedResult] += 1;
  });
  const formalResultCount = wordRecords.length + readingRecords.length + politicsRecords.length + outputRecords.length + professionalUnits.length;
  return {
    execution: {
      effectiveStudyDays,
      effectiveStudySeconds: Object.values(effectiveByDate).reduce((sum, seconds) => sum + seconds, 0),
      validFormalDays: historyAudit.evidenceDays,
      excludedDays: historyAudit.excludedDays,
      medianStudyMinutes: weeklyImprovementMedian(historyAudit.evidence.map((item) => item.totalStudySeconds / 60)),
      targetAttainmentMedian: weeklyImprovementMedian(targetRatios),
      targetEvidenceDays: targetRatios.length,
      planCompletionRate: completionTotal ? completionDone / completionTotal : null,
      completionDone,
      completionTotal,
    },
    output: {
      formalResultCount,
      professionalUnits: professionalUnits.length,
      professionalBySubject,
      professionalResults,
      closedBookEvidenceDays: closedBookDates.size,
      professionalOutputs: outputRecords.length,
    },
    retention: reviews,
    quality: {
      englishReadingCount: scoredReadingRecords.length,
      englishRecordDays: new Set(readingRecords.map((record) => record.date)).size,
      englishContinuityDays: weeklyImprovementMaxContinuityDays(readingRecords, range),
      englishAccuracy: readingAccuracy.rate,
      englishCorrect: readingAccuracy.correct,
      englishQuestions: readingAccuracy.total,
      englishEligible: scoredReadingRecords.length >= 2 && readingAccuracy.total >= 10,
      politicsRecordCount: scoredPoliticsRecords.length,
      politicsRecordDays: new Set(politicsRecords.map((record) => record.date)).size,
      politicsContinuityDays: weeklyImprovementMaxContinuityDays(politicsRecords, range),
      politicsAccuracy: politicsAccuracy.rate,
      politicsCorrect: politicsAccuracy.correct,
      politicsQuestions: politicsAccuracy.total,
      politicsEligible: scoredPoliticsRecords.length >= 2 && politicsAccuracy.total >= 20,
      professionalEligible: professionalUnits.length >= 2,
      d1Eligible: reviews.d1Due >= 2,
    },
    evidence: {
      status: historyAudit.evidenceDays >= WEEKLY_IMPROVEMENT_MIN_FORMAL_DAYS ? "sufficient" : "insufficient-data",
      exclusions: historyAudit.exclusions,
      exclusionReasonCounts: historyAudit.exclusionReasonCounts,
    },
  };
}

function weeklyImprovementMetric(metrics, path) {
  return String(path || "").split(".").reduce((value, key) => value && value[key], metrics);
}
function buildWeeklyImprovementTrends(current, previous) {
  const paths = [
    "execution.effectiveStudyDays", "execution.medianStudyMinutes", "execution.targetAttainmentMedian", "execution.planCompletionRate",
    "output.formalResultCount", "output.closedBookEvidenceDays", "retention.d1CompletionRate", "retention.overdue",
    "quality.englishAccuracy", "quality.politicsAccuracy", "output.professionalBySubject.722", "output.professionalBySubject.844",
  ];
  return Object.fromEntries(paths.map((path) => {
    const currentValue = weeklyImprovementMetric(current, path);
    const previousValue = weeklyImprovementMetric(previous, path);
    const comparable = Number.isFinite(currentValue) && Number.isFinite(previousValue);
    return [path, { current: Number.isFinite(currentValue) ? currentValue : null, previous: Number.isFinite(previousValue) ? previousValue : null, delta: comparable ? currentValue - previousValue : null, comparable }];
  }));
}

function chooseWeeklyImprovementDiagnosis(metrics) {
  const sufficient = metrics.evidence.status === "sufficient";
  if (!sufficient) {
    return {
      id: "evidence-accumulation", label: "先补足可判断的正式记录", targetMetric: "execution.validFormalDays", targetDirection: "up", targetDelta: 1,
      evidence: [`最近7天只有${metrics.execution.validFormalDays}个有效正式日，至少需要3日才判断趋势。`],
      action: "连续3个学习日完成一键收工，并至少保存1项正式学习结果。",
    };
  }
  if (metrics.execution.effectiveStudyDays >= 3 && metrics.output.formalResultCount === 0) {
    return {
      id: "formal-evidence", label: "学习时间尚未转化为正式结果", targetMetric: "output.formalResultCount", targetDirection: "up", targetDelta: 1,
      evidence: [`已有${metrics.execution.effectiveStudyDays}个学习日，但正式学习结果为0。`],
      action: "未来7天每天结束核心任务后，至少保存1项英语、政治或专业课正式结果。",
    };
  }
  if (metrics.retention.overdue > 0 || (metrics.quality.d1Eligible && metrics.retention.d1CompletionRate < 0.8)) {
    const hasOverdue = metrics.retention.overdue > 0;
    return {
      id: "review-recovery", label: "到期复盘没有及时闭环",
      targetMetric: hasOverdue ? "retention.overdue" : "retention.d1CompletionRate", targetDirection: hasOverdue ? "down" : "up", targetDelta: hasOverdue ? 1 : WEEKLY_IMPROVEMENT_RATE_DELTA,
      evidence: hasOverdue
        ? [`截止本窗口仍有${metrics.retention.overdue}项逾期复盘。`]
        : [`D1完成${metrics.retention.d1Completed}/${metrics.retention.d1Due}，低于80%执行线。`],
      action: `先处理${Math.max(1, metrics.retention.overdue)}项逾期复盘；每天在复盘预算内完成到期D1并留下三行闭卷证据。`,
    };
  }
  if (metrics.output.closedBookEvidenceDays === 0 && (metrics.output.professionalUnits > 0 || metrics.output.professionalOutputs > 0 || metrics.execution.effectiveStudyDays >= 3)) {
    return {
      id: "closed-book-output", label: "专业课缺少闭卷产物", targetMetric: "output.closedBookEvidenceDays", targetDirection: "up", targetDelta: 1,
      evidence: ["最近7天没有形成可核验的闭卷恢复、纸上重构或闭卷输出。"],
      action: "未来7天至少保存3天专业课闭卷恢复或纸上重构，并记录下一准确起点。",
    };
  }
  if (metrics.execution.targetEvidenceDays >= 3
    && Number.isFinite(metrics.execution.planCompletionRate) && metrics.execution.planCompletionRate < 0.7
    && Number.isFinite(metrics.execution.targetAttainmentMedian) && metrics.execution.targetAttainmentMedian < 0.8) {
    return {
      id: "capacity-mismatch", label: "计划负荷持续高于真实承载", targetMetric: "execution.targetAttainmentMedian", targetDirection: "up", targetDelta: WEEKLY_IMPROVEMENT_RATE_DELTA,
      evidence: [`任务完成率${Math.round(metrics.execution.planCompletionRate * 100)}%，执行目标达成中位数${Math.round(metrics.execution.targetAttainmentMedian * 100)}%。`],
      action: "下一轮不扩量；按真实承载上限执行，先把核心任务完成率稳定到80%。",
    };
  }
  if (metrics.quality.englishEligible && metrics.quality.englishAccuracy < 0.6) {
    return {
      id: "english-reading", label: "英语阅读正式样本正确率偏低", targetMetric: "quality.englishAccuracy", targetEvidenceMetric: "quality.englishEligible", targetDirection: "up", targetDelta: WEEKLY_IMPROVEMENT_RATE_DELTA,
      evidence: [`${metrics.quality.englishReadingCount}篇、${metrics.quality.englishQuestions}题的加权正确率为${Math.round(metrics.quality.englishAccuracy * 100)}%。`],
      action: "未来7天完成至少3次正式阅读复盘，每次保留题数、正确数、错因和下一步。",
    };
  }
  if (metrics.quality.politicsEligible && metrics.quality.politicsAccuracy < 0.6) {
    return {
      id: "politics-accuracy", label: "政治选择题正式样本正确率偏低", targetMetric: "quality.politicsAccuracy", targetEvidenceMetric: "quality.politicsEligible", targetDirection: "up", targetDelta: WEEKLY_IMPROVEMENT_RATE_DELTA,
      evidence: [`${metrics.quality.politicsRecordCount}次、${metrics.quality.politicsQuestions}题的加权正确率为${Math.round(metrics.quality.politicsAccuracy * 100)}%。`],
      action: "未来7天完成至少3次政治正式训练，每次记录题量、正确数、错误代码和薄弱点。",
    };
  }
  if (metrics.quality.professionalEligible && (metrics.output.professionalBySubject["722"] === 0 || metrics.output.professionalBySubject["844"] === 0)) {
    const weakSubject = metrics.output.professionalBySubject["722"] === 0 ? "722" : "844";
    return {
      id: "professional-imbalance", label: `${weakSubject}缺少正式验收`, targetMetric: `output.professionalBySubject.${weakSubject}`, targetDirection: "up", targetDelta: 1,
      evidence: [`正式验收分布为722：${metrics.output.professionalBySubject["722"]}，844：${metrics.output.professionalBySubject["844"]}。`],
      action: `下一轮优先为${weakSubject}保存至少2个正式验收单元，不以专注时长代替闭卷结果。`,
    };
  }
  return {
    id: "maintain", label: "当前没有足够证据触发专项纠偏", targetMetric: "execution.planCompletionRate", targetDirection: "maintain", targetDelta: WEEKLY_IMPROVEMENT_RATE_DELTA,
    evidence: ["现有正式证据未触发记录、复盘、闭卷、承载或科目弱项警戒线。"],
    action: "保持当前负荷，不新增任务；继续用闭卷产物和正式结果验证执行。",
  };
}

function buildWeeklyImprovementGuardrails(diagnosis) {
  const guardrails = [
    { id: "english-anchor", group: "english", text: "保持08:00词汇与15:45—17:15正式英语阅读锚点。" },
    { id: "closed-book-product", group: "closed-book", text: "专业课学习至少留下闭卷产物或纸上重构，不用时长代替掌握。" },
    { id: "d1-budget", group: "review", text: "到期D1只在既定复盘预算内完成，并保留三行闭卷证据。" },
    { id: "capacity-ceiling", group: "capacity", text: "每日计划不超过近7日真实承载上限，不因单日状态扩量。" },
  ];
  const excluded = diagnosis.id.includes("english") ? "english"
    : diagnosis.id.includes("closed-book") ? "closed-book"
      : diagnosis.id.includes("review") ? "review"
        : diagnosis.id.includes("capacity") ? "capacity" : "";
  return guardrails.filter((item) => item.group !== excluded).slice(0, 2).map(({ id, text }) => ({ id, text }));
}

function weeklyImprovementCanonical(value) {
  if (Array.isArray(value)) return value.map(weeklyImprovementCanonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = weeklyImprovementCanonical(value[key]);
    return result;
  }, {});
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}
function buildWeeklyImprovementFingerprint(range, audit, metrics) {
  const source = JSON.stringify(weeklyImprovementCanonical({ range, audit, metrics }));
  let first = 2166136261;
  let second = 2654435761;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 2246822519);
  }
  return `weekly-evidence-v1-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function evaluateWeeklyImprovementCommitment(records, report) {
  const previous = weeklyImprovementArray(records)
    .filter((record) => record && record.schemaVersion === WEEKLY_IMPROVEMENT_SCHEMA_VERSION && record.endDate < report.endDate)
    .sort((left, right) => String(right.endDate).localeCompare(String(left.endDate)))[0];
  if (!previous || !previous.diagnosis) return null;
  const diagnosis = previous.diagnosis;
  const currentValue = weeklyImprovementMetric(report.metrics.current, diagnosis.targetMetric);
  const baselineValue = diagnosis.baselineMetricValue;
  const evidenceReady = !diagnosis.targetEvidenceMetric || weeklyImprovementMetric(report.metrics.current, diagnosis.targetEvidenceMetric) === true;
  if (report.metrics.current.evidence.status !== "sufficient" || !evidenceReady || !Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
    return { status: "insufficient-data", label: "暂不能判断", previous, currentValue: Number.isFinite(currentValue) ? currentValue : null, baselineValue };
  }
  const delta = currentValue - baselineValue;
  const threshold = Math.max(0, Number(diagnosis.targetDelta) || 0);
  const improved = diagnosis.targetDirection === "down" ? delta <= -threshold
    : diagnosis.targetDirection === "maintain" ? delta >= -threshold : delta >= threshold;
  return { status: improved ? "improved" : "not-observed", label: improved ? (diagnosis.targetDirection === "maintain" ? "观察到保持" : "观察到改善") : "尚未观察到改善", previous, currentValue, baselineValue, delta };
}

function buildWeeklyImprovementReport(input = {}, endDate, confirmedRecords = []) {
  const safeEnd = weeklyImprovementDate(endDate);
  if (!safeEnd) throw new Error("周诊断截止日期无效。");
  const range = buildWeeklyImprovementRange(safeEnd);
  const previousRange = buildWeeklyImprovementRange(safeEnd, -7);
  const current = buildWeeklyImprovementMetrics(input, range);
  const previous = buildWeeklyImprovementMetrics(input, previousRange);
  const diagnosis = chooseWeeklyImprovementDiagnosis(current);
  diagnosis.baselineMetricValue = weeklyImprovementMetric(current, diagnosis.targetMetric);
  const audit = auditWeeklyImprovementHistory(input.history, range);
  const report = {
    schemaVersion: WEEKLY_IMPROVEMENT_SCHEMA_VERSION,
    endDate: safeEnd,
    range,
    previousRange,
    evidenceFingerprint: buildWeeklyImprovementFingerprint(range, audit, current),
    audit: { evidenceDays: audit.evidenceDays, excludedDays: audit.excludedDays, exclusions: audit.exclusions, exclusionReasonCounts: audit.exclusionReasonCounts },
    metrics: { current, previous },
    trends: buildWeeklyImprovementTrends(current, previous),
    diagnosis,
    guardrails: buildWeeklyImprovementGuardrails(diagnosis),
  };
  report.previousCommitmentEvaluation = evaluateWeeklyImprovementCommitment(confirmedRecords, report);
  return report;
}

function getWeeklyImprovementTargetRange(importedPlan = {}) {
  const source = weeklyImprovementObject(importedPlan);
  const trusted = typeof AI_TRUSTED_PLAN_SOURCES === "object" && AI_TRUSTED_PLAN_SOURCES[source.planType];
  const detailedPlanEnd = weeklyImprovementDate(source.detailedPlanEnd);
  const schemaMatches = trusted && Number(source.schemaVersion) === Number(trusted.schemaVersion);
  const planIdMatches = trusted && (trusted.dynamicPlanId
    ? /^rolling-week-\d{4}-\d{2}-\d{2}$/.test(String(source.planId || ""))
    : !trusted.planId || String(source.planId || "") === trusted.planId);
  if (!schemaMatches || !planIdMatches || !String(source.importedAt || "").trim() || !detailedPlanEnd) return null;
  const startDate = weeklyImprovementAddDays(detailedPlanEnd, 1);
  return { startDate, endDate: weeklyImprovementAddDays(startDate, 6) };
}

function createWeeklyImprovementSnapshot(report, confirmedText, targetRange = null, confirmedAt = new Date().toISOString()) {
  const text = String(confirmedText || "").trim();
  if (!text) throw new Error("请先填写一条具体的主纠偏动作。");
  if (text.length > 300) throw new Error("主纠偏动作不能超过300字。");
  const range = targetRange && weeklyImprovementDate(targetRange.startDate) && weeklyImprovementDate(targetRange.endDate)
    ? { startDate: targetRange.startDate, endDate: targetRange.endDate } : null;
  return JSON.parse(JSON.stringify({
    schemaVersion: WEEKLY_IMPROVEMENT_SCHEMA_VERSION,
    recordId: `weekly-improvement-${report.endDate}`,
    endDate: report.endDate,
    range: report.range,
    previousRange: report.previousRange,
    evidenceFingerprint: report.evidenceFingerprint,
    audit: report.audit,
    metrics: report.metrics.current,
    trends: report.trends,
    diagnosis: { ...report.diagnosis, suggestedText: report.diagnosis.action, confirmedText: text },
    guardrails: report.guardrails,
    confirmedAt,
    binding: range ? { status: "bound", targetRange: range, boundAt: confirmedAt } : { status: "pending", targetRange: null, boundAt: "" },
  }));
}

function bindWeeklyImprovementSnapshot(record, targetRange, boundAt = new Date().toISOString()) {
  if (!record || record.schemaVersion !== WEEKLY_IMPROVEMENT_SCHEMA_VERSION) throw new Error("周快照无效。");
  if (!targetRange || !weeklyImprovementDate(targetRange.startDate) || !weeklyImprovementDate(targetRange.endDate)) throw new Error("下一轮计划日期尚未核验。");
  return { ...record, binding: { status: "bound", targetRange: { startDate: targetRange.startDate, endDate: targetRange.endDate }, boundAt } };
}

function resolveWeeklyImprovementConstraint(records, planRange) {
  const startDate = weeklyImprovementDate(planRange && planRange.startDate);
  const endDate = weeklyImprovementDate(planRange && planRange.endDate);
  if (!startDate || !endDate) return null;
  const record = weeklyImprovementArray(records)
    .filter((item) => item && item.schemaVersion === WEEKLY_IMPROVEMENT_SCHEMA_VERSION
      && item.binding && item.binding.status === "bound"
      && item.binding.targetRange && item.binding.targetRange.startDate === startDate && item.binding.targetRange.endDate === endDate)
    .sort((left, right) => String(right.confirmedAt).localeCompare(String(left.confirmedAt)))[0];
  if (!record) return null;
  const primaryAction = String(record.diagnosis && record.diagnosis.confirmedText || "").trim();
  const guardrails = weeklyImprovementArray(record.guardrails).slice(0, 2);
  if (!String(record.recordId || "").trim() || !String(record.evidenceFingerprint || "").trim()
    || !String(record.diagnosis && record.diagnosis.id || "").trim() || !primaryAction || guardrails.length !== 2
    || guardrails.some((item) => !String(item && item.id || "").trim() || !String(item && item.text || "").trim())) return null;
  return {
    schemaVersion: 1,
    recordId: String(record.recordId || ""),
    sourceRange: { start: record.range.start, end: record.range.end },
    targetRange: { startDate, endDate },
    evidenceFingerprint: String(record.evidenceFingerprint || ""),
    diagnosisId: String(record.diagnosis && record.diagnosis.id || ""),
    diagnosisLabel: String(record.diagnosis && record.diagnosis.label || ""),
    primaryAction: primaryAction.slice(0, 300),
    guardrails: guardrails.map((item) => ({ id: String(item.id), text: String(item.text).slice(0, 300) })),
  };
}
