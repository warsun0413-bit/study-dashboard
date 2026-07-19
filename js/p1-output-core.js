// P1 Checkpoint 2: pure output-result and business-review helpers.
const OUTPUT_SOURCE_TYPES = Object.freeze(["nankai-real", "textbook", "mother-question", "self-designed"]);
const OUTPUT_TYPES = Object.freeze(["level1-outline", "detailed-outline", "core-paragraph", "full-essay", "mock"]);
const OUTPUT_COVERAGE = Object.freeze(["not-checked", "partial", "mostly-complete", "complete"]);
const OUTPUT_ORIGINAL_USAGE = Object.freeze(["none", "recognized", "callable", "accurate"]);
const OUTPUT_REVIEW_STATUSES = Object.freeze(["pending-review", "passed", "partial", "failed"]);

function outputText(value, max = 500) { return String(value == null ? "" : value).trim().slice(0, max); }
function outputNullableInt(value, field, max = 100000) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) throw new Error(`${field} 必须是非负整数或未记录。`);
  return number;
}
function outputList(value, max = 50) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return [...new Set(source.map((item) => outputText(item, 240)).filter(Boolean))].slice(0, max);
}
function outputStableId(date, taskId, subject, question) {
  let hash = 2166136261;
  const source = `${date}|${taskId}|${subject}|${question}`.toLocaleLowerCase();
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `output-${date}-${subject}-${(hash >>> 0).toString(36)}`;
}
function normalizeOutputRecord(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("输出记录必须是对象。");
  const date = p1Date(input.date); const taskId = outputText(input.taskId, 120); const subject = input.subject;
  if (!taskId) throw new Error("输出记录必须关联明确 taskId。");
  if (!["722", "844"].includes(subject)) throw new Error("输出科目必须是722或844。");
  const question = outputText(input.question, 500); if (!question) throw new Error("请填写实际输出题目。");
  const sourceType = OUTPUT_SOURCE_TYPES.includes(input.sourceType) ? input.sourceType : "self-designed";
  const outputType = OUTPUT_TYPES.includes(input.outputType) ? input.outputType : "level1-outline";
  const actualMinutes = outputNullableInt(input.actualMinutes, "actualMinutes", 1440);
  const wordCount = outputNullableInt(input.wordCount, "wordCount");
  if (["full-essay", "mock"].includes(outputType) && (!(actualMinutes > 0) || !(wordCount > 0))) throw new Error("完整论述和模拟必须记录有效用时与字数。");
  const rewriteRequired = input.rewriteRequired === true;
  const rewriteDueDate = rewriteRequired ? p1Date(input.rewriteDueDate) : "";
  const now = outputText(options.now || input.updatedAt || new Date().toISOString(), 40);
  const existing = options.existing && typeof options.existing === "object" ? options.existing : {};
  return {
    recordId: outputText(existing.recordId || input.recordId, 160) || outputStableId(date, taskId, subject, question), date, taskId, subject, question,
    sourceType, sourceDetail: outputText(input.sourceDetail, 300), outputType,
    plannedMinutes: outputNullableInt(input.plannedMinutes, "plannedMinutes", 1440), actualMinutes, wordCount,
    closedBook: input.closedBook === true,
    textbookCoverage: OUTPUT_COVERAGE.includes(input.textbookCoverage) ? input.textbookCoverage : "not-checked",
    originalTextUsage: OUTPUT_ORIGINAL_USAGE.includes(input.originalTextUsage) ? input.originalTextUsage : "none",
    structureResult: outputText(input.structureResult), mainProblems: outputList(input.mainProblems),
    reviewStatus: OUTPUT_REVIEW_STATUSES.includes(input.reviewStatus) ? input.reviewStatus : "pending-review",
    rewriteRequired, rewriteDueDate, relatedKnowledgeUnitIds: outputList(input.relatedKnowledgeUnitIds),
    createdReviewIds: outputList(existing.createdReviewIds || input.createdReviewIds), nextAction: outputText(input.nextAction),
    createdAt: outputText(existing.createdAt || input.createdAt || now, 40), updatedAt: now,
  };
}
function buildOutputRewriteReview(record, existingReview, now = new Date().toISOString()) {
  if (!record.rewriteRequired) return null;
  const businessKey = `${record.subject}:${record.recordId}:output-rewrite:`;
  return {
    ...(existingReview || {}), reviewId: existingReview && existingReview.reviewId || `review-${businessKey}`,
    reviewKey: businessKey, businessKey, reviewLevel: "D0", reviewType: "output-rewrite",
    subject: record.subject, knowledgeUnitId: "", knowledgeUnit: record.question,
    sourceRecordId: record.recordId, sourceRecordType: "studyOutputRecords", sourceTaskId: record.taskId,
    dueDate: record.rewriteDueDate, task: `重写：${record.question}`, previousResult: "未验收",
    status: existingReview && ["completed", "cancelled"].includes(existingReview.status) ? "pending" : "pending",
    createdAt: existingReview && existingReview.createdAt || now, updatedAt: now,
  };
}
function upsertOutputRecord(records, input, now = new Date().toISOString()) {
  const source = Array.isArray(records) ? records.slice() : [];
  const candidateId = input.recordId || outputStableId(input.date, input.taskId, input.subject, outputText(input.question, 500));
  const index = source.findIndex((record) => record && (record.recordId === candidateId || (record.date === input.date && record.taskId === input.taskId && record.subject === input.subject && record.question === outputText(input.question, 500))));
  const normalized = normalizeOutputRecord(input, { existing: index >= 0 ? source[index] : null, now });
  if (index >= 0) source[index] = normalized; else source.push(normalized);
  return { records: source, record: normalized, created: index < 0 };
}
