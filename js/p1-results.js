// P1 Checkpoint 1: storage transactions and compact task-card editing UI.
const P1_STATUS_LABELS = Object.freeze({
  "not-started": "未记录", "in-progress": "进行中", partial: "部分完成",
  completed: "完成", "legacy-unstructured": "旧记录未结构化",
});
const P1_READING_REVIEW_LABELS = Object.freeze({
  "not-reviewed": "未完成", partial: "部分完成", complete: "已完成",
});
const P1_READING_ERROR_LABELS = Object.freeze({
  "concept-substitution": "概念偷换", "scope-expansion": "范围扩大", "polarity-reversal": "正反颠倒",
  "causal-reversal": "因果倒置", "unsupported-addition": "无中生有", "example-as-viewpoint": "例子冒充观点",
  "over-inference": "过度推断", "location-error": "定位错误", "sentence-error": "长难句理解错误",
  "vocabulary-error": "词义判断错误", other: "其他",
});
const P1_POLITICS_ERROR_LABELS = Object.freeze({ K: "知识缺失", M: "概念混淆", L: "审题/逻辑", W: "范围/条件", C: "材料/计算/细节", G: "蒙题/不确定" });

function readP1Records(key) {
  const records = readJson(key, []);
  return Array.isArray(records) ? records : [];
}

function findP1Record(key, date, taskId) {
  return readP1Records(key).find((record) => record && record.date === date && record.taskId === taskId) || null;
}

function hasP1EnglishReadingAttempt(record) {
  return Boolean(record
    && String(record.year || "").trim()
    && String(record.textNumber || "").trim()
    && Number.isInteger(record.correctCount)
    && Number.isInteger(record.totalQuestions)
    && record.totalQuestions > 0);
}

function hasP1PoliticsExecution(record) {
  return Boolean(record
    && String(record.chapter || "").trim()
    && String(record.content || "").trim()
    && (Number(record.courseMinutes) > 0 || Number(record.questionMinutes) > 0));
}

function getP1TaskKind(task) {
  if (!task || !(task.id || task.taskId)) return "";
  if (task.category === "englishWords" || ["english-words", "sunday-words"].includes(task.id)) return "english-words";
  if (task.category === "englishReading" || ["english-reading", "sunday-reading"].includes(task.id)) return "english-reading";
  if (task.category === "english" || task.sourceTaskKey === "english") return "english-main";
  if (task.category === "politics" || task.sourceTaskKey === "politics") return "politics";
  return "";
}

function getP1EnglishState(task, date = getDateKey()) {
  const taskId = String(task && (task.taskId || task.id) || "");
  const words = taskId ? findP1Record(englishWordRecordsKey, date, taskId) : null;
  const reading = taskId ? findP1Record(englishReadingRecordsKey, date, taskId) : null;
  const legacyCompleted = getTaskStatus(task) === "completed" && task.resultTrackingVersion !== 1;
  const derivedStatus = getP1TaskKind(task) === "english-main"
    ? (reading ? (hasP1EnglishReadingAttempt(reading) ? "completed" : reading.status === "not-started" ? "not-started" : "in-progress") : legacyCompleted ? "legacy-unstructured" : "not-started")
    : deriveEnglishTaskStatus(words, reading, { legacyCompleted });
  return { words, reading, derivedStatus };
}

function getTodayEnglishReviewRecords(task, date = getDateKey()) {
  const taskId = String(task && (task.taskId || task.id) || "");
  return normalizeReviewQueueRecords(readJson(reviewQueueKey, []))
    .filter((record) => record.subject === "english"
      && record.status === "completed"
      && record.completedDate === date
      && (!taskId || !record.sourceTaskId || record.sourceTaskId === taskId))
    .sort((a, b) => String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt)));
}

