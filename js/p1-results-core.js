// P1 Checkpoint 1: pure English and politics result normalization and derivation.
const P1_ENGLISH_POLITICS_MIGRATION_ID = "p1-english-politics-results-v1";
const P1_RESULT_STATUSES = Object.freeze(["not-started", "partial", "completed"]);
const P1_ENGLISH_DERIVED_STATUSES = Object.freeze(["not-started", "in-progress", "partial", "completed", "legacy-unstructured"]);
const ENGLISH_READING_ERROR_TYPES = Object.freeze([
  "concept-substitution", "scope-expansion", "polarity-reversal", "causal-reversal",
  "unsupported-addition", "example-as-viewpoint", "over-inference", "location-error",
  "sentence-error", "vocabulary-error", "other",
]);
const ENGLISH_READING_QUICK_TEMPLATE = "年份=｜篇目=｜用时=\n正确=｜总题数=｜错题号=\n复盘=｜段落概括=｜原文依据=｜选项分析=\n错误类型=｜下一步=";
const ENGLISH_WORD_QUICK_TEMPLATE = "实际分钟=｜滚动复习=\n错词=｜熟词僻义=｜重要搭配=\n主要问题=｜下一步=";
const POLITICS_QUICK_TEMPLATE = "章节=｜内容=\n课程分钟=｜刷题分钟=\n单选正确=｜单选总数=｜多选正确=｜多选总数=\n下一步=";
const ENGLISH_READING_QUICK_ERROR_MAP = Object.freeze({
  "概念偷换": "concept-substitution", "范围扩大": "scope-expansion", "正反颠倒": "polarity-reversal",
  "因果倒置": "causal-reversal", "无中生有": "unsupported-addition", "例子冒充观点": "example-as-viewpoint",
  "过度推断": "over-inference", "定位错误": "location-error", "长难句理解错误": "sentence-error",
  "词义判断错误": "vocabulary-error", "其他": "other",
});
const POLITICS_ERROR_CODES = Object.freeze(["K", "M", "L", "W", "C", "G"]);

function p1IsObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function p1String(value, maxLength = 500) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function p1QuickMinutes(value) {
  const text = p1String(value, 40);
  if (!text) return null;
  const minuteSecondMatch = text.match(/^(\d+)\s*分(?:钟)?\s*(\d{1,2})\s*秒$/);
  if (minuteSecondMatch) return Math.round((Number(minuteSecondMatch[1]) * 60 + Number(minuteSecondMatch[2])) / 60);
  const match = text.match(/^(\d+)\s*(?:分钟|分)?$/);
  return match ? Number(match[1]) : value;
}

function p1NullableInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0 || number > maximum) {
    const label = {
      plannedMinutes: "计划分钟",
      actualMinutes: "实际分钟",
      firstAttemptMinutes: "阅读用时",
      courseMinutes: "课程分钟",
      questionMinutes: "刷题分钟",
    }[field] || field;
    throw new Error(`${label}必须填写 0—${maximum} 的整数，可省略“分钟”。`);
  }
  return number;
}

function p1StringList(value, maximumItems = 100, itemLength = 160) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return [...new Set(source.map((item) => p1String(item, itemLength)).filter(Boolean))].slice(0, maximumItems);
}

