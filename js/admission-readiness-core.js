const ADMISSION_SUBJECTS = Object.freeze([
  { id: "english", name: "英语", maxScore: 100 },
  { id: "politics", name: "政治", maxScore: 100 },
  { id: "722", name: "722", maxScore: 150 },
  { id: "844", name: "844", maxScore: 150 },
]);
const ADMISSION_MIN_COMPARABLE_SAMPLES = 5;
const ADMISSION_MIN_COMPLETE_BATCHES = 5;
const ADMISSION_SIMULATION_DRAWS = 20000;
const ADMISSION_ATTEMPT_TYPES = Object.freeze(["first", "repeat"]);

function admissionMean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function admissionSampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = admissionMean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1));
}

function normalizeAdmissionEvidenceText(value, maxLength = 100) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function buildAdmissionEvidenceAudit(records) {
  const entries = (Array.isArray(records) ? records : []).map((record, index) => {
    const subject = ADMISSION_SUBJECTS.find((item) => item.id === String(record && record.subject || ""));
    const paperSeries = normalizeAdmissionEvidenceText(record && record.paperSeries);
    const paperId = normalizeAdmissionEvidenceText(record && record.paperId);
    const reasons = [];
    if (!subject) reasons.push("科目无效");
    if (!Number.isFinite(Number(record && record.score)) || !subject || Number(record.maxScore) !== subject.maxScore) reasons.push("成绩或满分口径无效");
    if (record && record.strictTimed !== true) reasons.push("未确认严格限时且未查资料");
    if (record && record.fullSimulation !== true) reasons.push("未确认完整全真作答");
    if (record && record.standardScoring !== true) reasons.push("未确认统一评分标准");
    if (!record || record.attemptType !== "first") reasons.push(record && record.attemptType === "repeat" ? "属于重做成绩" : "未记录首次作答");
    if (!paperSeries) reasons.push("缺少试卷体系");
    if (!paperId) reasons.push("缺少试卷编号");
    return {
      index,
      record,
      subject,
      paperSeries,
      paperId,
      seriesKey: paperSeries.toLocaleLowerCase(),
      paperKey: subject && paperSeries && paperId ? `${subject.id}|${paperSeries.toLocaleLowerCase()}|${paperId.toLocaleLowerCase()}` : "",
      reasons,
    };
  });

  const duplicateCandidates = entries.filter((entry) => !entry.reasons.length)
    .sort((left, right) => String(left.record.date || "").localeCompare(String(right.record.date || ""))
      || String(left.record.updatedAt || "").localeCompare(String(right.record.updatedAt || "")) || left.index - right.index);
  const firstPaperAttempts = new Map();
  duplicateCandidates.forEach((entry) => {
    const first = firstPaperAttempts.get(entry.paperKey);
    if (first) {
      entry.reasons.push(`与${first.record.date}的同科同卷重复`);
      return;
    }
    firstPaperAttempts.set(entry.paperKey, entry);
  });

  const activeSeriesBySubject = {};
  ADMISSION_SUBJECTS.forEach((subject) => {
    const groups = new Map();
    entries.filter((entry) => entry.subject && entry.subject.id === subject.id && !entry.reasons.length).forEach((entry) => {
      const group = groups.get(entry.seriesKey) || { key: entry.seriesKey, label: entry.paperSeries, count: 0, latestDate: "" };
      group.count += 1;
      if (String(entry.record.date || "") > group.latestDate) group.latestDate = String(entry.record.date || "");
      groups.set(entry.seriesKey, group);
    });
    const active = [...groups.values()].sort((left, right) => right.count - left.count
      || right.latestDate.localeCompare(left.latestDate) || left.label.localeCompare(right.label))[0];
    if (active) activeSeriesBySubject[subject.id] = active;
  });
  entries.forEach((entry) => {
    const active = entry.subject && activeSeriesBySubject[entry.subject.id];
    if (!entry.reasons.length && active && entry.seriesKey !== active.key) {
      entry.reasons.push(`试卷体系不属于当前可比组（当前：${active.label}）`);
    }
    entry.eligible = entry.reasons.length === 0;
  });
  const eligibleRecords = entries.filter((entry) => entry.eligible).map((entry) => entry.record);
  const subjectCounts = Object.fromEntries(ADMISSION_SUBJECTS.map((subject) => [
    subject.id,
    entries.filter((entry) => entry.eligible && entry.subject.id === subject.id).length,
  ]));
  return {
    entries,
    eligibleRecords,
    subjectCounts,
    activeSeriesBySubject,
    totalRecords: entries.length,
    excludedCount: entries.length - eligibleRecords.length,
  };
}