function syncP1TaskResultInPlans(plans, date, taskId, record, resultType) {
  const updated = JSON.parse(JSON.stringify(plans || {}));
  const day = updated[date];
  if (!day || !Array.isArray(day.tasks)) return updated;
  const task = day.tasks.find((item) => String(item && (item.taskId || item.id) || "") === taskId);
  if (!task) throw new Error("关联任务不存在，未保存结果。");
  task.actualResultRefs = [...new Set([...(Array.isArray(task.actualResultRefs) ? task.actualResultRefs : []), record.recordId])];
  if (["english-words", "english-reading"].includes(resultType)) {
    task.resultTrackingVersion = 1;
    if (getP1TaskKind(task) === "english-main") task.subtasks = [{ subtaskId: "reading", title: "英语阅读", required: true }];
    const readingRecords = resultType === "english-reading" ? [record] : readP1Records(englishReadingRecordsKey);
    const reading = readingRecords.find((item) => item.date === date && item.taskId === taskId) || null;
    if (getP1TaskKind(task) === "english-main") setTaskStatus(task, hasP1EnglishReadingAttempt(reading) ? "completed" : reading && reading.status !== "not-started" ? "in-progress" : "not-started");
    else setTaskStatus(task, record.status === "completed" ? "completed" : record.status === "not-started" ? "not-started" : "in-progress");
  } else if (resultType === "politics") {
    task.resultTrackingVersion = 1;
    setTaskStatus(task, hasP1PoliticsExecution(record) ? "completed" : record.status === "not-started" ? "not-started" : "in-progress");
  }
  return updated;
}

function saveP1Record(key, input, normalize, resultType) {
  const records = readP1Records(key);
  const date = p1Date(input.date);
  const taskId = p1String(input.taskId, 120);
  const existingIndex = records.findIndex((record) => record && record.date === date && record.taskId === taskId);
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  let record = normalize(input, { existing, now: new Date().toISOString() });
  if (resultType === "politics") record = { ...record, reviewCandidates: generatePoliticsReviewCandidates(record, records) };
  const nextRecords = records.slice();
  if (existingIndex >= 0) nextRecords[existingIndex] = record;
  else nextRecords.push(record);
  const before = readRawStorageSnapshot();
  const plans = readJson(dailyPlansKey, {});
  const nextPlans = syncP1TaskResultInPlans(plans, date, taskId, record, resultType);
  const target = { ...before, [key]: JSON.stringify(nextRecords), [dailyPlansKey]: JSON.stringify(nextPlans) };
  applyStorageSnapshotTransaction(target, `p1-save-${resultType}`, false);
  return record;
}

function saveEnglishWordRecord(input) {
  return saveP1Record(englishWordRecordsKey, input, normalizeEnglishWordRecord, "english-words");
}

function saveEnglishReadingRecord(input) {
  return saveP1Record(englishReadingRecordsKey, input, normalizeEnglishReadingRecord, "english-reading");
}

function saveEnglishReadingReviewRecord(input) {
  const date = p1Date(input.date);
  const reviewLevel = String(input.reviewLevel || "").toUpperCase();
  if (!["D1", "D3", "D7", "D14", "D30"].includes(reviewLevel)) throw new Error("英语阅读复盘层级无效。");
  const knowledgeUnitId = p1String(input.knowledgeUnitId, 100);
  if (!knowledgeUnitId) throw new Error("英语阅读复盘缺少明确篇目。");
  const now = new Date().toISOString();
  const reviewKey = buildReviewKey("english", knowledgeUnitId, reviewLevel);
  const outcome = upsertReviewRecord(readJson(reviewQueueKey, []), {
    reviewKey,
    businessKey: reviewKey,
    subject: "english",
    knowledgeUnitId,
    knowledgeUnit: p1String(input.knowledgeUnit, 160),
    reviewLevel,
    reviewType: "spaced",
    dueDate: date,
    task: p1String(input.task, 240),
    sourceRecordType: "english-reading-review-note",
    sourceTaskId: p1String(input.taskId, 120),
    status: "completed",
    previousResult: "未验收",
    completedAt: now,
    completedDate: date,
    note: p1String(input.note, 500),
    nextStart: p1String(input.nextStart, 240),
    createdAt: now,
  }, now);
  const before = readRawStorageSnapshot();
  applyStorageSnapshotTransaction({ ...before, [reviewQueueKey]: JSON.stringify(outcome.records) }, "p1-save-english-reading-review", false);
  return outcome.record;
}

function savePoliticsRecord(input) {
  return saveP1Record(politicsRecordsKey, input, normalizePoliticsRecord, "politics");
}

