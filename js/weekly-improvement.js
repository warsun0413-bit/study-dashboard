// Rolling seven-day diagnosis UI and explicit snapshot confirmation.
let currentWeeklyImprovementReport = null;

function readWeeklyImprovementRecords() {
  const records = readJson(weeklyImprovementRecordsKey, []);
  return Array.isArray(records) ? records : [];
}

function getWeeklyImprovementInput() {
  if (typeof getP1IntegrationInput === "function") return getP1IntegrationInput(getDateKey());
  return {
    history: readHistory(),
    dailyPlans: readDailyPlans(),
    professionalStore: readJson(professionalResultsKey, {}),
    reviewQueue: readJson(reviewQueueKey, []),
    focusTotals: readJson(focusMinutesKey, {}),
    manualRecords: readJson(manualTimeRecordsKey, []),
    wordRecords: readJson(englishWordRecordsKey, []),
    readingRecords: readJson(englishReadingRecordsKey, []),
    politicsRecords: readJson(politicsRecordsKey, []),
    outputRecords: readJson(outputRecordsKey, []),
  };
}

function formatWeeklyImprovementPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "证据不足";
}

function formatWeeklyImprovementTrend(report, path, type = "count") {
  const trend = report && report.trends && report.trends[path];
  if (!trend || !trend.comparable) return "前7天无可比数据";
  const delta = Number(trend.delta) || 0;
  if (Math.abs(delta) < (type === "rate" ? 0.005 : 0.5)) return "与前7天基本持平";
  const direction = delta > 0 ? "增加" : "减少";
  const value = type === "rate" ? `${Math.abs(Math.round(delta * 100))}个百分点` : `${Math.abs(Math.round(delta))}`;
  return `较前7天${direction}${value}`;
}

function createWeeklyImprovementMetric(label, value, detail) {
  const row = document.createElement("div");
  const name = document.createElement("span");
  const data = document.createElement("strong");
  const note = document.createElement("small");
  name.textContent = label;
  data.textContent = value;
  note.textContent = detail;
  row.append(name, data, note);
  return row;
}

function renderWeeklyImprovementMetricGroups(report) {
  const container = document.querySelector("#weeklyImprovementMetrics");
  if (!container) return;
  container.replaceChildren();
  const metrics = report.metrics.current;
  const groups = [
    {
      title: "执行事实",
      items: [
        ["有效学习日", `${metrics.execution.effectiveStudyDays}/7天`, formatWeeklyImprovementTrend(report, "execution.effectiveStudyDays")],
        ["中位有效学习", Number.isFinite(metrics.execution.medianStudyMinutes) ? `${Math.round(metrics.execution.medianStudyMinutes)}分钟` : "证据不足", formatWeeklyImprovementTrend(report, "execution.medianStudyMinutes")],
        ["执行目标达成", formatWeeklyImprovementPercent(metrics.execution.targetAttainmentMedian), `${metrics.execution.targetEvidenceDays}日有冻结目标 · ${formatWeeklyImprovementTrend(report, "execution.targetAttainmentMedian", "rate")}`],
        ["正式任务完成", formatWeeklyImprovementPercent(metrics.execution.planCompletionRate), `${metrics.execution.completionDone}/${metrics.execution.completionTotal}项 · ${formatWeeklyImprovementTrend(report, "execution.planCompletionRate", "rate")}`],
      ],
    },
    {
      title: "正式产出",
      items: [
        ["正式结果", `${metrics.output.formalResultCount}条`, formatWeeklyImprovementTrend(report, "output.formalResultCount")],
        ["专业课验收", `${metrics.output.professionalUnits}单元`, `722：${metrics.output.professionalBySubject["722"]} · 844：${metrics.output.professionalBySubject["844"]}`],
        ["闭卷证据", `${metrics.output.closedBookEvidenceDays}天`, formatWeeklyImprovementTrend(report, "output.closedBookEvidenceDays")],
        ["专业课输出", `${metrics.output.professionalOutputs}次`, `通过${metrics.output.professionalResults.passed} · 部分${metrics.output.professionalResults.partial} · 未通过${metrics.output.professionalResults.failed}`],
      ],
    },
    {
      title: "复盘保持",
      items: [
        ["D1完成", formatWeeklyImprovementPercent(metrics.retention.d1CompletionRate), `${metrics.retention.d1Completed}/${metrics.retention.d1Due}项；至少2项才进入瓶颈判断`],
        ["窗口末逾期", `${metrics.retention.overdue}项`, formatWeeklyImprovementTrend(report, "retention.overdue")],
        ["英语记录连续性", `最长${metrics.quality.englishContinuityDays}天`, `${metrics.quality.englishRecordDays}/7天有记录 · ${metrics.quality.englishReadingCount}篇带题量`],
        ["政治记录连续性", `最长${metrics.quality.politicsContinuityDays}天`, `${metrics.quality.politicsRecordDays}/7天有记录 · ${metrics.quality.politicsRecordCount}次带题量`],
      ],
    },
    {
      title: "质量证据",
      items: [
        ["英语阅读正确率", formatWeeklyImprovementPercent(metrics.quality.englishAccuracy), `${metrics.quality.englishCorrect}/${metrics.quality.englishQuestions}题${metrics.quality.englishEligible ? " · 可用于诊断" : " · 小样本不下结论"}`],
        ["政治选择题正确率", formatWeeklyImprovementPercent(metrics.quality.politicsAccuracy), `${metrics.quality.politicsCorrect}/${metrics.quality.politicsQuestions}题${metrics.quality.politicsEligible ? " · 可用于诊断" : " · 小样本不下结论"}`],
        ["722正式验收", `${metrics.output.professionalBySubject["722"]}单元`, formatWeeklyImprovementTrend(report, "output.professionalBySubject.722")],
        ["844正式验收", `${metrics.output.professionalBySubject["844"]}单元`, formatWeeklyImprovementTrend(report, "output.professionalBySubject.844")],
      ],
    },
  ];
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "weekly-improvement-metric-group";
    const title = document.createElement("h3");
    title.textContent = group.title;
    const list = document.createElement("div");
    group.items.forEach((item) => list.appendChild(createWeeklyImprovementMetric(...item)));
    section.append(title, list);
    container.appendChild(section);
  });
}

