// P1 Checkpoint 2: output record storage, rewrite review, and compact UI.
function readOutputRecords() { const value = readJson(outputRecordsKey, []); return Array.isArray(value) ? value : []; }
function getTodayOutputRecords(date = getDateKey()) { return readOutputRecords().filter((record) => record && record.date === date); }
function validateP1OutputTaskCompletion(task, date = getDateKey()) { return validateOutputTaskCompletion(task, readOutputRecords(), date); }
function completeOutputTaskAfterValidSave(record, records) {
  const plan = getTodayPlan();
  const taskId = String(record && record.taskId || "");
  const task = plan.tasks.find((item) => item
    && (item.category === "output" || item.sourceTaskKey === "outputOrMock")
    && String(item.taskId || item.id || "") === taskId);
  if (!task || !validateOutputTaskCompletion(task, records, record.date).valid) return false;
  if (typeof focusTimerState !== "undefined"
    && focusTimerState.activeTaskId === task.id
    && typeof settleBeforeFocusTaskSwitch === "function") {
    settleBeforeFocusTaskSwitch("");
  }
  setTaskStatus(task, "completed");
  if (typeof clearTerminalCurrentPlanTask === "function") clearTerminalCurrentPlanTask(plan, task.id);
  saveTodayPlan(plan);
  return true;
}
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
  completeOutputTaskAfterValidSave(outcome.record, outcome.records);
  return outcome.record;
}
function appendP1OutputSummary(task, content, controls) {
  if (!task || !(task.category === "output" || task.sourceTaskKey === "outputOrMock")) return;
  const records = getTodayOutputRecords().filter((record) => record.taskId === String(task.taskId || task.id));
  const latest = records.at(-1);
  const summary = document.createElement("div"); summary.className = "p1-result-summary";
  summary.textContent = latest ? `今日输出：${latest.subject} · ${latest.outputType}｜${latest.closedBook ? "闭卷" : "非闭卷"}｜${latest.rewriteRequired ? "待重写" : "无需重写"}` : "今日输出：未记录";
  content.appendChild(summary); controls.append(createTaskButton("记录闭卷输出", "p1-output", String(task.taskId || task.id), "ghost"));
}
function ensureOutputPanel() {
  if (document.querySelector("#outputResultsPanel")) return;
  const panel = document.createElement("details"); panel.id = "outputResultsPanel"; panel.className = "professional-results-panel";
  panel.innerHTML = `<summary>专业课输出训练</summary><p class="muted">优先记录真实闭卷产物；结果分钟不会计入专注累计。</p><div class="professional-quick-record"><label for="outputQuickRecord">快速记录</label><textarea id="outputQuickRecord" rows="5" spellcheck="false" placeholder="点击“复制模板”，填写后粘贴到这里"></textarea><div class="button-row"><button id="copyOutputTemplateBtn" class="button secondary" type="button">复制模板</button><button id="saveOutputQuickBtn" class="button primary" type="button">解析并保存</button><span id="outputQuickStatus" class="status" aria-live="polite"></span></div></div><details class="professional-advanced-editor"><summary>高级编辑：逐项修改</summary><form id="outputResultForm"><input name="recordId" type="hidden"><input name="taskId" type="hidden"><div class="p1-result-form"><label>科目<select name="subject"><option value="722">722</option><option value="844">844</option></select></label><label>输出类型<select name="outputType"><option value="level1-outline">一级提纲</option><option value="detailed-outline">详细提纲</option><option value="core-paragraph">核心段</option><option value="full-essay">完整论述</option><option value="mock">模拟</option></select></label><label class="p1-wide">题目<input name="question" maxlength="500"></label><label>来源<select name="sourceType"><option value="nankai-real">南开真题</option><option value="textbook">教材</option><option value="mother-question">母题</option><option value="self-designed">自拟</option></select></label><label>来源说明<input name="sourceDetail" maxlength="300"></label><label>实际分钟<input name="actualMinutes" type="number" min="0"></label><label>字数<input name="wordCount" type="number" min="0"></label><label class="p1-checkbox"><input name="closedBook" type="checkbox">闭卷完成</label><label>教材覆盖<select name="textbookCoverage"><option value="not-checked">未检查</option><option value="partial">部分</option><option value="mostly-complete">大体完整</option><option value="complete">完整</option></select></label><label>原著调用<select name="originalTextUsage"><option value="none">无</option><option value="recognized">能识别</option><option value="callable">可调用</option><option value="accurate">准确</option></select></label><label>批改状态<select name="reviewStatus"><option value="pending-review">待批改</option><option value="passed">通过</option><option value="partial">部分通过</option><option value="failed">未通过</option></select></label><label class="p1-wide">结构结果<textarea name="structureResult" rows="2"></textarea></label><label>主要问题（每行一个）<textarea name="mainProblems" rows="3"></textarea></label><label>关联知识单元ID（每行一个）<textarea name="relatedKnowledgeUnitIds" rows="3"></textarea></label><label class="p1-checkbox"><input name="rewriteRequired" type="checkbox">需要重写</label><label>重写到期日<input name="rewriteDueDate" type="date"></label><label class="p1-wide">下一步<input name="nextAction" maxlength="500"></label></div><div class="button-row"><button class="button primary" type="submit">保存输出结果</button><button id="cancelOutputEditBtn" class="button ghost" type="button">取消</button><span id="outputResultStatus" class="status"></span></div></form></details><div id="outputResultsList" class="professional-results-list"></div>`;
  panel.querySelector("#outputQuickRecord").placeholder = "填写真实闭卷产物后保存记录";
  panel.querySelector("#copyOutputTemplateBtn").hidden = true;
  panel.querySelector("#saveOutputQuickBtn").textContent = "保存记录";
  panel.querySelector(".professional-advanced-editor").hidden = true;
  const anchor = document.querySelector("#professionalResultsPanel"); anchor.insertAdjacentElement("afterend", panel);
  panel.querySelector("#outputResultForm").addEventListener("submit", submitOutputForm);
  panel.querySelector("#cancelOutputEditBtn").addEventListener("click", clearOutputForm);
  panel.querySelector("#copyOutputTemplateBtn").addEventListener("click", () => copyOutputQuickTemplate(""));
  panel.querySelector("#saveOutputQuickBtn").addEventListener("click", saveOutputQuickRecord);
}
function getOutputTaskId() {
  const formTaskId = document.querySelector("#outputResultForm")?.elements.taskId.value;
  if (formTaskId) return formTaskId;
  const tasks = typeof getTodayPlan === "function" ? getTodayPlan()?.tasks || [] : [];
  const task = tasks.find((item) => item && (item.category === "output" || item.sourceTaskKey === "outputOrMock"));
  return task ? String(task.taskId || task.id || "") : "";
}
function copyOutputQuickTemplate(subject = "") {
  const subjectCode = ["722", "844"].includes(String(subject || "").trim()) ? String(subject).trim() : "";
  const textarea = document.querySelector("#outputQuickRecord"); textarea.value = buildOutputQuickTemplate(subjectCode); textarea.focus(); textarea.setSelectionRange(0, 0);
  setStatus(
    "#outputQuickStatus",
    subjectCode
      ? `已按当前任务填入 ${subjectCode} 输出模板，请记录真实闭卷产物。`
      : "当前任务无法唯一判断 722 或 844；请先在模板开头填写科目，再保存记录。",
    !subjectCode,
  );
}
function saveOutputQuickRecord() {
  try {
    const taskId = getOutputTaskId(); if (!taskId) throw new Error("未找到今日专业课输出任务，请先从时间表点击“记录闭卷输出”。");
    const input = parseOutputQuickRecord(document.querySelector("#outputQuickRecord").value, { date: getDateKey(), taskId });
    saveOutputRecord(input); document.querySelector("#outputQuickRecord").value = "";
    renderOutputRecords(); renderTasks(); renderDueReviews();
    setStatus("#outputQuickStatus", `已保存 ${input.subject} 闭卷输出${input.rewriteRequired ? "，并生成重写复盘" : ""}。`);
    if (typeof showResultHandoff === "function") showResultHandoff(taskId, `已保存：${input.subject} 闭卷输出`);
  } catch (error) { setStatus("#outputQuickStatus", error.message || "保存失败。", true); }
}
function outputFormNullable(form, name) { const value = form.elements[name].value.trim(); return value === "" ? null : Number(value); }
function clearOutputForm() { const form = document.querySelector("#outputResultForm"); if (form) form.reset(); }
function submitOutputForm(event) {
  event.preventDefault(); const form = event.currentTarget;
  try {
    const taskId = form.elements.taskId.value;
    saveOutputRecord({ recordId: form.elements.recordId.value, date: getDateKey(), taskId: form.elements.taskId.value, subject: form.elements.subject.value, question: form.elements.question.value, sourceType: form.elements.sourceType.value, sourceDetail: form.elements.sourceDetail.value, outputType: form.elements.outputType.value, actualMinutes: outputFormNullable(form, "actualMinutes"), wordCount: outputFormNullable(form, "wordCount"), closedBook: form.elements.closedBook.checked, textbookCoverage: form.elements.textbookCoverage.value, originalTextUsage: form.elements.originalTextUsage.value, structureResult: form.elements.structureResult.value, mainProblems: form.elements.mainProblems.value, reviewStatus: form.elements.reviewStatus.value, rewriteRequired: form.elements.rewriteRequired.checked, rewriteDueDate: form.elements.rewriteDueDate.value, relatedKnowledgeUnitIds: form.elements.relatedKnowledgeUnitIds.value, nextAction: form.elements.nextAction.value });
    clearOutputForm(); renderOutputRecords(); renderTasks(); renderDueReviews(); setStatus("#outputResultStatus", "输出结果已保存。");
    if (typeof showResultHandoff === "function") showResultHandoff(taskId, "已保存：专业课输出结果");
  } catch (error) { setStatus("#outputResultStatus", error.message || "保存失败。", true); }
}
function editOutputRecord(recordId) {
  const record = readOutputRecords().find((item) => item.recordId === recordId); if (!record) return;
  const form = document.querySelector("#outputResultForm"); document.querySelector("#outputResultsPanel").open = true;
  form.closest(".professional-advanced-editor").open = true;
  Object.entries(record).forEach(([key, value]) => { const field = form.elements[key]; if (!field) return; if (field.type === "checkbox") field.checked = value === true; else field.value = Array.isArray(value) ? value.join("\n") : value == null ? "" : value; });
}
function renderOutputRecords() {
  const list = document.querySelector("#outputResultsList"); if (!list) return; list.replaceChildren();
  getTodayOutputRecords().forEach((record) => {
    const row = document.createElement("article"); row.className = "professional-unit-row";
    const text = document.createElement("div");
    text.innerHTML = `<strong>${record.subject} · ${record.outputType} · ${record.question}</strong><span>${record.closedBook ? "闭卷" : "非闭卷"}｜${record.actualMinutes == null ? "用时未记录" : `${record.actualMinutes}分钟`}｜${record.rewriteRequired ? "待重写" : "无需重写"}</span>`;
    row.append(text); list.appendChild(row);
  });
}
function handleP1OutputAction(action, task) {
  if (action !== "p1-output") return false;
  ensureOutputPanel();
  const form = document.querySelector("#outputResultForm");
  const panel = document.querySelector("#outputResultsPanel");
  const quickRecord = document.querySelector("#outputQuickRecord");
  const targetSubject = typeof inferPlanOutputSubject === "function" ? inferPlanOutputSubject(task) : "";
  const draftSubject = getOutputQuickDraftSubject(quickRecord.value);
  form.elements.taskId.value = String(task.taskId || task.id);
  panel.open = true;
  if (targetSubject) form.elements.subject.value = targetSubject;
  if (draftSubject && targetSubject && draftSubject !== targetSubject) {
    const draftLabel = draftSubject === "unknown" ? "无法识别科目" : `${draftSubject} 科目`;
    setStatus("#outputQuickStatus", `记录框中有${draftLabel}草稿；原文已保留。请先保存或清空，再进入 ${targetSubject} 输出记录。`, true);
    quickRecord.focus();
  } else if (!draftSubject) {
    copyOutputQuickTemplate(targetSubject);
  } else if (!targetSubject) {
    setStatus("#outputQuickStatus", draftSubject === "unknown" ? "现有草稿尚未明确 722 或 844；原文已保留，请补全科目后保存。" : `当前任务科目不唯一；将按草稿中的 ${draftSubject} 保存。`, draftSubject === "unknown");
    quickRecord.focus();
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}
function initP1Output() { ensureOutputPanel(); renderOutputRecords(); }