function convertPoliticsCandidate(recordId, candidateId) {
  const records = readP1Records(politicsRecordsKey);
  const record = records.find((item) => item.recordId === recordId);
  const candidate = record && (record.reviewCandidates || []).find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("政治复盘候选不存在。");
  if (candidate.status === "converted" && candidate.reviewId) return candidate;
  const reviewType = ["K", "M"].includes(candidate.reasonCode) ? "politics-knowledge" : "option-trap";
  const reviewLevel = candidate.suggestedReview === "D3" ? "D3" : candidate.suggestedReview === "D1" ? "D1" : "D0";
  const businessKey = `politics:${record.recordId}:${reviewType}:${candidate.knowledgePointId}`;
  const now = new Date().toISOString();
  const outcome = upsertReviewRecord(readJson(reviewQueueKey, []), {
    businessKey, reviewKey: businessKey, subject: "politics", knowledgeUnitId: candidate.knowledgePointId,
    knowledgeUnit: candidate.knowledgePoint, reviewLevel, reviewType, dueDate: candidate.suggestedReview === "D3" ? addDateDays(record.date, 3) : addDateDays(record.date, 1),
    task: `${reviewType === "option-trap" ? "选项陷阱" : "政治知识点"}：${candidate.knowledgePoint}`,
    sourceRecordId: record.recordId, sourceRecordType: "studyPoliticsRecords", sourceTaskId: record.taskId,
    status: "pending", previousResult: "未验收", createdAt: now,
  }, now);
  candidate.status = "converted"; candidate.reviewId = outcome.record.reviewId;
  const before = readRawStorageSnapshot();
  applyStorageSnapshotTransaction({ ...before, [politicsRecordsKey]: JSON.stringify(records), [reviewQueueKey]: JSON.stringify(outcome.records) }, "p1-convert-politics-candidate", false);
  return candidate;
}

function p1FormatAccuracy(value) {
  return value === null ? "未记录" : `${Math.round(value * 1000) / 10}%`;
}

function appendP1ResultSummary(task, content, controls) {
  const kind = getP1TaskKind(task);
  if (!kind) return;
  const taskId = String(task.taskId || task.id || "");
  if (!taskId) return;
  const date = getDateKey();
  const summary = document.createElement("div");
  summary.className = "p1-result-summary";
  if (["english-main", "english-words", "english-reading"].includes(kind)) {
    const state = getP1EnglishState(task, date);
    const items = [];
    if (kind === "english-words") items.push("单词结果记录已取消");
    else {
      items.push(`阅读记录：${hasP1EnglishReadingAttempt(state.reading) ? "已保存" : state.reading ? "信息不完整" : "未保存"}`);
      if (state.reading) items.push(`当次复盘：${P1_READING_REVIEW_LABELS[state.reading.reviewStatus] || "未记录"}`);
      if (state.reading && state.reading.reviewNotes) items.push("复盘正文：已保存");
    }
    if (kind === "english-main") items.push(`英语任务：${state.derivedStatus === "completed" ? "已完成" : P1_STATUS_LABELS[state.derivedStatus]}`);
    if (state.reading) items.push(`阅读正确率：${p1FormatAccuracy(calculateReadingAccuracy(state.reading))}`);
    const reviews = getTodayEnglishReviewRecords(task, date);
    if (reviews.length) items.push(`英语复盘：${reviews.slice(0, 3).map((review) => `${review.knowledgeUnit} · ${review.reviewLevel}完成`).join("、")}`);
    summary.textContent = items.join("｜");
    if (kind !== "english-words") controls.append(createTaskButton("记录阅读结果", "p1-reading", taskId, "ghost"));
  } else if (kind === "politics") {
    const record = findP1Record(politicsRecordsKey, date, taskId);
    if (!record) summary.textContent = "政治实际结果：未记录";
    else {
      const accuracy = calculatePoliticsAccuracy(record);
      summary.textContent = `政治记录：${hasP1PoliticsExecution(record) ? "已保存" : "信息不完整"}｜政治任务：${hasP1PoliticsExecution(record) ? "已完成" : "未完成"}｜单选 ${p1FormatAccuracy(accuracy.singleChoiceAccuracy)}｜多选 ${p1FormatAccuracy(accuracy.multipleChoiceAccuracy)}｜总计 ${p1FormatAccuracy(accuracy.totalAccuracy)}｜蒙题 ${p1FormatAccuracy(accuracy.guessedAccuracy)}｜主要错因 ${accuracy.dominantErrorCode || "未记录"}`;
    }
    controls.append(createTaskButton("记录政治结果", "p1-politics", taskId, "ghost"));
    if (record) (record.reviewCandidates || []).filter((candidate) => candidate.status === "candidate").forEach((candidate) => {
      controls.append(createTaskButton(`转为复盘：${candidate.reasonCode}`, `p1-politics-convert:${record.recordId}:${candidate.candidateId}`, taskId, "ghost"));
    });
  }
  content.appendChild(summary);
}

