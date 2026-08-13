// P1 Checkpoint 2: pure output-result and business-review helpers.
const OUTPUT_SOURCE_TYPES = Object.freeze(["nankai-real", "textbook", "mother-question", "self-designed"]);
const OUTPUT_TYPES = Object.freeze(["level1-outline", "detailed-outline", "core-paragraph", "full-essay", "mock"]);
const OUTPUT_COVERAGE = Object.freeze(["not-checked", "partial", "mostly-complete", "complete"]);
const OUTPUT_ORIGINAL_USAGE = Object.freeze(["none", "recognized", "callable", "accurate"]);
const OUTPUT_REVIEW_STATUSES = Object.freeze(["pending-review", "passed", "partial", "failed"]);

const OUTPUT_QUICK_TEMPLATE_BODY = "题目=｜类型=一级提纲｜来源=教材｜闭卷=是｜用时=｜字数=｜结构=｜问题=｜下一步=｜重写=否｜重写日期=";
function buildOutputQuickTemplate(subject = "") {
  const subjectCode = ["722", "844"].includes(String(subject || "").trim()) ? String(subject).trim() : "";
  return `${subjectCode}｜${OUTPUT_QUICK_TEMPLATE_BODY}`;
}
function getOutputQuickDraftSubject(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const subject = text.split(/\r?\n/, 1)[0].match(/^\s*(722|844)\s*[｜|]/)?.[1];
  return subject || "unknown";
}
const OUTPUT_QUICK_TEMPLATE = buildOutputQuickTemplate("722");
const OUTPUT_QUICK_TYPE_MAP = Object.freeze({
  "一级提纲": "level1-outline", "详细提纲": "detailed-outline", "核心段": "core-paragraph",
  "完整论述": "full-essay", "模拟": "mock",
});
const OUTPUT_QUICK_SOURCE_MAP = Object.freeze({ "南开真题": "nankai-real", "教材": "textbook", "母题": "mother-question", "自拟": "self-designed" });
const OUTPUT_QUICK_COVERAGE_MAP = Object.freeze({ "未检查": "not-checked", "部分": "partial", "大体完整": "mostly-complete", "完整": "complete" });
const OUTPUT_QUICK_ORIGINAL_MAP = Object.freeze({ "无": "none", "能识别": "recognized", "可调用": "callable", "准确": "accurate" });
const OUTPUT_QUICK_REVIEW_MAP = Object.freeze({ "待批改": "pending-review", "通过": "passed", "部分通过": "partial", "未通过": "failed" });