function buildAdmissionBatchAudit(records) {
  const groups = new Map();
  let unassignedEligibleCount = 0;
  (Array.isArray(records) ? records : []).forEach((record) => {
    const batchId = normalizeAdmissionEvidenceText(record && record.batchId);
    if (!batchId) {
      unassignedEligibleCount += 1;
      return;
    }
    const key = batchId.toLocaleLowerCase();
    const group = groups.get(key) || { key, batchId, records: [], subjectRecords: {}, firstDate: "", lastDate: "" };
    group.records.push(record);
    if (!group.firstDate || record.date < group.firstDate) group.firstDate = record.date;
    if (!group.lastDate || record.date > group.lastDate) group.lastDate = record.date;
    if (!group.subjectRecords[record.subject]) group.subjectRecords[record.subject] = [];
    group.subjectRecords[record.subject].push(record);
    groups.set(key, group);
  });
  const batches = [...groups.values()].map((group) => {
    const missingSubjects = ADMISSION_SUBJECTS.filter((subject) => !group.subjectRecords[subject.id])
      .map((subject) => ({ id: subject.id, name: subject.name }));
    const duplicateSubjects = ADMISSION_SUBJECTS.filter((subject) => (group.subjectRecords[subject.id] || []).length > 1)
      .map((subject) => ({ id: subject.id, name: subject.name }));
    const complete = !missingSubjects.length && !duplicateSubjects.length;
    const scores = complete ? Object.fromEntries(ADMISSION_SUBJECTS.map((subject) => [subject.id, Number(group.subjectRecords[subject.id][0].score)])) : null;
    return {
      batchId: group.batchId,
      firstDate: group.firstDate,
      lastDate: group.lastDate,
      recordCount: group.records.length,
      missingSubjects,
      duplicateSubjects,
      complete,
      scores,
      total: complete ? ADMISSION_SUBJECTS.reduce((sum, subject) => sum + scores[subject.id], 0) : null,
    };
  }).sort((left, right) => right.lastDate.localeCompare(left.lastDate) || left.batchId.localeCompare(right.batchId));
  return {
    batches,
    completeBatches: batches.filter((batch) => batch.complete),
    incompleteBatches: batches.filter((batch) => !batch.complete),
    unassignedEligibleCount,
  };
}

function admissionWilsonInterval(successes, total, z = 1.96) {
  if (!total) return { lower: 0, upper: 100 };
  const proportion = successes / total;
  const denominator = 1 + (z ** 2 / total);
  const center = (proportion + (z ** 2 / (2 * total))) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) / total) + (z ** 2 / (4 * total ** 2))) / denominator;
  return {
    lower: Math.max(0, Math.round((center - margin) * 1000) / 10),
    upper: Math.min(100, Math.round((center + margin) * 1000) / 10),
  };
}

