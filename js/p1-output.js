// P1 Checkpoint 2: output record storage, rewrite review, and compact UI.
function readOutputRecords() { const value = readJson(outputRecordsKey, []); return Array.isArray(value) ? value : []; }
function getTodayOutputRecords(date = getDateKey()) { return readOutputRecords().filter((record) => record && record.date === date); }
function saveOutputRecord(input) {
  const now = new Date().toISOString();
  const outcome = upsertOutputRecord(readOutputRecords(), input, now);
  let queue = normalizeReviewQueueRecords(readJson(reviewQueueKey, []));
  const existingRewrite = queue.find((review) => review.sourceRecordId === outcome.record.recordId && review.reviewType === "output-rewrite" && review.status !== "cancelled");
  if (outcome.record.rewriteRequired) {
    const review = buildOutputRewriteReview(outcome.record, existingRewrite, now);
    const reviewOutcome = upsertReviewRecord(queue, review, now);
    queue = reviewOutcome.records;
    outcome.record.createdReviewIds = [...new Set([...(outcome.record.createdReviewIds || []), reviewOutcome.record.reviewId])];
    const index = outcome.records.findIndex((item) => item.recordId === outcome.record.recordId); outcome.records[index] = outcome.record;
  } else if (existingRewrite) {
    existingRewrite.status = "cancelled"; existingRewrite.updatedAt = now; queue = normalizeReviewQueueRecords(queue);
  }
  const before = readRawStorageSnapshot();
  applyStorageSnapshotTransaction({ ...before, [outputRecordsKey]: JSON.stringify(outcome.records), [reviewQueueKey]: JSON.stringify(queue) }, "p1-save-output", false);
  return outcome.record;
}
function appendP1OutputSummary(task, content, controls) {
  if (!task || !(task.category === "output" || task.sourceTaskKey === "outputOrMock")) return;
  const records = getTodayOutputRecords().filter((record) => record.taskId === String(task.taskId || task.id));
  const latest = records.at(-1);
  const summary = document.createElement("div"); summary.className = "p1-result-summary";
  summary.textContent = latest ? `今日输出：${latest.subject} · ${latest.outputType}｜${latest.closedBook ? "闭卷" : "非闭卷"}｜${latest.rewriteRequired ? "待重写" : "无需重写"}` : "今日输出：未记录";
  content.appendChild(summary); controls.append(createTaskButton("编辑输出结果", "p1-output", String(task.taskId || task.id), "ghost"));
}
function ensureOutputPanel() {
  if (document.querySelector("#outputResultsPanel")) return;
  const panel = document.createElement("details"); panel.id = "outputResultsPanel"; panel.className = "professional-results-panel";
  panel.innerHTML = `<summary>专业课输出训练</summary><p class="muted">一级提纲与完整论述分开记录；结果分钟不会计入专注累计。</p><form id="outputResultForm"><input name="recordId" type="hidden"><input name="taskId" type="hidden"><div class="p1-result-form"><label>科目<select name="subject"><option value="722">722</option><option value="844">844</option></select></label><label>输出类型<select name="outputType"><option value="level1-outline">一级提纲</option><option value="detailed-outline">详细提纲</option><option value="core-paragraph">核心段</option><option value="full-essay">完整论述</option><option value="mock">模拟</option></select></label><label class="p1-wide">题目<input name="question" maxlength="500"></label><label>来源<select name="sourceType"><option value="nankai-real">南开真题</option><option value="textbook">教材</option><option value="mother-question">母题</option><option value="self-designed">自拟</option></select></label><label>来源说明<input name="sourceDetail" maxlength="300"></label><label>计划分钟<input name="plannedMinutes" type="number" min="0"></label><label>实际分钟<input name="actualMinutes" type="number" min="0"></label><label>字数<input name="wordCount" type="number" min="0"></label><label class="p1-checkbox"><input name="closedBook" type="checkbox">闭卷完成</label><label>教材覆盖<select name="textbookCoverage"><option value="not-checked">未检查</option><option value="partial">部分</option><option value="mostly-complete">大体完整</option><option value="complete">完整</option></select></label><label>原著调用<select name="originalTextUsage"><option value="none">无</option><option value="recognized">能识别</option><option value="callable">可调用</option><option value="accurate">准确</option></select></label><label>批改状态<select name="reviewStatus"><option value="pending-review">待批改</option><option value="passed">通过</option><option value="partial">部分通过</option><option value="failed">未通过</option></select></label><label class="p1-wide">结构结果<textarea name="structureResult" rows="2"></textarea></label><label>主要问题（每行一个）<textarea name="mainProblems" rows="3"></textarea></label><label>关联知识单元ID（每行一个）<textarea name="relatedKnowledgeUnitIds" rows="3"></textarea></label><label class="p1-checkbox"><input name="rewriteRequired" type="checkbox">需要重写</label><label>重写到期日<input name="rewriteDueDate" type="date"></label><label class="p1-wide">下一步<input name="nextAction" maxlength="500"></label></div><div class="button-row"><button class="button primary" type="submit">保存输出结果</button><button id="cancelOutputEditBtn" class="button ghost" type="button">取消</button><span id="outputResultStatus" class="status"></span></div></form><div id="outputResultsList" class="professional-results-list"></div>`;
  const anchor = document.querySelector("#professionalResultsPanel"); anchor.insertAdjacentElement("afterend", panel);
  panel.querySelector("#outputResultForm").addEventListener("submit", submitOutputForm);
  panel.querySelector("#cancelOutputEditBtn").addEventListener("click", clearOutputForm);
}
function outputFormNullable(form, name) { const value = form.elements[name].value.trim(); return value === "" ? null : Number(value); }
function clearOutputForm() { const form = document.querySelector("#outputResultForm"); if (form) form.reset(); }
function submitOutputForm(event) {
  event.preventDefault(); const form = event.currentTarget;
  try {
    saveOutputRecord({ recordId: form.elements.recordId.value, date: getDateKey(), taskId: form.elements.taskId.value, subject: form.elements.subject.value, question: form.elements.question.value, sourceType: form.elements.sourceType.value, sourceDetail: form.elements.sourceDetail.value, outputType: form.elements.outputType.value, plannedMinutes: outputFormNullable(form, "plannedMinutes"), actualMinutes: outputFormNullable(form, "actualMinutes"), wordCount: outputFormNullable(form, "wordCount"), closedBook: form.elements.closedBook.checked, textbookCoverage: form.elements.textbookCoverage.value, originalTextUsage: form.elements.originalTextUsage.value, structureResult: form.elements.structureResult.value, mainProblems: form.elements.mainProblems.value, reviewStatus: form.elements.reviewStatus.value, rewriteRequired: form.elements.rewriteRequired.checked, rewriteDueDate: form.elements.rewriteDueDate.value, relatedKnowledgeUnitIds: form.elements.relatedKnowledgeUnitIds.value, nextAction: form.elements.nextAction.value });
    clearOutputForm(); renderOutputRecords(); renderTasks(); renderDueReviews(); setStatus("#outputResultStatus", "输出结果已保存。");
  } catch (error) { setStatus("#outputResultStatus", error.message || "保存失败。", true); }
}
function editOutputRecord(recordId) {
  const record = readOutputRecords().find((item) => item.recordId === recordId); if (!record) return;
  const form = document.querySelector("#outputResultForm"); document.querySelector("#outputResultsPanel").open = true;
  Object.entries(record).forEach(([key, value]) => { const field = form.elements[key]; if (!field) return; if (field.type === "checkbox") field.checked = value === true; else field.value = Array.isArray(value) ? value.join("\n") : value == null ? "" : value; });
}
function renderOutputRecords() {
  const list = document.querySelector("#outputResultsList"); if (!list) return; list.replaceChildren();
  getTodayOutputRecords().forEach((record) => { const row = document.createElement("article"); row.className = "professional-unit-row"; const text = document.createElement("div"); text.innerHTML = `<strong>${record.subject} · ${record.outputType} · ${record.question}</strong><span>${record.closedBook ? "闭卷" : "非闭卷"}｜${record.actualMinutes == null ? "用时未记录" : `${record.actualMinutes}分钟`}｜${record.rewriteRequired ? "待重写" : "无需重写"}</span>`; const button = document.createElement("button"); button.type="button"; button.className="button ghost"; button.textContent="编辑"; button.addEventListener("click",()=>editOutputRecord(record.recordId)); row.append(text,button); list.appendChild(row); });
}
function handleP1OutputAction(action, task) { if (action !== "p1-output") return false; ensureOutputPanel(); const form=document.querySelector("#outputResultForm"); form.elements.taskId.value=String(task.taskId||task.id); document.querySelector("#outputResultsPanel").open=true; document.querySelector("#outputResultsPanel").scrollIntoView({behavior:"smooth",block:"start"}); return true; }
function initP1Output() { ensureOutputPanel(); renderOutputRecords(); }