function renderWeeklyImprovementPreviousEvaluation(evaluation) {
  const card = document.querySelector("#weeklyImprovementPreviousAction");
  if (!card) return;
  card.hidden = !evaluation;
  if (!evaluation) return;
  const title = document.querySelector("#weeklyImprovementPreviousStatus");
  const text = document.querySelector("#weeklyImprovementPreviousText");
  title.textContent = evaluation.label;
  title.dataset.state = evaluation.status;
  text.textContent = `上次主动作：${evaluation.previous.diagnosis.confirmedText}。${evaluation.status === "insufficient-data" ? "当前正式样本不足，不把它判为失败。" : "按上次锁定的目标指标与本窗口证据比较。"}`;
}

function renderWeeklyImprovement() {
  const panel = document.querySelector("#weeklyImprovementPanel");
  if (!panel) return;
  const records = readWeeklyImprovementRecords();
  let report;
  try {
    report = buildWeeklyImprovementReport(getWeeklyImprovementInput(), getDateKey(), records);
  } catch (error) {
    currentWeeklyImprovementReport = null;
    document.querySelector("#weeklyImprovementSummaryStatus").textContent = "暂时无法诊断";
    document.querySelector("#weeklyImprovementEvidence").textContent = error.message || "周诊断数据无效。";
    return;
  }
  currentWeeklyImprovementReport = report;
  const metrics = report.metrics.current;
  const confirmed = records.find((record) => record && record.endDate === report.endDate) || null;
  document.querySelector("#weeklyImprovementRange").textContent = `${report.range.start} 至 ${report.range.end}，对比 ${report.previousRange.start} 至 ${report.previousRange.end}`;
  document.querySelector("#weeklyImprovementSummaryStatus").textContent = metrics.evidence.status === "sufficient" ? "可形成诊断" : "证据积累中";
  document.querySelector("#weeklyImprovementEvidence").textContent = metrics.evidence.status === "sufficient"
    ? `采用${metrics.execution.validFormalDays}个有效正式日，排除${metrics.execution.excludedDays}日；时长与勾选只用于执行判断，不代表掌握。`
    : `只有${metrics.execution.validFormalDays}个有效正式日，至少需要3日；当前只陈列事实，不评价速度或能力。`;
  renderWeeklyImprovementMetricGroups(report);
  document.querySelector("#weeklyImprovementDiagnosisTitle").textContent = report.diagnosis.label;
  const evidenceList = document.querySelector("#weeklyImprovementDiagnosisEvidence");
  evidenceList.replaceChildren();
  report.diagnosis.evidence.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    evidenceList.appendChild(item);
  });
  const guardrails = document.querySelector("#weeklyImprovementGuardrails");
  guardrails.replaceChildren();
  const visibleGuardrails = confirmed ? confirmed.guardrails : report.guardrails;
  visibleGuardrails.forEach((guardrail) => {
    const item = document.createElement("li");
    item.textContent = guardrail.text;
    guardrails.appendChild(item);
  });
  const action = document.querySelector("#weeklyImprovementAction");
  const confirmButton = document.querySelector("#confirmWeeklyImprovementBtn");
  const bindButton = document.querySelector("#bindWeeklyImprovementBtn");
  if (confirmed) {
    action.value = confirmed.diagnosis.confirmedText;
    action.dataset.evidenceFingerprint = confirmed.evidenceFingerprint;
  } else if (action.dataset.evidenceFingerprint !== report.evidenceFingerprint) {
    action.value = report.diagnosis.action;
    action.dataset.evidenceFingerprint = report.evidenceFingerprint;
  }
  action.readOnly = Boolean(confirmed);
  confirmButton.disabled = Boolean(confirmed);
  confirmButton.textContent = confirmed ? "本截止日已确认" : "确认并冻结本次周动作";
  const targetRange = getWeeklyImprovementTargetRange(readJson(importedPlanKey, {}));
  bindButton.hidden = !confirmed || confirmed.binding.status !== "pending" || !targetRange;
  const binding = document.querySelector("#weeklyImprovementBinding");
  if (!confirmed) binding.textContent = targetRange
    ? `确认后将绑定下一轮 ${targetRange.startDate}—${targetRange.endDate}；仍需手动确认计划导入。`
    : "下一轮可信日期尚不可得；周快照可先保存，约束保持待绑定。";
  else if (confirmed.binding.status === "bound") binding.textContent = `已绑定下一轮 ${confirmed.binding.targetRange.startDate}—${confirmed.binding.targetRange.endDate}；不会改写任务内容或时长。`;
  else binding.textContent = targetRange ? "周快照已冻结；现在可以手动绑定到已核验的下一轮日期。" : "周快照已冻结；下一轮可信日期尚不可得，当前保持待绑定。";
  renderWeeklyImprovementPreviousEvaluation(report.previousCommitmentEvaluation);
}