function buildAdmissionJointEstimate(batchAudit, config) {
  const batches = [...batchAudit.completeBatches].slice(0, 12);
  const evaluated = batches.map((batch) => {
    const subjectPass = ADMISSION_SUBJECTS.every((subject) => batch.scores[subject.id] >= config.subjectMinimums[subject.id]);
    return { ...batch, passed: subjectPass && batch.total >= config.targetTotal };
  });
  const successes = evaluated.filter((batch) => batch.passed).length;
  const interval = admissionWilsonInterval(successes, evaluated.length);
  const totals = evaluated.map((batch) => batch.total);
  return {
    count: evaluated.length,
    successes,
    evaluated,
    probability: {
      conservative: interval.lower,
      baseline: Math.round(successes / evaluated.length * 1000) / 10,
      optimistic: interval.upper,
    },
    predictedTotalMean: admissionMean(totals),
    predictedTotalSd: admissionSampleStandardDeviation(totals),
  };
}

function buildAdmissionSubjectBacktest(records, subject) {
  const series = (Array.isArray(records) ? records : [])
    .filter((record) => record && record.strictTimed === true && record.subject === subject.id
      && Number(record.maxScore) === subject.maxScore && Number.isFinite(Number(record.score)))
    .sort((left, right) => left.date.localeCompare(right.date)).slice(-12);
  const predictions = [];
  for (let index = ADMISSION_MIN_COMPARABLE_SAMPLES; index < series.length; index += 1) {
    const training = series.slice(0, index).map((record) => Number(record.score));
    const predicted = admissionMean(training);
    const standardDeviation = admissionSampleStandardDeviation(training);
    const radius = Math.max(1, 1.645 * standardDeviation * Math.sqrt(1 + (1 / training.length)));
    const actual = Number(series[index].score);
    predictions.push({
      date: series[index].date,
      predicted,
      actual,
      absoluteError: Math.abs(actual - predicted),
      covered: actual >= predicted - radius && actual <= predicted + radius,
    });
  }
  const scores = series.map((record) => Number(record.score));
  const recent = scores.slice(-3);
  const previous = scores.slice(-6, -3);
  const standardDeviation = admissionSampleStandardDeviation(scores);
  const shiftAmount = recent.length === 3 && previous.length === 3 ? admissionMean(recent) - admissionMean(previous) : 0;
  const shiftThreshold = Math.max(subject.maxScore * 0.05, standardDeviation * 0.75);
  return {
    id: subject.id,
    name: subject.name,
    sampleCount: series.length,
    predictionCount: predictions.length,
    meanAbsoluteError: predictions.length ? predictions.reduce((sum, item) => sum + item.absoluteError, 0) / predictions.length : null,
    normalizedMeanAbsoluteError: predictions.length ? predictions.reduce((sum, item) => sum + item.absoluteError / subject.maxScore, 0) / predictions.length : null,
    coverageRate: predictions.length ? predictions.filter((item) => item.covered).length / predictions.length * 100 : null,
    shiftDetected: Math.abs(shiftAmount) > shiftThreshold,
    shiftAmount,
    predictions,
  };
}

