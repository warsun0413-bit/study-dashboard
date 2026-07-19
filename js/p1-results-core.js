// P1 Checkpoint 1: pure English and politics result normalization and derivation.
const P1_ENGLISH_POLITICS_MIGRATION_ID = "p1-english-politics-results-v1";
const P1_RESULT_STATUSES = Object.freeze(["not-started", "partial", "completed"]);
const P1_ENGLISH_DERIVED_STATUSES = Object.freeze(["not-started", "in-progress", "partial", "completed", "legacy-unstructured"]);
const ENGLISH_READING_ERROR_TYPES = Object.freeze([
  "concept-substitution", "scope-expansion", "polarity-reversal", "causal-reversal",
  "unsupported-addition", "example-as-viewpoint", "over-inference", "location-error",
  "sentence-error", "vocabulary-error", "other",
]);
const POLITICS_ERROR_CODES = Object.freeze(["K", "M", "L", "W", "C", "G"]);

function p1IsObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function p1String(value, maxLength = 500) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function p1NullableInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0 || number > maximum) {
    throw new Error(`${field} 必须是 0—${maximum} 的整数或未记录。`);
  }
  return number;
}

function p1StringList(value, maximumItems = 100, itemLength = 160) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return [...new Set(source.map((item) => p1String(item, itemLength)).filter(Boolean))].slice(0, maximumItems);
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
  const wrongQuestionNumbers = [...new Set((Array.isArray(input.wrongQuestionNumbers) ? input.wrongQuestionNumbers : String(input.wrongQuestionNumbers || "").split(/[，,\s]+/))
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