function p1QuickBoolean(value, field) {
  const normalized = p1String(value, 160).toLocaleLowerCase().replace(/\s+/g, "");
  if (["是", "已完成", "已核验", "已复盘", "已分析", "true", "yes", "1"].includes(normalized)) return true;
  if (["否", "未完成", "未核验", "未复盘", "未分析", "false", "no", "0"].includes(normalized)) return false;
  const unfinishedSignals = ["尚未", "还未", "未能", "没能", "没有完成", "未完成", "未核验", "未复盘", "未分析", "不完整", "待完成", "待核验", "待复盘", "待分析"];
  if (unfinishedSignals.some((signal) => normalized.includes(signal))) return false;
  const completedSignals = ["已完成", "已核验", "已复盘", "已分析", "完成了", "核验完", "复盘完", "分析完", "已理清", "已梳理"];
  if (completedSignals.some((signal) => normalized.includes(signal))) return true;
  return false;
}
function p1QuickItems(value) { return p1String(value).split(/[；;，,、\n]/).map((item) => item.trim()).filter(Boolean); }
function p1ReadingWrongQuestionNumbers(value) {
  const emptyLabels = new Set(["无", "暂无", "没有", "无错题", "none"]);
  return p1QuickItems(value).filter((item) => !emptyLabels.has(item.toLocaleLowerCase()));
}
function p1ReadingErrorDetails(value) {
  const emptyLabels = new Set(["无", "暂无", "没有", "none"]);
  const errorTypes = [];
  const riskNotes = [];
  p1String(value).split(/[；;\n]/).map((item) => item.trim()).filter(Boolean).forEach((item) => {
    if (emptyLabels.has(item.toLocaleLowerCase())) return;
    const mapped = ENGLISH_READING_QUICK_ERROR_MAP[item] || (ENGLISH_READING_ERROR_TYPES.includes(item) ? item : "");
    if (mapped) {
      if (!errorTypes.includes(mapped)) errorTypes.push(mapped);
      return;
    }
    if (!errorTypes.includes("other")) errorTypes.push("other");
    riskNotes.push(item);
  });
  return { errorTypes, riskNotes };
}
function parseEnglishWordQuickRecord(value, context = {}) {
  const aliases = {
    "计划分钟": "plannedMinutes", "实际分钟": "actualMinutes", "滚动复习": "reviewCompleted",
    "新卡": "newCards", "复习卡": "reviewedCards", "错词": "errorWords",
    "熟词僻义": "familiarRareMeanings", "重要搭配": "collocations", "搭配": "collocations",
    "主要问题": "mainProblem", "下一步": "nextAction",
  };
  const fields = {};
  String(value || "").split(/\r?\n/).flatMap((line) => line.split(/[｜|]/)).map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const separator = part.search(/[=＝]/);
    if (separator < 1) throw new Error(`无法识别内容：${part}`);
    const label = part.slice(0, separator).trim(); const key = aliases[label];
    if (!key) throw new Error(`无法识别字段：${label}`);
    if (Object.prototype.hasOwnProperty.call(fields, key)) throw new Error(`字段重复：${label}`);
    fields[key] = part.slice(separator + 1).trim();
  });
  const actualMinutes = p1QuickMinutes(fields.actualMinutes);
  if (!(Number(actualMinutes) > 0)) throw new Error("请填写大于0的实际分钟，例如“28”或“28分钟”。");
  const errorWords = p1QuickItems(fields.errorWords); const familiarRareMeanings = p1QuickItems(fields.familiarRareMeanings); const collocations = p1QuickItems(fields.collocations);
  const hasResult = errorWords.length || familiarRareMeanings.length || collocations.length || fields.mainProblem || fields.nextAction;
  if (!hasResult) throw new Error("请至少填写词汇产出、主要问题或下一步中的一项。");
  return normalizeEnglishWordRecord({
    date: context.date, taskId: context.taskId, plannedMinutes: p1QuickMinutes(fields.plannedMinutes),
    actualMinutes, reviewCompleted: p1QuickBoolean(fields.reviewCompleted || "否", "滚动复习"),
    newCards: fields.newCards || null, reviewedCards: fields.reviewedCards || null,
    errorWords, familiarRareMeanings, collocations, mainProblem: fields.mainProblem || "", nextAction: fields.nextAction || "",
  });
}
function parseEnglishReadingQuickRecord(value, context = {}) {
  const aliases = {
    "年份": "year", "试卷": "paper", "篇目": "textNumber", "用时": "firstAttemptMinutes",
    "正确": "correctCount", "正确数": "correctCount", "总题数": "totalQuestions", "错题号": "wrongQuestionNumbers",
    "错误类型": "errorTypes", "复盘": "reviewStatus", "段落概括": "paragraphSummaryCompleted",
    "逻辑标志": "logicMarkersReviewed", "原文依据": "evidenceLocated", "选项分析": "optionAnalysisCompleted",
    "长难句": "longSentences", "高价值词": "highValueWords", "主要错句": "mainErrorSentence", "下一步": "nextStart",
  };
  const fields = {};
  const reviewNoteLines = [];
  String(value || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const noteParts = [];
    line.split(/[｜|]/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
      const match = part.match(/^([^=＝]+)[=＝](.*)$/);
      const label = match ? match[1].trim() : "";
      const key = aliases[label];
      if (!key) {
        noteParts.push(part);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        noteParts.push(part);
        return;
      }
      fields[key] = match[2].trim();
    });
    if (noteParts.length) reviewNoteLines.push(noteParts.join("｜"));
  });
  if (!fields.year || !fields.textNumber) throw new Error("请填写阅读年份和篇目。");
  if (fields.correctCount === "" || fields.correctCount == null || fields.totalQuestions === "" || fields.totalQuestions == null) throw new Error("请填写正确数和总题数，不能只记录用时。");
  const scoreMatch = String(fields.correctCount).match(/^(\d+)\s*[\/／]\s*(\d+)$/);
  if (scoreMatch) {
    if (Number(fields.totalQuestions) !== Number(scoreMatch[2])) throw new Error("正确数中的总题数与“总题数”不一致，请核对后再保存。");
    fields.correctCount = scoreMatch[1];
  }
  const reviewStatusMap = {
    "未复盘": "not-reviewed", "未完成": "not-reviewed", "否": "not-reviewed",
    "部分": "partial", "部分复盘": "partial",
    "完整": "complete", "完整复盘": "complete", "完成": "complete", "已完成": "complete",
  };
  const reviewStatusText = String(fields.reviewStatus || "").trim();
  const reviewStatus = reviewStatusMap[reviewStatusText]
    || (/^(?:未|尚未|还未|没有)/.test(reviewStatusText) ? "not-reviewed" : reviewStatusText ? "partial" : "not-reviewed");
  if (reviewStatusText && !reviewStatusMap[reviewStatusText]) reviewNoteLines.unshift(`复盘=${reviewStatusText}`);
  const errorDetails = p1ReadingErrorDetails(fields.errorTypes);
  const mainErrorSentence = [fields.mainErrorSentence, ...errorDetails.riskNotes].filter(Boolean).join("；");
  const record = {
    date: context.date, taskId: context.taskId, year: fields.year, paper: fields.paper || "英语一", textNumber: fields.textNumber,
    firstAttemptMinutes: p1QuickMinutes(fields.firstAttemptMinutes), correctCount: fields.correctCount, totalQuestions: fields.totalQuestions,
    wrongQuestionNumbers: p1ReadingWrongQuestionNumbers(fields.wrongQuestionNumbers), errorTypes: errorDetails.errorTypes, reviewStatus,
    paragraphSummaryCompleted: p1QuickBoolean(fields.paragraphSummaryCompleted || "否", "段落概括"),
    logicMarkersReviewed: p1QuickBoolean(fields.logicMarkersReviewed || "否", "逻辑标志"),
    evidenceLocated: p1QuickBoolean(fields.evidenceLocated || "否", "原文依据"),
    optionAnalysisCompleted: p1QuickBoolean(fields.optionAnalysisCompleted || "否", "选项分析"),
    longSentences: p1QuickItems(fields.longSentences), highValueWords: p1QuickItems(fields.highValueWords),
    mainErrorSentence, nextStart: fields.nextStart || "",
  };
  const reviewNotes = reviewNoteLines.join("\n").trim();
  if (reviewNotes) record.reviewNotes = reviewNotes;
  return normalizeEnglishReadingRecord(record);
}