function ensureP1ResultDialog() {
  if (document.querySelector("#p1ResultDialog")) return;
  const dialog = document.createElement("section");
  dialog.id = "p1ResultDialog";
  dialog.className = "p1-result-dialog";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `<div class="p1-result-card"><div class="section-heading"><div><p class="step">实际结果</p><h2 id="p1ResultTitle">记录学习结果</h2></div><button id="closeP1ResultBtn" class="button ghost" type="button">取消</button></div><form id="p1ResultForm"><input id="p1ResultType" type="hidden"><input id="p1ResultTaskId" type="hidden"><div id="p1ResultFields" class="p1-result-form"></div><div class="button-row"><button id="saveP1DetailedResultBtn" class="button primary" type="submit">保存实际结果</button><button id="cancelP1ResultBtn" class="button ghost" type="button">取消</button><span id="p1ResultStatus" class="status" aria-live="polite"></span></div></form></div>`;
  document.body.appendChild(dialog);
  dialog.querySelector("#closeP1ResultBtn").addEventListener("click", closeP1ResultDialog);
  dialog.querySelector("#cancelP1ResultBtn").addEventListener("click", closeP1ResultDialog);
  dialog.querySelector("#p1ResultForm").addEventListener("submit", handleP1ResultSubmit);
}

function p1NullableFormValue(form, name) {
  const value = form.elements[name] && form.elements[name].value.trim();
  return value === "" ? null : Number(value);
}