function outputText(value, max = 500) { return String(value == null ? "" : value).trim().slice(0, max); }
function outputQuickMinutes(value) {
  const text = outputText(value, 40);
  if (!text) return null;
  const match = text.match(/^(\d+)\s*(?:分钟|分)?$/);
  return match ? Number(match[1]) : value;
}
function outputNullableInt(value, field, max = 100000) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    const label = { plannedMinutes: "计划用时", actualMinutes: "实际用时", wordCount: "字数" }[field] || field;
    throw new Error(`${label}必须填写非负整数；用时可写成“45分钟”。`);
  }
  return number;
}
function outputList(value, max = 50) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return [...new Set(source.map((item) => outputText(item, 240)).filter(Boolean))].slice(0, max);
}
function outputQuickBoolean(value, field) {
  const normalized = outputText(value, 20).toLocaleLowerCase();
  if (["是", "有", "true", "yes", "1"].includes(normalized)) return true;
  if (["否", "无", "false", "no", "0"].includes(normalized)) return false;
  throw new Error(`${field}请填写“是”或“否”。`);
}
function outputQuickList(value) { return outputText(value).split(/[；;\n]/).map((item) => item.trim()).filter(Boolean); }
function parseOutputQuickRecord(value, context = {}) {
  const text = String(value || "").trim();
  if (!text) throw new Error("请先粘贴专业课输出记录。");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) throw new Error("每次只保存一条输出；请把内容放在同一行。");
  const parts = lines[0].split(/[｜|]/).map((part) => part.trim()).filter(Boolean);
  const subject = parts.shift();
  if (!["722", "844"].includes(subject)) throw new Error("输出记录必须以722或844开头。");
  const fields = {};
  const aliases = {
    "题目": "question", "类型": "outputType", "来源": "sourceType", "来源说明": "sourceDetail",
    "计划用时": "plannedMinutes", "用时": "actualMinutes", "字数": "wordCount", "闭卷": "closedBook",
    "教材覆盖": "textbookCoverage", "原著": "originalTextUsage", "批改": "reviewStatus",
    "结构": "structureResult", "问题": "mainProblems", "关联单元": "relatedKnowledgeUnitIds",
    "重写": "rewriteRequired", "重写日期": "rewriteDueDate", "下一步": "nextAction",
  };
  parts.forEach((part) => {
    const separator = part.search(/[=＝]/);
    if (separator < 1) throw new Error(`无法识别字段：${part}`);
    const label = part.slice(0, separator).trim();
    const key = aliases[label];
    if (!key) throw new Error(`无法识别字段：${label}`);
    if (Object.prototype.hasOwnProperty.call(fields, key)) throw new Error(`字段重复：${label}`);
    fields[key] = part.slice(separator + 1).trim();
  });
  if (!fields.question) throw new Error("请填写实际输出题目。");
  if (!fields.structureResult) throw new Error("请填写闭卷输出后的结构结果。");
  if (!Object.prototype.hasOwnProperty.call(fields, "closedBook")) throw new Error("请明确填写闭卷=是或否。");
  const outputType = OUTPUT_QUICK_TYPE_MAP[fields.outputType || "一级提纲"];
  if (!outputType) throw new Error("类型仅支持一级提纲、详细提纲、核心段、完整论述或模拟。");
  const sourceType = OUTPUT_QUICK_SOURCE_MAP[fields.sourceType || "自拟"];
  if (!sourceType) throw new Error("来源仅支持南开真题、教材、母题或自拟。");
  const rewriteRequired = outputQuickBoolean(fields.rewriteRequired || "否", "重写");
  if (rewriteRequired && !fields.rewriteDueDate) throw new Error("需要重写时必须填写重写日期。");
  return {
    date: context.date, taskId: context.taskId, subject, question: fields.question,
    sourceType, sourceDetail: fields.sourceDetail || "", outputType,
    plannedMinutes: outputQuickMinutes(fields.plannedMinutes), actualMinutes: outputQuickMinutes(fields.actualMinutes),
    wordCount: fields.wordCount || null, closedBook: outputQuickBoolean(fields.closedBook, "闭卷"),
    textbookCoverage: OUTPUT_QUICK_COVERAGE_MAP[fields.textbookCoverage] || "not-checked",
    originalTextUsage: OUTPUT_QUICK_ORIGINAL_MAP[fields.originalTextUsage] || "none",
    reviewStatus: OUTPUT_QUICK_REVIEW_MAP[fields.reviewStatus] || "pending-review",
    structureResult: fields.structureResult, mainProblems: outputQuickList(fields.mainProblems),
    relatedKnowledgeUnitIds: outputQuickList(fields.relatedKnowledgeUnitIds), rewriteRequired,
    rewriteDueDate: fields.rewriteDueDate || "", nextAction: fields.nextAction || "",
  };
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

function validateOutputTaskCompletion(task, records, date) {
  if (!task || !(task.category === "output" || task.sourceTaskKey === "outputOrMock")) return { valid: true };
  const taskId = outputText(task.taskId || task.id, 120);
  const dateKey = p1Date(date);
  const related = (Array.isArray(records) ? records : []).filter((record) => record
    && record.date === dateKey
    && outputText(record.taskId, 120) === taskId);
  if (!related.length) {
    return { valid: false, message: "专业课输出完成前，请先保存一条关联当前任务的闭卷产物。" };
  }
  const hasClosedBookProduct = related.some((record) => record.closedBook === true
    && Boolean(outputText(record.question, 500))
    && Boolean(outputText(record.structureResult)));
  return hasClosedBookProduct
    ? { valid: true }
    : { valid: false, message: "专业课输出只有在已保存“闭卷=是”且填写题目和结构结果后才能完成。" };
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