function parseEnglishReadingReviewQuickRecord(value, context = {}) {
  const source = String(value || "").trim();
  if (!source) throw new Error("请先粘贴英语阅读复盘记录。");
  const plain = source
    .replace(/```[\w-]*|```/g, "")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[#>\-]+\s*/gm, "")
    .trim();
  const reading = plain.match(/\b(20\d{2})\s*年?\s*(?:英语一\s*)?Text\s*(\d+)\b/i);
  const level = plain.match(/\b(D(?:1|3|7|14|30))\b/i);
  if (!reading || !level || !/(?:遮挡重构|阅读复盘|复盘).{0,12}(?:完成|已完成)|(?:完成|已完成).{0,12}(?:遮挡重构|阅读复盘|复盘)/.test(plain)) {
    throw new Error("这不是可识别的英语 D1/D3/D7/D14/D30 完成记录。");
  }
  const year = reading[1];
  const textNumber = `Text ${Number(reading[2])}`;
  const reviewLevel = level[1].toUpperCase();
  const nextMatch = plain.match(/(?:下一准确起点|下一步)\s*[：:=]?\s*([\s\S]*?)(?:\n建议保持|\n建议|$)/);
  const nextStart = p1String(nextMatch && nextMatch[1], 240)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[#>\-]+\s*/, "").trim())
    .filter(Boolean)[0] || "";
  return {
    date: context.date,
    taskId: p1String(context.taskId, 120),
    subject: "english",
    year,
    paper: "英语一",
    textNumber,
    reviewLevel,
    knowledgeUnitId: `english-reading-${year}-text-${Number(reading[2])}`,
    knowledgeUnit: `${year} 英语一 ${textNumber}`,
    task: `${reviewLevel} 遮挡重构：${year} 英语一 ${textNumber}`,
    note: p1String(plain, 500),
    nextStart,
  };
}

function parsePoliticsQuickRecord(value, context = {}) {
  const aliases = {
    "章节": "chapter", "内容": "content", "课程分钟": "courseMinutes", "刷题分钟": "questionMinutes",
    "单选正确": "singleChoiceCorrect", "单选总数": "singleChoiceTotal", "多选正确": "multipleChoiceCorrect", "多选总数": "multipleChoiceTotal",
    "蒙对": "guessedCorrect", "蒙题总数": "guessedTotal", "错因K": "errorK", "错因M": "errorM",
    "错因L": "errorL", "错因W": "errorW", "错因C": "errorC", "错因G": "errorG",
    "薄弱点": "weakPoints", "完成状态": "status", "下一步": "nextStart",
  };
  const fields = {};
  String(value || "").split(/\r?\n/).flatMap((line) => line.split(/[｜|]/)).map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const separator = part.search(/[=＝]/);
    if (separator < 1) throw new Error(`无法识别内容：${part}`);
    const label = part.slice(0, separator).trim(); const key = aliases[label];
    if (!key) throw new Error(`无法识别字段：${label}`);
    if (Object.prototype.hasOwnProperty.call(fields, key)) throw new Error(`字段重复：${label}`);
    fields[key] = part.slice(separator + 1).trim();
  });
  if (!fields.chapter || !fields.content) throw new Error("请填写政治章节和实际学习内容。");
  const courseMinutes = p1QuickMinutes(fields.courseMinutes);
  const questionMinutes = p1QuickMinutes(fields.questionMinutes);
  if (!(Number(courseMinutes) > 0) && !(Number(questionMinutes) > 0)) throw new Error("课程分钟或刷题分钟至少一项必须大于0，例如“35”或“35分钟”。");
  [["singleChoiceCorrect", "singleChoiceTotal", "单选"], ["multipleChoiceCorrect", "multipleChoiceTotal", "多选"], ["guessedCorrect", "guessedTotal", "蒙题"]].forEach(([correctKey, totalKey, label]) => {
    const hasCorrect = fields[correctKey] !== "" && fields[correctKey] != null; const hasTotal = fields[totalKey] !== "" && fields[totalKey] != null;
    if (hasCorrect !== hasTotal) throw new Error(`${label}正确数和总数必须同时填写。`);
  });
  const statusMap = { "": "partial", "部分": "partial", "部分完成": "partial", "完成": "completed", "已完成": "completed" };
  const status = statusMap[fields.status || ""];
  if (!status) throw new Error("完成状态仅支持部分或完成。");
  const weakPoints = p1String(fields.weakPoints).split(/[；;\n]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const [knowledgePointId, knowledgePoint, rawCode, extra] = item.split("/").map((part) => part.trim());
    const reasonCode = String(rawCode || "").toUpperCase();
    if (!knowledgePointId || !knowledgePoint || !POLITICS_ERROR_CODES.includes(reasonCode) || extra) throw new Error("薄弱点格式应为：知识点ID/知识点/错因代码。");
    return { knowledgePointId, knowledgePoint, reasonCode, candidateRequested: false };
  });
  return normalizePoliticsRecord({
    date: context.date, taskId: context.taskId, chapter: fields.chapter, content: fields.content,
    courseMinutes, questionMinutes,
    singleChoiceCorrect: fields.singleChoiceCorrect || null, singleChoiceTotal: fields.singleChoiceTotal || null,
    multipleChoiceCorrect: fields.multipleChoiceCorrect || null, multipleChoiceTotal: fields.multipleChoiceTotal || null,
    guessedCorrect: fields.guessedCorrect || null, guessedTotal: fields.guessedTotal || null,
    errorCodes: Object.fromEntries(POLITICS_ERROR_CODES.map((code) => [code, fields[`error${code}`] || null])),
    weakPoints, status, nextStart: fields.nextStart || "",
  });
}