function p1Lines(form, name) {
  return form.elements[name] ? form.elements[name].value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

function p1Field(label, name, type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
}

function simplifyP1QuickRecordWording(container) {
  const quickRecord = container && container.querySelector(".professional-quick-record");
  if (!quickRecord) return;
  const textarea = quickRecord.querySelector("textarea");
  const copyButton = quickRecord.querySelector('[id^="copy"][id$="TemplateBtn"]');
  const saveButton = quickRecord.querySelector('[id^="save"][id$="QuickBtn"]');
  if (textarea) textarea.placeholder = "填写真实结果后保存记录";
  if (copyButton) copyButton.hidden = true;
  if (saveButton) saveButton.textContent = "保存记录";
  if (container.querySelector("#politicsQuickRecord")) {
    const hint = quickRecord.querySelector(".muted");
    if (hint) hint.textContent = "未做的题型可留空；正确数与总数需要同时填写。";
  }
  const advancedEditor = container.querySelector(".professional-advanced-editor");
  if (advancedEditor) advancedEditor.hidden = true;
}

function copyEnglishWordQuickTemplate() {
  const textarea = document.querySelector("#englishWordQuickRecord"); textarea.value = ENGLISH_WORD_QUICK_TEMPLATE; textarea.focus(); textarea.setSelectionRange(0, 0);
  setStatus("#englishWordQuickStatus", "模板已生成，请填写真实结果后保存记录。");
}
function saveEnglishWordQuickRecord() {
  const dialog = document.querySelector("#p1ResultDialog");
  try {
    const input = parseEnglishWordQuickRecord(document.querySelector("#englishWordQuickRecord").value, { date: getDateKey(), taskId: dialog.querySelector("#p1ResultTaskId").value });
    const record = saveEnglishWordRecord(input);
    closeP1ResultDialog(); renderTasks(); renderRecentSevenDays();
    return record;
  } catch (error) { setStatus("#englishWordQuickStatus", error.message || "单词结果保存失败。", true); return null; }
}

function copyEnglishReadingQuickTemplate() {
  const textarea = document.querySelector("#englishReadingQuickRecord"); textarea.value = ENGLISH_READING_QUICK_TEMPLATE; textarea.focus(); textarea.setSelectionRange(0, 0);
  setStatus("#englishReadingQuickStatus", "模板已生成，请填写真实结果后保存记录。");
}
function saveEnglishReadingQuickRecord() {
  const dialog = document.querySelector("#p1ResultDialog");
  try {
    const value = document.querySelector("#englishReadingQuickRecord").value;
    const context = { date: getDateKey(), taskId: dialog.querySelector("#p1ResultTaskId").value };
    try {
      const input = parseEnglishReadingQuickRecord(value, context);
      const record = saveEnglishReadingRecord(input);
      closeP1ResultDialog(); renderTasks(); renderRecentSevenDays();
      if (typeof showResultHandoff === "function") showResultHandoff(context.taskId, "已保存：英语阅读结果");
      return record;
    } catch (formalError) {
      let reviewInput;
      try { reviewInput = parseEnglishReadingReviewQuickRecord(value, context); }
      catch (_) { throw formalError; }
      const review = saveEnglishReadingReviewRecord(reviewInput);
      closeP1ResultDialog(); renderTasks(); renderDueReviews(); renderP0FinalHome();
      setStatus("#p1ResultStatus", `已保存 ${review.knowledgeUnit} ${review.reviewLevel} 完成记录；未重复计为新阅读。`);
      return review;
    }
  } catch (error) { setStatus("#englishReadingQuickStatus", error.message || "阅读结果保存失败。", true); return null; }
}
function copyPoliticsQuickTemplate() {
  const textarea = document.querySelector("#politicsQuickRecord"); textarea.value = POLITICS_QUICK_TEMPLATE; textarea.focus(); textarea.setSelectionRange(0, 0);
  setStatus("#politicsQuickStatus", "模板已生成，请填写真实结果后保存记录。");
}
function savePoliticsQuickRecord() {
  const dialog = document.querySelector("#p1ResultDialog");
  try {
    const taskId = dialog.querySelector("#p1ResultTaskId").value;
    const input = parsePoliticsQuickRecord(document.querySelector("#politicsQuickRecord").value, { date: getDateKey(), taskId });
    const record = savePoliticsRecord(input);
    closeP1ResultDialog(); renderTasks(); renderRecentSevenDays();
    if (typeof showResultHandoff === "function") showResultHandoff(taskId, "已保存：政治学习结果");
    return record;
  } catch (error) { setStatus("#politicsQuickStatus", error.message || "政治结果保存失败。", true); return null; }
}

function openP1ResultDialog(type, taskId) {
  ensureP1ResultDialog();
  const dialog = document.querySelector("#p1ResultDialog");
  const fields = dialog.querySelector("#p1ResultFields");
  const date = getDateKey();
  dialog.querySelector("#p1ResultType").value = type;
  dialog.querySelector("#p1ResultTaskId").value = taskId;
  dialog.querySelector("#saveP1DetailedResultBtn").hidden = ["words", "reading", "politics"].includes(type);
  let record = null;
  if (type === "words") {
    record = findP1Record(englishWordRecordsKey, date, taskId) || {};
    dialog.querySelector("#p1ResultTitle").textContent = "英语单词实际结果";
    fields.innerHTML = `<div class="professional-quick-record p1-wide"><label for="englishWordQuickRecord">快速记录</label><textarea id="englishWordQuickRecord" rows="6" spellcheck="false" placeholder="点击“复制模板”，填写后粘贴到这里"></textarea><div class="button-row"><button id="copyEnglishWordTemplateBtn" class="button secondary" type="button">复制模板</button><button id="saveEnglishWordQuickBtn" class="button primary" type="button">解析并保存</button><span id="englishWordQuickStatus" class="status" aria-live="polite"></span></div></div><details class="professional-advanced-editor p1-word-advanced p1-wide"><summary>高级编辑：逐项修改</summary><div class="p1-result-form">${p1Field("实际分钟", "actualMinutes", "number", "min=\"0\" max=\"1440\"")}<label class="p1-checkbox"><input name="reviewCompleted" type="checkbox">滚动复习已完成</label><label>错词（每行一个）<textarea name="errorWords" rows="3"></textarea></label><label>熟词僻义（每行一个）<textarea name="familiarRareMeanings" rows="3"></textarea></label><label>重要搭配（每行一个）<textarea name="collocations" rows="3"></textarea></label><label>主要问题<textarea name="mainProblem" rows="2"></textarea></label><label>下一步<textarea name="nextAction" rows="2"></textarea></label></div><div class="button-row"><button class="button primary" type="submit">保存逐项结果</button></div></details>`;
    fields.querySelector("#copyEnglishWordTemplateBtn").addEventListener("click", copyEnglishWordQuickTemplate);
    fields.querySelector("#saveEnglishWordQuickBtn").addEventListener("click", saveEnglishWordQuickRecord);
  } else if (type === "reading") {
    record = findP1Record(englishReadingRecordsKey, date, taskId) || {};
    dialog.querySelector("#p1ResultTitle").textContent = "英语阅读实际结果";
    fields.innerHTML = `<div class="professional-quick-record p1-wide"><label for="englishReadingQuickRecord">快速记录</label><textarea id="englishReadingQuickRecord" rows="9" spellcheck="false" placeholder="点击“复制模板”，填写后粘贴到这里"></textarea><div class="button-row"><button id="copyEnglishReadingTemplateBtn" class="button secondary" type="button">复制模板</button><button id="saveEnglishReadingQuickBtn" class="button primary" type="button">解析并保存</button><span id="englishReadingQuickStatus" class="status" aria-live="polite"></span></div></div><details id="englishReadingSavedNotesPanel" class="p1-wide" hidden><summary>查看已保存复盘正文</summary><label>复盘正文<textarea id="englishReadingSavedNotes" rows="8" readonly></textarea></label></details><details class="professional-advanced-editor p1-reading-advanced p1-wide"><summary>高级编辑：逐项修改</summary><div class="p1-result-form">${p1Field("年份", "year")}${p1Field("试卷", "paper")}${p1Field("篇目", "textNumber")}${p1Field("首遍分钟", "firstAttemptMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("正确数", "correctCount", "number", "min=\"0\"")}${p1Field("总题数", "totalQuestions", "number", "min=\"0\"")}${p1Field("错题号（逗号分隔）", "wrongQuestionNumbers")}<label>错误类型<select name="errorTypes" multiple>${Object.entries(P1_READING_ERROR_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><label>复盘状态<select name="reviewStatus"><option value="not-reviewed">未复盘</option><option value="partial">部分复盘</option><option value="complete">完整复盘</option></select></label><label class="p1-checkbox"><input name="paragraphSummaryCompleted" type="checkbox">段落概括完成</label><label class="p1-checkbox"><input name="logicMarkersReviewed" type="checkbox">逻辑标志复盘</label><label class="p1-checkbox"><input name="evidenceLocated" type="checkbox">原文依据已定位</label><label class="p1-checkbox"><input name="optionAnalysisCompleted" type="checkbox">选项分析完成</label><label>长难句（每行一个）<textarea name="longSentences" rows="3"></textarea></label><label>高价值词（每行一个）<textarea name="highValueWords" rows="3"></textarea></label><label>主要错句<textarea name="mainErrorSentence" rows="2"></textarea></label><label>下一起点<textarea name="nextStart" rows="2"></textarea></label></div><div class="button-row"><button class="button primary" type="submit">保存逐项结果</button></div></details>`;
    const savedNotesPanel = fields.querySelector("#englishReadingSavedNotesPanel");
    if (record.reviewNotes) {
      savedNotesPanel.hidden = false;
      fields.querySelector("#englishReadingSavedNotes").value = record.reviewNotes;
    }
    fields.querySelector("#copyEnglishReadingTemplateBtn").addEventListener("click", copyEnglishReadingQuickTemplate);
    fields.querySelector("#saveEnglishReadingQuickBtn").addEventListener("click", saveEnglishReadingQuickRecord);
  } else {
    record = findP1Record(politicsRecordsKey, date, taskId) || {};
    dialog.querySelector("#p1ResultTitle").textContent = "政治实际结果";
    fields.innerHTML = `<div class="professional-quick-record p1-wide"><label for="politicsQuickRecord">快速记录</label><textarea id="politicsQuickRecord" rows="10" spellcheck="false" placeholder="点击“复制模板”，填写后粘贴到这里"></textarea><p class="muted">薄弱点可留空；填写格式：知识点ID/知识点/错因代码，多个用分号分隔。</p><div class="button-row"><button id="copyPoliticsTemplateBtn" class="button secondary" type="button">复制模板</button><button id="savePoliticsQuickBtn" class="button primary" type="button">解析并保存</button><span id="politicsQuickStatus" class="status" aria-live="polite"></span></div></div><details class="professional-advanced-editor p1-politics-advanced p1-wide"><summary>高级编辑：逐项修改</summary><div class="p1-result-form">${p1Field("章节", "chapter")}${p1Field("学习内容", "content")}${p1Field("课程分钟", "courseMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("刷题分钟", "questionMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("单选题量", "singleChoiceTotal", "number", "min=\"0\"")}${p1Field("单选正确", "singleChoiceCorrect", "number", "min=\"0\"")}${p1Field("多选题量", "multipleChoiceTotal", "number", "min=\"0\"")}${p1Field("多选正确", "multipleChoiceCorrect", "number", "min=\"0\"")}${p1Field("蒙题总数", "guessedTotal", "number", "min=\"0\"")}${p1Field("蒙对数", "guessedCorrect", "number", "min=\"0\"")}${POLITICS_ERROR_CODES.map((code) => p1Field(`${code} ${P1_POLITICS_ERROR_LABELS[code]}`, `error${code}`, "number", "min=\"0\"")).join("")}<label class="p1-wide">薄弱点（每行：知识点ID｜知识点｜错因代码；C后加｜候选可明确生成）<textarea name="weakPoints" rows="4"></textarea></label><label>完成状态<select name="status"><option value="partial">部分完成</option><option value="completed">已按标准完成</option></select></label><label>下一起点<textarea name="nextStart" rows="2"></textarea></label></div><div class="button-row"><button class="button primary" type="submit">保存逐项结果</button></div></details>`;
    fields.querySelector("#copyPoliticsTemplateBtn").addEventListener("click", copyPoliticsQuickTemplate);
    fields.querySelector("#savePoliticsQuickBtn").addEventListener("click", savePoliticsQuickRecord);
  }
  simplifyP1QuickRecordWording(fields);
  Object.entries(record).forEach(([name, value]) => {
    const control = fields.querySelector(`[name="${name}"]`);
    if (!control) return;
    if (control.type === "checkbox") control.checked = value === true;
    else if (control.multiple && Array.isArray(value)) [...control.options].forEach((option) => { option.selected = value.includes(option.value); });
    else if (Array.isArray(value)) control.value = value.map((item) => typeof item === "string" ? item : `${item.knowledgePointId || ""}｜${item.knowledgePoint || ""}｜${item.reasonCode || ""}${item.candidateRequested ? "｜候选" : ""}`).join("\n");
    else if (value !== null && typeof value !== "object") control.value = value;
  });
  POLITICS_ERROR_CODES.forEach((code) => { const control = fields.querySelector(`[name="error${code}"]`); if (control) control.value = record.errorCodes && record.errorCodes[code] || 0; });
  dialog.hidden = false;
  if (type === "words") copyEnglishWordQuickTemplate();
  else if (type === "reading") copyEnglishReadingQuickTemplate();
  else copyPoliticsQuickTemplate();
}

function closeP1ResultDialog() {
  const dialog = document.querySelector("#p1ResultDialog");
  if (dialog) { dialog.hidden = true; dialog.querySelector("#p1ResultForm").reset(); dialog.querySelector("#p1ResultFields").replaceChildren(); }
}

function handleP1ResultSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.querySelector("#p1ResultType").value;
  const taskId = form.querySelector("#p1ResultTaskId").value;
  const base = { date: getDateKey(), taskId };
  try {
    if (type === "words") saveEnglishWordRecord({ ...base, actualMinutes: p1NullableFormValue(form, "actualMinutes"), reviewCompleted: form.elements.reviewCompleted.checked, errorWords: p1Lines(form, "errorWords"), familiarRareMeanings: p1Lines(form, "familiarRareMeanings"), collocations: p1Lines(form, "collocations"), mainProblem: form.elements.mainProblem.value, nextAction: form.elements.nextAction.value });
    else if (type === "reading") saveEnglishReadingRecord({ ...base, year: form.elements.year.value, paper: form.elements.paper.value, textNumber: form.elements.textNumber.value, firstAttemptMinutes: p1NullableFormValue(form, "firstAttemptMinutes"), correctCount: p1NullableFormValue(form, "correctCount"), totalQuestions: p1NullableFormValue(form, "totalQuestions"), wrongQuestionNumbers: form.elements.wrongQuestionNumbers.value, errorTypes: [...form.elements.errorTypes.selectedOptions].map((option) => option.value), paragraphSummaryCompleted: form.elements.paragraphSummaryCompleted.checked, logicMarkersReviewed: form.elements.logicMarkersReviewed.checked, evidenceLocated: form.elements.evidenceLocated.checked, optionAnalysisCompleted: form.elements.optionAnalysisCompleted.checked, reviewStatus: form.elements.reviewStatus.value, longSentences: p1Lines(form, "longSentences"), highValueWords: p1Lines(form, "highValueWords"), mainErrorSentence: form.elements.mainErrorSentence.value, nextStart: form.elements.nextStart.value });
    else {
      const weakPoints = p1Lines(form, "weakPoints").map((line) => { const [knowledgePointId, knowledgePoint, reasonCode, flag] = line.split(/[｜|]/).map((item) => item.trim()); return { knowledgePointId, knowledgePoint, reasonCode: String(reasonCode || "").toUpperCase(), candidateRequested: flag === "候选" }; });
      savePoliticsRecord({ ...base, chapter: form.elements.chapter.value, content: form.elements.content.value, courseMinutes: p1NullableFormValue(form, "courseMinutes"), questionMinutes: p1NullableFormValue(form, "questionMinutes"), singleChoiceTotal: p1NullableFormValue(form, "singleChoiceTotal"), singleChoiceCorrect: p1NullableFormValue(form, "singleChoiceCorrect"), multipleChoiceTotal: p1NullableFormValue(form, "multipleChoiceTotal"), multipleChoiceCorrect: p1NullableFormValue(form, "multipleChoiceCorrect"), guessedTotal: p1NullableFormValue(form, "guessedTotal"), guessedCorrect: p1NullableFormValue(form, "guessedCorrect"), errorCodes: Object.fromEntries(POLITICS_ERROR_CODES.map((code) => [code, p1NullableFormValue(form, `error${code}`)])), weakPoints, status: form.elements.status.value, nextStart: form.elements.nextStart.value });
    }
    closeP1ResultDialog(); renderTasks(); renderRecentSevenDays();
    if (["reading", "politics"].includes(type) && typeof showResultHandoff === "function") {
      showResultHandoff(taskId, type === "reading" ? "已保存：英语阅读结果" : "已保存：政治学习结果");
    }
  } catch (error) {
    setStatus("#p1ResultStatus", error.message || "结果保存失败。", true);
  }
}