function confirmWeeklyImprovement() {
  const records = readWeeklyImprovementRecords();
  const endDate = getDateKey();
  if (records.some((record) => record && record.endDate === endDate)) {
    setStatus("#weeklyImprovementStatus", "本截止日已有正式周快照，事实部分不会重复覆盖。", true);
    renderWeeklyImprovement();
    return false;
  }
  let report;
  try {
    report = buildWeeklyImprovementReport(getWeeklyImprovementInput(), endDate, records);
    const targetRange = getWeeklyImprovementTargetRange(readJson(importedPlanKey, {}));
    const snapshot = createWeeklyImprovementSnapshot(report, document.querySelector("#weeklyImprovementAction").value, targetRange);
    writeJson(weeklyImprovementRecordsKey, [...records, snapshot].sort((left, right) => String(left.endDate).localeCompare(String(right.endDate))));
    setStatus("#weeklyImprovementStatus", targetRange ? "周快照已冻结，并绑定到下一轮计划日期。" : "周快照已冻结；下一轮日期核验后可再绑定。", false);
    renderWeeklyImprovement();
    if (typeof renderAiRollingWeekPlanPreview === "function") renderAiRollingWeekPlanPreview();
    return true;
  } catch (error) {
    setStatus("#weeklyImprovementStatus", error.message || "周快照保存失败。", true);
    return false;
  }
}

function bindWeeklyImprovementToNextPlan() {
  const records = readWeeklyImprovementRecords();
  const index = records.findIndex((record) => record && record.endDate === getDateKey());
  const targetRange = getWeeklyImprovementTargetRange(readJson(importedPlanKey, {}));
  if (index < 0 || !targetRange) {
    setStatus("#weeklyImprovementStatus", "尚无可绑定的周快照或可信下一轮日期。", true);
    return false;
  }
  try {
    const next = records.slice();
    next[index] = bindWeeklyImprovementSnapshot(next[index], targetRange);
    writeJson(weeklyImprovementRecordsKey, next);
    setStatus("#weeklyImprovementStatus", `已绑定 ${targetRange.startDate}—${targetRange.endDate}，仍需手动确认计划导入。`, false);
    renderWeeklyImprovement();
    if (typeof renderAiRollingWeekPlanPreview === "function") renderAiRollingWeekPlanPreview();
    return true;
  } catch (error) {
    setStatus("#weeklyImprovementStatus", error.message || "绑定失败。", true);
    return false;
  }
}

function initWeeklyImprovement() {
  document.querySelector("#confirmWeeklyImprovementBtn").addEventListener("click", confirmWeeklyImprovement);
  document.querySelector("#bindWeeklyImprovementBtn").addEventListener("click", bindWeeklyImprovementToNextPlan);
  renderWeeklyImprovement();
}