function p1Date(value) {
  const date = p1String(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date 必须是本地 YYYY-MM-DD 日期。");
  return date;
}

function p1StableId(prefix, date, taskId, suffix = "") {
  const safe = `${date}-${taskId}-${suffix}`.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-");
  return `${prefix}-${safe}`;
}

function p1HasContent(record, ignoredKeys = []) {
  const ignored = new Set(["recordId", "date", "taskId", "subtaskId", "status", "createdAt", "updatedAt", ...ignoredKeys]);
  return Object.entries(record).some(([key, value]) => {
    if (ignored.has(key)) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (p1IsObject(value)) return Object.values(value).some((item) => Number(item) > 0 || Boolean(item));
    if (typeof value === "boolean") return value;
    return value !== null && value !== "";
  });
}

function normalizeEnglishWordRecord(input, options = {}) {
  if (!p1IsObject(input)) throw new Error("英语单词结果必须是对象。");
  const date = p1Date(input.date);
  const taskId = p1String(input.taskId, 120);
  if (!taskId) throw new Error("英语单词结果必须关联明确 taskId。");
  const now = p1String(options.now || input.updatedAt || new Date().toISOString(), 40);
  const existing = p1IsObject(options.existing) ? options.existing : {};
  const record = {
    recordId: p1String(existing.recordId || input.recordId, 180) || p1StableId("english-words", date, taskId, "words"),
    date,
    taskId,
    subtaskId: "words",
    plannedMinutes: p1NullableInteger(input.plannedMinutes, "plannedMinutes", 1440),
    actualMinutes: p1NullableInteger(input.actualMinutes, "actualMinutes", 1440),
    reviewCompleted: input.reviewCompleted === true,
    newCards: p1NullableInteger(input.newCards, "newCards", 10000),
    reviewedCards: p1NullableInteger(input.reviewedCards, "reviewedCards", 10000),
    errorWords: p1StringList(input.errorWords),
    familiarRareMeanings: p1StringList(input.familiarRareMeanings),
    collocations: p1StringList(input.collocations),
    mainProblem: p1String(input.mainProblem),
    nextAction: p1String(input.nextAction),
    status: "not-started",
    createdAt: p1String(existing.createdAt || input.createdAt || now, 40),
    updatedAt: now,
  };
  record.status = record.reviewCompleted ? "completed" : p1HasContent(record) ? "partial" : "not-started";
  return record;
}

function normalizeEnglishReadingRecord(input, options = {}) {
  if (!p1IsObject(input)) throw new Error("英语阅读结果必须是对象。");
  const date = p1Date(input.date);
  const taskId = p1String(input.taskId, 120);
  if (!taskId) throw new Error("英语阅读结果必须关联明确 taskId。");
  const now = p1String(options.now || input.updatedAt || new Date().toISOString(), 40);
  const existing = p1IsObject(options.existing) ? options.existing : {};
  const correctCount = p1NullableInteger(input.correctCount, "correctCount", 1000);
  const totalQuestions = p1NullableInteger(input.totalQuestions, "totalQuestions", 1000);
  if (correctCount !== null && totalQuestions !== null && correctCount > totalQuestions) throw new Error("correctCount 不得大于 totalQuestions。");
  const wrongQuestionNumbers = [...new Set((Array.isArray(input.wrongQuestionNumbers) ? input.wrongQuestionNumbers : String(input.wrongQuestionNumbers || "").split(/[，,、\s]+/))
    .filter((item) => item !== "").map(Number))];
  if (wrongQuestionNumbers.some((item) => !Number.isInteger(item) || item <= 0)) throw new Error("wrongQuestionNumbers 必须是去重后的正整数。");
  const errorTypes = [...new Set((Array.isArray(input.errorTypes) ? input.errorTypes : []).map((item) => p1String(item, 60)).filter(Boolean))];
  if (errorTypes.some((item) => !ENGLISH_READING_ERROR_TYPES.includes(item))) throw new Error("英语阅读错误类型包含未知代码。");
  const reviewStatus = ["not-reviewed", "partial", "complete"].includes(input.reviewStatus) ? input.reviewStatus : "not-reviewed";
  const record = {
    recordId: p1String(existing.recordId || input.recordId, 180) || p1StableId("english-reading", date, taskId, "reading"),
    date,
    taskId,
    subtaskId: "reading",
    year: p1String(input.year, 20), paper: p1String(input.paper, 40), textNumber: p1String(input.textNumber, 40),
    firstAttemptMinutes: p1NullableInteger(input.firstAttemptMinutes, "firstAttemptMinutes", 1440),
    correctCount, totalQuestions, wrongQuestionNumbers, errorTypes,
    paragraphSummaryCompleted: input.paragraphSummaryCompleted === true,
    logicMarkersReviewed: input.logicMarkersReviewed === true,
    evidenceLocated: input.evidenceLocated === true,
    optionAnalysisCompleted: input.optionAnalysisCompleted === true,
    longSentences: p1StringList(input.longSentences),
    highValueWords: p1StringList(input.highValueWords),
    mainErrorSentence: p1String(input.mainErrorSentence),
    reviewNotes: p1String(input.reviewNotes == null ? existing.reviewNotes : input.reviewNotes, 12000),
    reviewStatus,
    status: "not-started",
    nextStart: p1String(input.nextStart),
    createdAt: p1String(existing.createdAt || input.createdAt || now, 40), updatedAt: now,
  };
  const completed = totalQuestions !== null && totalQuestions > 0 && reviewStatus === "complete"
    && record.evidenceLocated && record.optionAnalysisCompleted && record.paragraphSummaryCompleted;
  record.status = completed ? "completed" : p1HasContent(record) ? "partial" : "not-started";
  return record;
}

function normalizePoliticsWeakPoints(value) {
  return (Array.isArray(value) ? value : []).map((item) => {
    if (typeof item === "string") return { knowledgePointId: "", knowledgePoint: p1String(item), reasonCode: "", candidateRequested: false };
    if (item && item.reasonCode && !POLITICS_ERROR_CODES.includes(item.reasonCode)) throw new Error("政治薄弱点包含未知错因代码。");
    const reasonCode = POLITICS_ERROR_CODES.includes(item && item.reasonCode) ? item.reasonCode : "";
    return {
      knowledgePointId: p1String(item && item.knowledgePointId, 120),
      knowledgePoint: p1String(item && item.knowledgePoint, 240),
      reasonCode,
      candidateRequested: item && item.candidateRequested === true,
    };
  }).filter((item) => item.knowledgePoint || item.knowledgePointId).slice(0, 100);
}

function normalizePoliticsRecord(input, options = {}) {
  if (!p1IsObject(input)) throw new Error("政治结果必须是对象。");
  const date = p1Date(input.date);
  const taskId = p1String(input.taskId, 120);
  if (!taskId) throw new Error("政治结果必须关联明确 taskId。");
  const now = p1String(options.now || input.updatedAt || new Date().toISOString(), 40);
  const existing = p1IsObject(options.existing) ? options.existing : {};
  const singleChoiceTotal = p1NullableInteger(input.singleChoiceTotal, "singleChoiceTotal", 10000);
  const singleChoiceCorrect = p1NullableInteger(input.singleChoiceCorrect, "singleChoiceCorrect", 10000);
  const multipleChoiceTotal = p1NullableInteger(input.multipleChoiceTotal, "multipleChoiceTotal", 10000);
  const multipleChoiceCorrect = p1NullableInteger(input.multipleChoiceCorrect, "multipleChoiceCorrect", 10000);
  const guessedTotal = p1NullableInteger(input.guessedTotal, "guessedTotal", 10000);
  const guessedCorrect = p1NullableInteger(input.guessedCorrect, "guessedCorrect", 10000);
  if (singleChoiceCorrect !== null && singleChoiceTotal !== null && singleChoiceCorrect > singleChoiceTotal) throw new Error("单选正确数不得大于单选题量。");
  if (multipleChoiceCorrect !== null && multipleChoiceTotal !== null && multipleChoiceCorrect > multipleChoiceTotal) throw new Error("多选正确数不得大于多选题量。");
  if (guessedCorrect !== null && guessedTotal !== null && guessedCorrect > guessedTotal) throw new Error("guessedCorrect 不得大于 guessedTotal。");
  const totalQuestions = (singleChoiceTotal || 0) + (multipleChoiceTotal || 0);
  const totalCorrect = (singleChoiceCorrect || 0) + (multipleChoiceCorrect || 0);
  if (guessedTotal !== null && guessedTotal > totalQuestions) throw new Error("guessedTotal 不得大于单选和多选总题量。");
  if (guessedCorrect !== null && guessedCorrect > totalCorrect) throw new Error("guessedCorrect 不得大于单选和多选总正确数。");
  const errorCodes = Object.fromEntries(POLITICS_ERROR_CODES.map((code) => [code, p1NullableInteger(input.errorCodes && input.errorCodes[code], `errorCodes.${code}`, 10000) || 0]));
  const explicitStatus = P1_RESULT_STATUSES.includes(input.status) ? input.status : "not-started";
  const record = {
    recordId: p1String(existing.recordId || input.recordId, 180) || p1StableId("politics", date, taskId),
    date, taskId, chapter: p1String(input.chapter, 160), content: p1String(input.content),
    courseMinutes: p1NullableInteger(input.courseMinutes, "courseMinutes", 1440),
    questionMinutes: p1NullableInteger(input.questionMinutes, "questionMinutes", 1440),
    singleChoiceTotal, singleChoiceCorrect, multipleChoiceTotal, multipleChoiceCorrect, guessedTotal, guessedCorrect,
    errorCodes, weakPoints: normalizePoliticsWeakPoints(input.weakPoints),
    reviewCandidates: Array.isArray(input.reviewCandidates) ? input.reviewCandidates : [],
    status: "not-started", nextStart: p1String(input.nextStart),
    createdAt: p1String(existing.createdAt || input.createdAt || now, 40), updatedAt: now,
  };
  const hasContent = p1HasContent(record, ["reviewCandidates"]);
  record.status = hasContent ? (explicitStatus === "completed" ? "completed" : "partial") : "not-started";
  return record;
}

function deriveEnglishTaskStatus(wordRecord, readingRecord, options = {}) {
  const hasWord = p1IsObject(wordRecord) && P1_RESULT_STATUSES.includes(wordRecord.status);
  const hasReading = p1IsObject(readingRecord) && P1_RESULT_STATUSES.includes(readingRecord.status);
  if (!hasWord && !hasReading) return options.legacyCompleted === true ? "legacy-unstructured" : "not-started";
  const wordStatus = hasWord ? wordRecord.status : "not-started";
  const readingStatus = hasReading ? readingRecord.status : "not-started";
  if (wordStatus === "completed" && readingStatus === "completed") return "completed";
  if (wordStatus === "not-started" && readingStatus === "not-started") return "not-started";
  if ((wordStatus === "partial" && readingStatus === "not-started") || (readingStatus === "partial" && wordStatus === "not-started")) return "in-progress";
  return "partial";
}

function p1Accuracy(correct, total) {
  return Number.isInteger(correct) && Number.isInteger(total) && total > 0 ? correct / total : null;
}

function calculateReadingAccuracy(record) {
  return p1Accuracy(record && record.correctCount, record && record.totalQuestions);
}

function calculatePoliticsAccuracy(record) {
  const single = p1Accuracy(record && record.singleChoiceCorrect, record && record.singleChoiceTotal);
  const multiple = p1Accuracy(record && record.multipleChoiceCorrect, record && record.multipleChoiceTotal);
  const totalQuestions = (record && record.singleChoiceTotal || 0) + (record && record.multipleChoiceTotal || 0);
  const totalCorrect = (record && record.singleChoiceCorrect || 0) + (record && record.multipleChoiceCorrect || 0);
  const total = totalQuestions > 0 ? totalCorrect / totalQuestions : null;
  const guessed = p1Accuracy(record && record.guessedCorrect, record && record.guessedTotal);
  const errorCodes = p1IsObject(record && record.errorCodes) ? record.errorCodes : {};
  const dominantErrorCode = POLITICS_ERROR_CODES.reduce((best, code) => Number(errorCodes[code]) > Number(errorCodes[best] || 0) ? code : best, "");
  return { singleChoiceAccuracy: single, multipleChoiceAccuracy: multiple, totalAccuracy: total, guessedAccuracy: guessed, dominantErrorCode: Number(errorCodes[dominantErrorCode]) > 0 ? dominantErrorCode : "" };
}

function generatePoliticsReviewCandidates(record, previousRecords = [], options = {}) {
  if (!p1IsObject(record)) return [];
  const now = p1String(options.now || record.updatedAt || new Date().toISOString(), 40);
  const existing = new Map((Array.isArray(record.reviewCandidates) ? record.reviewCandidates : []).filter(p1IsObject)
    .map((candidate) => [`${candidate.recordId}|${candidate.knowledgePointId}|${candidate.reasonCode}`, candidate]));
  const prior = Array.isArray(previousRecords) ? previousRecords : [];
  return normalizePoliticsWeakPoints(record.weakPoints).flatMap((point) => {
    if (!point.knowledgePointId || !POLITICS_ERROR_CODES.includes(point.reasonCode)) return [];
    let suggestedReview = "none";
    if (["K", "M"].includes(point.reasonCode)) {
      const repeated = prior.some((item) => item && item.recordId !== record.recordId
        && normalizePoliticsWeakPoints(item.weakPoints).some((priorPoint) => priorPoint.knowledgePointId === point.knowledgePointId && ["K", "M"].includes(priorPoint.reasonCode)));
      suggestedReview = repeated ? "D3" : "D1";
    } else if (["L", "W"].includes(point.reasonCode)) suggestedReview = "option-trap";
    else if (point.reasonCode === "C" && point.candidateRequested) suggestedReview = "D1";
    if (suggestedReview === "none") return [];
    const key = `${record.recordId}|${point.knowledgePointId}|${point.reasonCode}`;
    const previous = existing.get(key);
    return [{
      candidateId: previous && previous.candidateId || p1StableId("politics-candidate", record.date, record.recordId, `${point.knowledgePointId}-${point.reasonCode}`),
      recordId: record.recordId, date: record.date, knowledgePointId: point.knowledgePointId,
      knowledgePoint: point.knowledgePoint, reasonCode: point.reasonCode, suggestedReview,
      status: previous && ["candidate", "dismissed", "converted"].includes(previous.status) ? previous.status : "candidate",
      createdAt: previous && previous.createdAt || now,
    }];
  });
}