function handleP1TaskAction(action, task) {
  if (!action || !task) return false;
  if (action === "p1-reading") { openP1ResultDialog("reading", String(task.taskId || task.id)); return true; }
  if (action === "p1-politics") { openP1ResultDialog("politics", String(task.taskId || task.id)); return true; }
  if (action.startsWith("p1-politics-convert:")) {
    const [, , recordId, candidateId] = action.split(":");
    try { convertPoliticsCandidate(recordId, candidateId); renderTasks(); renderDueReviews(); } catch (error) { window.alert(error.message || "转换失败。"); }
    return true;
  }
  return false;
}

function validateP1EnglishTaskCompletion(task) {
  if (getP1TaskKind(task) !== "english-main") return { valid: true };
  const state = getP1EnglishState(task);
  return state.derivedStatus === "completed"
    ? { valid: true }
    : { valid: false, message: "英语阅读结果保存为完成后，英语主任务才能完成。" };
}

function validateP1TrackedTaskCompletion(task, date = getDateKey()) {
  const kind = getP1TaskKind(task);
  if (kind === "english-main") return validateP1EnglishTaskCompletion(task);
  if (kind !== "politics") return { valid: true };
  const taskId = String(task && (task.taskId || task.id) || "");
  const record = taskId ? findP1Record(politicsRecordsKey, date, taskId) : null;
  return hasP1PoliticsExecution(record)
    ? { valid: true }
    : { valid: false, message: "政治学习结果保存后，政治任务才能完成。" };
}

function initP1Results() {
  ensureP1ResultDialog();
}