function buildAdmissionModelReliability(records, prequalified = false) {
  const comparable = prequalified ? (Array.isArray(records) ? records : []) : buildAdmissionEvidenceAudit(records).eligibleRecords;
  const subjects = ADMISSION_SUBJECTS.map((subject) => buildAdmissionSubjectBacktest(comparable, subject));
  if (subjects.some((subject) => subject.sampleCount < ADMISSION_MIN_COMPARABLE_SAMPLES + 1)) {
    return {
      status: "uncalibrated",
      label: "回测证据不足",
      subjects,
      totalPredictions: subjects.reduce((sum, subject) => sum + subject.predictionCount, 0),
      message: "每科至少需要6次严格限时模拟，才能用前5次预测下一次并校验模型。",
      intervalPadding: 10,
      withholdProbability: false,
    };
  }
  const predictions = subjects.flatMap((subject) => subject.predictions.map((prediction) => ({ ...prediction, subject: subject.id })));
  const totalPredictions = predictions.length;
  const normalizedMae = subjects.reduce((sum, subject) => sum + Number(subject.normalizedMeanAbsoluteError || 0), 0) / subjects.length;
  const coverageRate = predictions.length ? predictions.filter((item) => item.covered).length / predictions.length * 100 : 0;
  const shiftSubjects = subjects.filter((subject) => subject.shiftDetected).map((subject) => subject.name);
  const severeFailure = totalPredictions >= 8 && (normalizedMae > 0.15 || coverageRate < 40);
  let status = "low";
  let label = "低可信";
  let intervalPadding = 15;
  if (!severeFailure && totalPredictions >= 20 && normalizedMae <= 0.05 && coverageRate >= 75 && !shiftSubjects.length) {
    status = "high";
    label = "较高可信";
    intervalPadding = 0;
  } else if (!severeFailure && totalPredictions >= 8 && normalizedMae <= 0.10 && coverageRate >= 60 && !shiftSubjects.length) {
    status = "medium";
    label = "中等可信";
    intervalPadding = 5;
  }
  const reasons = [];
  if (totalPredictions < 8) reasons.push("可回测预测点少于8个");
  if (normalizedMae > 0.10) reasons.push("平均预测误差偏大");
  if (coverageRate < 60) reasons.push("预测区间覆盖率偏低");
  if (shiftSubjects.length) reasons.push(`${shiftSubjects.join("、")}近期成绩发生结构变化`);
  return {
    status,
    label,
    subjects,
    totalPredictions,
    normalizedMae,
    coverageRate,
    shiftSubjects,
    intervalPadding,
    withholdProbability: severeFailure,
    message: reasons.length ? reasons.join("；") : "滚动回测误差和区间覆盖率处于可接受范围。",
  };
}

function normalizeAdmissionAssessmentConfig(config = {}) {
  const normalized = {
    targetTotal: Number(config.targetTotal),
    benchmarkYear: String(config.benchmarkYear || "").trim(),
    benchmarkSource: String(config.benchmarkSource || "").trim(),
    subjectMinimums: {},
  };
  ADMISSION_SUBJECTS.forEach((subject) => {
    normalized.subjectMinimums[subject.id] = Number(config.subjectMinimums && config.subjectMinimums[subject.id]);
  });
  return normalized;
}

function validateAdmissionAssessmentConfig(config = {}) {
  const normalized = normalizeAdmissionAssessmentConfig(config);
  if (!Number.isFinite(normalized.targetTotal) || normalized.targetTotal <= 0 || normalized.targetTotal > 500) {
    throw new Error("请填写1—500分之间的初试目标总分。");
  }
  ADMISSION_SUBJECTS.forEach((subject) => {
    const minimum = normalized.subjectMinimums[subject.id];
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > subject.maxScore) {
      throw new Error(`请填写0—${subject.maxScore}分之间的${subject.name}最低线。`);
    }
  });
  if (!/^20\d{2}$/.test(normalized.benchmarkYear) || !normalized.benchmarkSource) {
    throw new Error("请填写目标线年份和可核对的来源说明。");
  }
  return normalized;
}

