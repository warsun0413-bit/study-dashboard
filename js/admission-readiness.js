function readAdmissionMockScores() {
  const records = readJson(admissionMockScoresKey, []);
  return Array.isArray(records) ? records : [];
}

function readAdmissionAssessmentConfig() {
  const config = readJson(admissionAssessmentConfigKey, {});
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function getAdmissionConfigFromForm() {
  return {
    targetTotal: document.querySelector("#admissionTargetTotal").value,
    benchmarkYear: document.querySelector("#admissionBenchmarkYear").value,
    benchmarkSource: document.querySelector("#admissionBenchmarkSource").value,
    subjectMinimums: {
      english: document.querySelector("#admissionEnglishMinimum").value,
      politics: document.querySelector("#admissionPoliticsMinimum").value,
      "722": document.querySelector("#admission722Minimum").value,
      "844": document.querySelector("#admission844Minimum").value,
    },
  };
}

function loadAdmissionConfigForm() {
  const config = readAdmissionAssessmentConfig();
  document.querySelector("#admissionTargetTotal").value = config.targetTotal ?? "";
  document.querySelector("#admissionBenchmarkYear").value = config.benchmarkYear || "";
  document.querySelector("#admissionBenchmarkSource").value = config.benchmarkSource || "";
  document.querySelector("#admissionEnglishMinimum").value = (config.subjectMinimums && config.subjectMinimums.english) ?? "";
  document.querySelector("#admissionPoliticsMinimum").value = (config.subjectMinimums && config.subjectMinimums.politics) ?? "";
  document.querySelector("#admission722Minimum").value = (config.subjectMinimums && config.subjectMinimums["722"]) ?? "";
  document.querySelector("#admission844Minimum").value = (config.subjectMinimums && config.subjectMinimums["844"]) ?? "";
}

function appendAdmissionMetric(container, label, value, note = "") {
  const item = document.createElement("div");
  const labelNode = document.createElement("span");
  const valueNode = document.createElement("strong");
  labelNode.textContent = label;
  valueNode.textContent = value;
  item.append(labelNode, valueNode);
  if (note) {
    const noteNode = document.createElement("small");
    noteNode.textContent = note;
    item.appendChild(noteNode);
  }
  container.appendChild(item);
}

function appendAdmissionEvidenceSummary(container, audit) {
  if (!audit) return;
  const active = ADMISSION_SUBJECTS.map((subject) => {
    const group = audit.activeSeriesBySubject[subject.id];
    return group ? `${subject.name}：${group.label}` : `${subject.name}：尚无可比组`;
  }).join("；");
  appendAdmissionMetric(container, "有效模拟证据", `${audit.eligibleRecords.length} / ${audit.totalRecords} 条`, `${audit.excludedCount}条未进入模型。当前可比组：${active}`);
}

function appendAdmissionBatchSummary(metrics, details, audit) {
  if (!audit) return;
  const completeCount = audit.completeBatches.length;
  appendAdmissionMetric(metrics, "完整联合批次", `${completeCount} / ${ADMISSION_MIN_COMPLETE_BATCHES} 个`, completeCount >= ADMISSION_MIN_COMPLETE_BATCHES
    ? "已达到联合估计门槛，概率将使用真实四科组合。"
    : `还需${ADMISSION_MIN_COMPLETE_BATCHES - completeCount}个完整批次；当前仍使用四科独立近似。`);
  if (!audit.batches.length) return;
  const table = document.createElement("div");
  table.className = "admission-batch-table";
  audit.batches.slice(0, 8).forEach((batch) => {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    const value = document.createElement("span");
    name.textContent = batch.batchId;
    if (batch.complete) {
      value.textContent = `${batch.firstDate}${batch.lastDate !== batch.firstDate ? `—${batch.lastDate}` : ""} · 四科完整 · 总分${batch.total}`;
    } else {
      const issues = [];
      if (batch.missingSubjects.length) issues.push(`缺${batch.missingSubjects.map((subject) => subject.name).join("、")}`);
      if (batch.duplicateSubjects.length) issues.push(`${batch.duplicateSubjects.map((subject) => subject.name).join("、")}重复`);
      value.textContent = `${batch.firstDate}${batch.lastDate !== batch.firstDate ? `—${batch.lastDate}` : ""} · ${issues.join("；")}`;
    }
    row.append(name, value);
    table.appendChild(row);
  });
  details.appendChild(table);
}

function renderAdmissionAssessmentResult(assessment) {
  const status = document.querySelector("#admissionAssessmentStatus");
  const metrics = document.querySelector("#admissionAssessmentMetrics");
  const details = document.querySelector("#admissionAssessmentDetails");
  metrics.replaceChildren();
  details.replaceChildren();
  appendAdmissionEvidenceSummary(metrics, assessment.evidenceAudit);
  appendAdmissionBatchSummary(metrics, details, assessment.batchAudit);
  if (assessment.status === "missing-target") {
    status.textContent = "尚未建立目标线";
    appendAdmissionMetric(metrics, "当前状态", "不能估计", assessment.message);
    return;
  }
  if (assessment.status === "insufficient-data") {
    status.textContent = "数据积累中";
    ADMISSION_SUBJECTS.forEach((subject) => {
      const count = assessment.subjectCounts[subject.id] || 0;
      appendAdmissionMetric(metrics, subject.name, `${count} / ${ADMISSION_MIN_COMPARABLE_SAMPLES} 次`, count >= ADMISSION_MIN_COMPARABLE_SAMPLES ? "已达到最低样本门槛" : `还需${ADMISSION_MIN_COMPARABLE_SAMPLES - count}次可比首次全真模拟`);
    });
    const note = document.createElement("p");
    note.className = "admission-caveat";
    note.textContent = assessment.message;
    details.appendChild(note);
    return;
  }
  status.textContent = assessment.probabilityWithheld ? "回测未通过，已暂停概率" : `条件概率 · ${assessment.probabilityModeLabel} · ${assessment.reliability.label}`;
  if (assessment.probability) {
    appendAdmissionMetric(metrics, "条件概率区间", `${assessment.probability.conservative}%—${assessment.probability.optimistic}%`, `${assessment.probabilityModeLabel} · 基准情景 ${assessment.probability.baseline}%`);
  } else {
    appendAdmissionMetric(metrics, "条件概率区间", "暂停显示", "回测误差或区间覆盖率严重不合格，继续显示数字会误导。 ");
  }
  if (assessment.jointEstimate) {
    appendAdmissionMetric(metrics, "联合批次实测达标", `${assessment.jointEstimate.successes} / ${assessment.jointEstimate.count} 批`, "同时达到目标总分和四科最低线才计为达标。");
  }
  appendAdmissionMetric(metrics, "预测总分中心", `${assessment.predictedTotalMean} 分`, `${assessment.probabilityMode === "joint-batch" ? "完整批次实际总分波动" : "四科独立波动合成"}约 ±${assessment.predictedTotalSd} 分`);
  appendAdmissionMetric(metrics, "最大风险科目", ADMISSION_SUBJECTS.find((subject) => subject.id === assessment.riskSubject).name, assessment.riskMessage);
  const reliability = assessment.reliability;
  const reliabilityNote = reliability.status === "uncalibrated"
    ? reliability.message
    : `${reliability.totalPredictions}个滚动预测点 · 平均相对误差${(reliability.normalizedMae * 100).toFixed(1)}% · 区间覆盖率${reliability.coverageRate.toFixed(0)}%`;
  appendAdmissionMetric(metrics, "模型可信度", reliability.label, `${reliabilityNote}。${reliability.message}`);
  const table = document.createElement("div");
  table.className = "admission-subject-table";
  assessment.subjectStats.forEach((subject) => {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    const value = document.createElement("span");
    name.textContent = `${subject.name} · ${subject.count}次`;
    value.textContent = `均值${subject.mean.toFixed(1)} · 波动${subject.standardDeviation.toFixed(1)} · 最低线${subject.target}`;
    row.append(name, value);
    table.appendChild(row);
  });
  const backtest = document.createElement("div");
  backtest.className = "admission-backtest-table";
  reliability.subjects.forEach((subject) => {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    const value = document.createElement("span");
    name.textContent = `${subject.name}回测`;
    value.textContent = subject.predictionCount
      ? `${subject.predictionCount}个预测点 · 平均误差${subject.meanAbsoluteError.toFixed(1)}分 · 覆盖率${subject.coverageRate.toFixed(0)}%${subject.shiftDetected ? " · 检测到近期结构变化" : ""}`
      : `尚需至少${ADMISSION_MIN_COMPARABLE_SAMPLES + 1}次严格限时成绩`;
    row.append(name, value);
    backtest.appendChild(row);
  });
  const caveat = document.createElement("p");
  caveat.className = "admission-caveat";
  caveat.textContent = assessment.caveat;
  details.append(table, backtest, caveat);
}

function renderAdmissionMockRecords() {
  const list = document.querySelector("#admissionMockRecords");
  list.replaceChildren();
  const audit = buildAdmissionEvidenceAudit(readAdmissionMockScores());
  const entries = [...audit.entries].sort((left, right) => String(right.record.date || "").localeCompare(String(left.record.date || ""))
    || String(left.record.subject || "").localeCompare(String(right.record.subject || ""))).slice(0, 16);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "尚无模拟成绩。同一天同一科目再次保存会更新该条记录。";
    list.appendChild(empty);
    return;
  }
  entries.forEach((entry) => {
    const record = entry.record;
    const subject = ADMISSION_SUBJECTS.find((item) => item.id === record.subject);
    if (!subject) return;
    const item = document.createElement("div");
    item.className = "admission-mock-record";
    const heading = document.createElement("strong");
    const detail = document.createElement("span");
    heading.textContent = `${record.date} · ${subject.name} · ${record.score}/${subject.maxScore}`;
    const paper = record.paperSeries && record.paperId ? `${record.paperSeries} / ${record.paperId}` : "未记录试卷身份";
    const attempt = record.attemptType === "first" ? "首次作答" : record.attemptType === "repeat" ? "重做" : "未记录作答类型";
    const verdict = entry.eligible ? "计入模型" : `不计入模型：${entry.reasons.join("；")}`;
    const batch = record.batchId ? `批次${record.batchId}` : "未加入联合批次";
    detail.textContent = `${paper} · ${attempt} · ${batch} · ${record.durationMinutes}分钟 · ${verdict}${record.note ? ` · ${record.note}` : ""}`;
    if (!entry.eligible) item.classList.add("is-excluded");
    item.append(heading, detail);
    list.appendChild(item);
  });
}

