// P1 Checkpoint 1: storage transactions and compact task-card editing UI.
const P1_STATUS_LABELS = Object.freeze({
  "not-started": "未记录", "in-progress": "进行中", partial: "部分完成",
  completed: "完成", "legacy-unstructured": "旧记录未结构化",
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
  return { words, reading, derivedStatus: deriveEnglishTaskStatus(words, reading, { legacyCompleted: getTaskStatus(task) === "completed" && task.resultTrackingVersion !== 1 }) };
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
    if (getP1TaskKind(task) === "english-main") task.subtasks = [
      { subtaskId: "words", title: "英语单词", required: true },
      { subtaskId: "reading", title: "英语阅读", required: true },
    ];
    const wordRecords = resultType === "english-words" ? [record] : readP1Records(englishWordRecordsKey);
    const readingRecords = resultType === "english-reading" ? [record] : readP1Records(englishReadingRecordsKey);
    const word = wordRecords.find((item) => item.date === date && item.taskId === taskId) || null;
    const reading = readingRecords.find((item) => item.date === date && item.taskId === taskId) || null;
    const derived = deriveEnglishTaskStatus(word, reading);
    if (getP1TaskKind(task) === "english-main") setTaskStatus(task, derived === "completed" ? "completed" : derived === "not-started" ? "not-started" : "in-progress");
    else setTaskStatus(task, record.status === "completed" ? "completed" : record.status === "not-started" ? "not-started" : "in-progress");
  } else if (resultType === "politics") {
    task.resultTrackingVersion = 1;
    setTaskStatus(task, record.status === "completed" ? "completed" : record.status === "not-started" ? "not-started" : "in-progress");
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
    if (kind !== "english-reading") items.push(`单词：${P1_STATUS_LABELS[state.words && state.words.status || "not-started"]}`);
    if (kind !== "english-words") items.push(`阅读：${P1_STATUS_LABELS[state.reading && state.reading.status || "not-started"]}`);
    if (kind === "english-main") items.push(`英语整体：${P1_STATUS_LABELS[state.derivedStatus]}`);
    if (state.reading) items.push(`阅读正确率：${p1FormatAccuracy(calculateReadingAccuracy(state.reading))}`);
    summary.textContent = items.join("｜");
    if (kind !== "english-reading") controls.append(createTaskButton("编辑单词结果", "p1-words", taskId, "ghost"));
    if (kind !== "english-words") controls.append(createTaskButton("编辑阅读结果", "p1-reading", taskId, "ghost"));
  } else if (kind === "politics") {
    const record = findP1Record(politicsRecordsKey, date, taskId);
    if (!record) summary.textContent = "政治实际结果：未记录";
    else {
      const accuracy = calculatePoliticsAccuracy(record);
      summary.textContent = `政治：${P1_STATUS_LABELS[record.status]}｜单选 ${p1FormatAccuracy(accuracy.singleChoiceAccuracy)}｜多选 ${p1FormatAccuracy(accuracy.multipleChoiceAccuracy)}｜总计 ${p1FormatAccuracy(accuracy.totalAccuracy)}｜蒙题 ${p1FormatAccuracy(accuracy.guessedAccuracy)}｜主要错因 ${accuracy.dominantErrorCode || "未记录"}`;
    }
    controls.append(createTaskButton("编辑政治结果", "p1-politics", taskId, "ghost"));
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
  dialog.innerHTML = `<div class="p1-result-card"><div class="section-heading"><div><p class="step">实际结果</p><h2 id="p1ResultTitle">记录学习结果</h2></div><button id="closeP1ResultBtn" class="button ghost" type="button">取消</button></div><form id="p1ResultForm"><input id="p1ResultType" type="hidden"><input id="p1ResultTaskId" type="hidden"><div id="p1ResultFields" class="p1-result-form"></div><div class="button-row"><button class="button primary" type="submit">保存实际结果</button><button id="cancelP1ResultBtn" class="button ghost" type="button">取消</button><span id="p1ResultStatus" class="status" aria-live="polite"></span></div></form></div>`;
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

function openP1ResultDialog(type, taskId) {
  ensureP1ResultDialog();
  const dialog = document.querySelector("#p1ResultDialog");
  const fields = dialog.querySelector("#p1ResultFields");
  const date = getDateKey();
  dialog.querySelector("#p1ResultType").value = type;
  dialog.querySelector("#p1ResultTaskId").value = taskId;
  let record = null;
  if (type === "words") {
    record = findP1Record(englishWordRecordsKey, date, taskId) || {};
    dialog.querySelector("#p1ResultTitle").textContent = "英语单词实际结果";
    fields.innerHTML = `${p1Field("计划分钟", "plannedMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("实际分钟", "actualMinutes", "number", "min=\"0\" max=\"1440\"")}<label class="p1-checkbox"><input name="reviewCompleted" type="checkbox">滚动复习已完成</label>${p1Field("新卡数", "newCards", "number", "min=\"0\"")}${p1Field("复习卡数", "reviewedCards", "number", "min=\"0\"")}<label>错词（每行一个）<textarea name="errorWords" rows="3"></textarea></label><label>熟词僻义（每行一个）<textarea name="familiarRareMeanings" rows="3"></textarea></label><label>重要搭配（每行一个）<textarea name="collocations" rows="3"></textarea></label><label>主要问题<textarea name="mainProblem" rows="2"></textarea></label><label>下一步<textarea name="nextAction" rows="2"></textarea></label>`;
  } else if (type === "reading") {
    record = findP1Record(englishReadingRecordsKey, date, taskId) || {};
    dialog.querySelector("#p1ResultTitle").textContent = "英语阅读实际结果";
    fields.innerHTML = `${p1Field("年份", "year")}${p1Field("试卷", "paper")}${p1Field("篇目", "textNumber")}${p1Field("首遍分钟", "firstAttemptMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("正确数", "correctCount", "number", "min=\"0\"")}${p1Field("总题数", "totalQuestions", "number", "min=\"0\"")}${p1Field("错题号（逗号分隔）", "wrongQuestionNumbers")}<label>错误类型<select name="errorTypes" multiple>${Object.entries(P1_READING_ERROR_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><label>复盘状态<select name="reviewStatus"><option value="not-reviewed">未复盘</option><option value="partial">部分复盘</option><option value="complete">完整复盘</option></select></label><label class="p1-checkbox"><input name="paragraphSummaryCompleted" type="checkbox">段落概括完成</label><label class="p1-checkbox"><input name="logicMarkersReviewed" type="checkbox">逻辑标志复盘</label><label class="p1-checkbox"><input name="evidenceLocated" type="checkbox">原文依据已定位</label><label class="p1-checkbox"><input name="optionAnalysisCompleted" type="checkbox">选项分析完成</label><label>长难句（每行一个）<textarea name="longSentences" rows="3"></textarea></label><label>高价值词（每行一个）<textarea name="highValueWords" rows="3"></textarea></label><label>主要错句<textarea name="mainErrorSentence" rows="2"></textarea></label><label>下一起点<textarea name="nextStart" rows="2"></textarea></label>`;
  } else {
    record = findP1Record(politicsRecordsKey, date, taskId) || {};
    dialog.querySelector("#p1ResultTitle").textContent = "政治实际结果";
    fields.innerHTML = `${p1Field("章节", "chapter")}${p1Field("学习内容", "content")}${p1Field("课程分钟", "courseMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("刷题分钟", "questionMinutes", "number", "min=\"0\" max=\"1440\"")}${p1Field("单选题量", "singleChoiceTotal", "number", "min=\"0\"")}${p1Field("单选正确", "singleChoiceCorrect", "number", "min=\"0\"")}${p1Field("多选题量", "multipleChoiceTotal", "number", "min=\"0\"")}${p1Field("多选正确", "multipleChoiceCorrect", "number", "min=\"0\"")}${p1Field("蒙题总数", "guessedTotal", "number", "min=\"0\"")}${p1Field("蒙对数", "guessedCorrect", "number", "min=\"0\"")}${POLITICS_ERROR_CODES.map((code) => p1Field(`${code} ${P1_POLITICS_ERROR_LABELS[code]}`, `error${code}`, "number", "min=\"0\"")).join("")}<label class="p1-wide">薄弱点（每行：知识点ID｜知识点｜错因代码；C后加｜候选可明确生成）<textarea name="weakPoints" rows="4"></textarea></label><label>完成状态<select name="status"><option value="partial">部分完成</option><option value="completed">已按标准完成</option></select></label><label>下一起点<textarea name="nextStart" rows="2"></textarea></label>`;
  }
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
    if (type === "words") saveEnglishWordRecord({ ...base, plannedMinutes: p1NullableFormValue(form, "plannedMinutes"), actualMinutes: p1NullableFormValue(form, "actualMinutes"), reviewCompleted: form.elements.reviewCompleted.checked, newCards: p1NullableFormValue(form, "newCards"), reviewedCards: p1NullableFormValue(form, "reviewedCards"), errorWords: p1Lines(form, "errorWords"), familiarRareMeanings: p1Lines(form, "familiarRareMeanings"), collocations: p1Lines(form, "collocations"), mainProblem: form.elements.mainProblem.value, nextAction: form.elements.nextAction.value });
    else if (type === "reading") saveEnglishReadingRecord({ ...base, year: form.elements.year.value, paper: form.elements.paper.value, textNumber: form.elements.textNumber.value, firstAttemptMinutes: p1NullableFormValue(form, "firstAttemptMinutes"), correctCount: p1NullableFormValue(form, "correctCount"), totalQuestions: p1NullableFormValue(form, "totalQuestions"), wrongQuestionNumbers: form.elements.wrongQuestionNumbers.value, errorTypes: [...form.elements.errorTypes.selectedOptions].map((option) => option.value), paragraphSummaryCompleted: form.elements.paragraphSummaryCompleted.checked, logicMarkersReviewed: form.elements.logicMarkersReviewed.checked, evidenceLocated: form.elements.evidenceLocated.checked, optionAnalysisCompleted: form.elements.optionAnalysisCompleted.checked, reviewStatus: form.elements.reviewStatus.value, longSentences: p1Lines(form, "longSentences"), highValueWords: p1Lines(form, "highValueWords"), mainErrorSentence: form.elements.mainErrorSentence.value, nextStart: form.elements.nextStart.value });
    else {
      const weakPoints = p1Lines(form, "weakPoints").map((line) => { const [knowledgePointId, knowledgePoint, reasonCode, flag] = line.split(/[｜|]/).map((item) => item.trim()); return { knowledgePointId, knowledgePoint, reasonCode: String(reasonCode || "").toUpperCase(), candidateRequested: flag === "候选" }; });
      savePoliticsRecord({ ...base, chapter: form.elements.chapter.value, content: form.elements.content.value, courseMinutes: p1NullableFormValue(form, "courseMinutes"), questionMinutes: p1NullableFormValue(form, "questionMinutes"), singleChoiceTotal: p1NullableFormValue(form, "singleChoiceTotal"), singleChoiceCorrect: p1NullableFormValue(form, "singleChoiceCorrect"), multipleChoiceTotal: p1NullableFormValue(form, "multipleChoiceTotal"), multipleChoiceCorrect: p1NullableFormValue(form, "multipleChoiceCorrect"), guessedTotal: p1NullableFormValue(form, "guessedTotal"), guessedCorrect: p1NullableFormValue(form, "guessedCorrect"), errorCodes: Object.fromEntries(POLITICS_ERROR_CODES.map((code) => [code, p1NullableFormValue(form, `error${code}`)])), weakPoints, status: form.elements.status.value, nextStart: form.elements.nextStart.value });
    }
    closeP1ResultDialog(); renderTasks(); renderRecentSevenDays();
  } catch (error) {
    setStatus("#p1ResultStatus", error.message || "结果保存失败。", true);
  }
}

function handleP1TaskAction(action, task) {
  if (!action || !task) return false;
  if (action === "p1-words") { openP1ResultDialog("words", String(task.taskId || task.id)); return true; }
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
    : { valid: false, message: "英语单词和英语阅读均保存为完成后，英语主任务才能完成。" };
}

function initP1Results() {
  ensureP1ResultDialog();
}