function normalizeAdmissionMockRecord(record = {}) {
  const subject = ADMISSION_SUBJECTS.find((item) => item.id === String(record.subject || ""));
  const date = String(record.date || "");
  const score = Number(record.score);
  const durationMinutes = Math.floor(Number(record.durationMinutes) || 0);
  const attemptType = String(record.attemptType || "");
  const paperSeries = normalizeAdmissionEvidenceText(record.paperSeries);
  const paperId = normalizeAdmissionEvidenceText(record.paperId);
  const batchId = normalizeAdmissionEvidenceText(record.batchId);
  if (!subject) throw new Error("请选择有效科目。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("请选择有效模拟日期。");
  if (!Number.isFinite(score) || score < 0 || score > subject.maxScore) throw new Error(`${subject.name}成绩必须在0—${subject.maxScore}分之间。`);
  if (durationMinutes <= 0 || durationMinutes > 360) throw new Error("请填写1—360分钟之间的实际限时用时。");
  if (!ADMISSION_ATTEMPT_TYPES.includes(attemptType)) throw new Error("请选择首次作答或重做。");
  if (!paperSeries) throw new Error("请填写试卷体系，例如英语一真题或某套模拟卷系列。");
  if (!paperId) throw new Error("请填写可区分具体试卷的编号。");
  return {
    recordId: `${date}:${subject.id}`,
    date,
    subject: subject.id,
    score: Math.round(score * 10) / 10,
    maxScore: subject.maxScore,
    durationMinutes,
    strictTimed: record.strictTimed === true,
    fullSimulation: record.fullSimulation === true,
    standardScoring: record.standardScoring === true,
    attemptType,
    paperSeries,
    paperId,
    batchId,
    note: String(record.note || "").trim().slice(0, 300),
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

function upsertAdmissionMockRecord(records, input, now = new Date().toISOString()) {
  const normalized = normalizeAdmissionMockRecord({ ...input, updatedAt: now });
  const next = (Array.isArray(records) ? records : []).filter((record) => record && record.recordId !== normalized.recordId);
  next.push(normalized);
  next.sort((left, right) => right.date.localeCompare(left.date) || left.subject.localeCompare(right.subject));
  return { records: next, record: normalized };
}

function admissionMulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let output = value;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function admissionNormalSample(random) {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function simulateAdmissionScenario(subjectStats, config, meanShiftStandardErrors) {
  const random = admissionMulberry32(20260808 + (meanShiftStandardErrors + 2) * 7919);
  let passes = 0;
  for (let draw = 0; draw < ADMISSION_SIMULATION_DRAWS; draw += 1) {
    let total = 0;
    let subjectPass = true;
    subjectStats.forEach((subject) => {
      const shiftedMean = subject.mean + meanShiftStandardErrors * subject.standardError;
      const sampled = subject.standardDeviation
        ? shiftedMean + admissionNormalSample(random) * subject.standardDeviation : shiftedMean;
      const score = Math.min(subject.maxScore, Math.max(0, sampled));
      total += score;
      if (score < config.subjectMinimums[subject.id]) subjectPass = false;
    });
    if (subjectPass && total >= config.targetTotal) passes += 1;
  }
  return Math.round(passes / ADMISSION_SIMULATION_DRAWS * 1000) / 10;
}

function buildAdmissionReadinessAssessment(records, rawConfig) {
  const evidenceAudit = buildAdmissionEvidenceAudit(records);
  const batchAudit = buildAdmissionBatchAudit(evidenceAudit.eligibleRecords);
  let config;
  try {
    config = validateAdmissionAssessmentConfig(rawConfig);
  } catch (error) {
    return { status: "missing-target", message: error.message, subjectCounts: evidenceAudit.subjectCounts, evidenceAudit, batchAudit };
  }
  const comparable = evidenceAudit.eligibleRecords;
  const subjectScores = Object.fromEntries(ADMISSION_SUBJECTS.map((subject) => [subject.id, comparable
    .filter((record) => record.subject === subject.id && Number(record.maxScore) === subject.maxScore && Number.isFinite(Number(record.score)))
    .sort((left, right) => right.date.localeCompare(left.date)).slice(0, 12).map((record) => Number(record.score))]));
  const subjectCounts = Object.fromEntries(ADMISSION_SUBJECTS.map((subject) => [subject.id, subjectScores[subject.id].length]));
  const missingSubjects = ADMISSION_SUBJECTS.filter((subject) => subjectCounts[subject.id] < ADMISSION_MIN_COMPARABLE_SAMPLES)
    .map((subject) => ({ id: subject.id, name: subject.name, count: subjectCounts[subject.id], needed: ADMISSION_MIN_COMPARABLE_SAMPLES - subjectCounts[subject.id] }));
  if (missingSubjects.length) {
    return {
      status: "insufficient-data",
      config,
      subjectCounts,
      missingSubjects,
      evidenceAudit,
      batchAudit,
      message: `每科至少需要${ADMISSION_MIN_COMPARABLE_SAMPLES}次首次作答、严格限时、完整全真、统一评分且属于同一试卷体系的模拟成绩，当前不输出概率。`,
    };
  }
  const subjectStats = ADMISSION_SUBJECTS.map((subject) => {
    const scores = subjectScores[subject.id];
    const mean = admissionMean(scores);
    const standardDeviation = admissionSampleStandardDeviation(scores);
    return {
      ...subject,
      count: scores.length,
      mean,
      standardDeviation,
      standardError: standardDeviation / Math.sqrt(scores.length),
      target: config.subjectMinimums[subject.id],
      standardizedCushion: standardDeviation ? (mean - config.subjectMinimums[subject.id]) / standardDeviation : mean >= config.subjectMinimums[subject.id] ? 99 : -99,
    };
  });
  const conservative = simulateAdmissionScenario(subjectStats, config, -1);
  const baseline = simulateAdmissionScenario(subjectStats, config, 0);
  const optimistic = simulateAdmissionScenario(subjectStats, config, 1);
  const riskSubject = [...subjectStats].sort((left, right) => left.standardizedCushion - right.standardizedCushion)[0];
  const predictedTotalMean = subjectStats.reduce((sum, subject) => sum + subject.mean, 0);
  const predictedTotalSd = Math.sqrt(subjectStats.reduce((sum, subject) => sum + subject.standardDeviation ** 2, 0));
  const reliability = buildAdmissionModelReliability(comparable, true);
  const rawProbability = {
    conservative: Math.min(conservative, baseline, optimistic),
    baseline,
    optimistic: Math.max(conservative, baseline, optimistic),
  };
  const independentProbability = reliability.withholdProbability ? null : {
    conservative: Math.max(0, Math.round((rawProbability.conservative - reliability.intervalPadding) * 10) / 10),
    baseline: rawProbability.baseline,
    optimistic: Math.min(100, Math.round((rawProbability.optimistic + reliability.intervalPadding) * 10) / 10),
  };
  const jointEstimate = batchAudit.completeBatches.length >= ADMISSION_MIN_COMPLETE_BATCHES
    ? buildAdmissionJointEstimate(batchAudit, config) : null;
  const probabilityMode = jointEstimate ? "joint-batch" : "independent-approximation";
  const probability = reliability.withholdProbability ? null : jointEstimate ? jointEstimate.probability : independentProbability;
  return {
    status: "ready",
    config,
    evidenceAudit,
    batchAudit,
    subjectCounts,
    subjectStats,
    predictedTotalMean: Math.round((jointEstimate ? jointEstimate.predictedTotalMean : predictedTotalMean) * 10) / 10,
    predictedTotalSd: Math.round((jointEstimate ? jointEstimate.predictedTotalSd : predictedTotalSd) * 10) / 10,
    probability,
    probabilityMode,
    probabilityModeLabel: jointEstimate ? "完整批次联合估计" : "四科独立近似",
    jointEstimate,
    rawProbability,
    probabilityWithheld: reliability.withholdProbability,
    reliability,
    riskSubject: riskSubject.id,
    riskMessage: `${riskSubject.name}相对目标线的标准化余量最低；下一条最有价值的新证据是再完成一次严格限时${riskSubject.name}模拟。`,
    caveat: jointEstimate
      ? `当前使用最近${jointEstimate.count}个完整批次的真实四科组合和Wilson 95%区间，保留共同状态造成的科目联动；样本仍有限，且这不是最终录取概率。`
      : `当前完整批次少于${ADMISSION_MIN_COMPLETE_BATCHES}个，仍在目标线固定、四科表现近似独立且近期模拟可代表考试状态等条件下估计；这不是最终录取概率。`,
  };
}