function renderAdmissionReadiness() {
  const records = readAdmissionMockScores();
  renderAdmissionAssessmentResult(buildAdmissionReadinessAssessment(records, readAdmissionAssessmentConfig()));
  renderAdmissionMockRecords();
}

function saveAdmissionAssessmentConfig() {
  try {
    const config = validateAdmissionAssessmentConfig(getAdmissionConfigFromForm());
    writeJson(admissionAssessmentConfigKey, config);
    renderAdmissionReadiness();
    setStatus("#admissionConfigStatus", "目标线及来源已保存。只有通过证据质量门禁的成绩达到样本门槛后才会输出概率区间。");
  } catch (error) {
    setStatus("#admissionConfigStatus", error.message || "目标线设置无效。", true);
  }
}

function saveAdmissionMockScore() {
  try {
    const outcome = upsertAdmissionMockRecord(readAdmissionMockScores(), {
      date: document.querySelector("#admissionMockDate").value,
      subject: document.querySelector("#admissionMockSubject").value,
      score: document.querySelector("#admissionMockScore").value,
      durationMinutes: document.querySelector("#admissionMockDuration").value,
      strictTimed: document.querySelector("#admissionMockStrict").checked,
      fullSimulation: document.querySelector("#admissionMockFullSimulation").checked,
      standardScoring: document.querySelector("#admissionMockStandardScoring").checked,
      attemptType: document.querySelector("#admissionMockAttemptType").value,
      paperSeries: document.querySelector("#admissionMockPaperSeries").value,
      paperId: document.querySelector("#admissionMockPaperId").value,
      batchId: document.querySelector("#admissionMockBatchId").value,
      note: document.querySelector("#admissionMockNote").value,
    });
    writeJson(admissionMockScoresKey, outcome.records);
    renderAdmissionReadiness();
    const savedEntry = buildAdmissionEvidenceAudit(outcome.records).entries.find((entry) => entry.record.recordId === outcome.record.recordId);
    const evidenceMessage = savedEntry && savedEntry.eligible ? "已计入模型" : `暂不计入模型：${savedEntry ? savedEntry.reasons.join("；") : "证据状态无法确认"}`;
    setStatus("#admissionMockStatus", `${outcome.record.date} ${outcome.record.subject} 成绩已保存，${evidenceMessage}。`);
  } catch (error) {
    setStatus("#admissionMockStatus", error.message || "模拟成绩保存失败。", true);
  }
}

function syncAdmissionScoreLimit() {
  const subject = ADMISSION_SUBJECTS.find((item) => item.id === document.querySelector("#admissionMockSubject").value) || ADMISSION_SUBJECTS[0];
  const score = document.querySelector("#admissionMockScore");
  score.max = String(subject.maxScore);
  score.placeholder = `0—${subject.maxScore}`;
}

function initAdmissionReadiness() {
  loadAdmissionConfigForm();
  document.querySelector("#admissionMockDate").value = getDateKey();
  syncAdmissionScoreLimit();
  renderAdmissionReadiness();
  document.querySelector("#saveAdmissionConfigBtn").addEventListener("click", saveAdmissionAssessmentConfig);
  document.querySelector("#saveAdmissionMockBtn").addEventListener("click", saveAdmissionMockScore);
  document.querySelector("#admissionMockSubject").addEventListener("change", syncAdmissionScoreLimit);
}
