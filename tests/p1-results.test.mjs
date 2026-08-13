import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ console, Date });
const uiSource = fs.readFileSync(new URL("../js/p1-results.js", import.meta.url), "utf8");
vm.runInContext(`${fs.readFileSync(new URL("../js/p1-results-core.js", import.meta.url), "utf8")}
globalThis.api={ENGLISH_READING_QUICK_TEMPLATE,POLITICS_QUICK_TEMPLATE,normalizeEnglishWordRecord,parseEnglishWordQuickRecord,normalizeEnglishReadingRecord,parseEnglishReadingQuickRecord,parseEnglishReadingReviewQuickRecord,normalizePoliticsRecord,parsePoliticsQuickRecord,deriveEnglishTaskStatus,calculateReadingAccuracy,calculatePoliticsAccuracy,generatePoliticsReviewCandidates};`, context);
const api = context.api;
const date = "2026-07-19";
const now = "2026-07-19T12:00:00.000Z";

test("word result distinguishes null from zero and completes only after review", () => {
  const empty = api.normalizeEnglishWordRecord({ date, taskId: "plan-english" }, { now });
  assert.equal(empty.actualMinutes, null);
  assert.equal(empty.status, "not-started");
  const partial = api.normalizeEnglishWordRecord({ date, taskId: "plan-english", actualMinutes: 0, errorWords: ["abandon"] }, { now });
  assert.equal(partial.actualMinutes, 0);
  assert.equal(partial.status, "partial");
  const completed = api.normalizeEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true }, { now });
  assert.equal(completed.status, "completed");
  assert.equal(completed.recordId, api.normalizeEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true }, { now }).recordId);
  const legacy = api.normalizeEnglishWordRecord({ date, taskId: "plan-english", plannedMinutes: 30, newCards: 12, reviewedCards: 80 }, { now });
  assert.equal(legacy.plannedMinutes, 30); assert.equal(legacy.newCards, 12); assert.equal(legacy.reviewedCards, 80);
});

test("word quick record requires real time and retains vocabulary output", () => {
  const record = api.parseEnglishWordQuickRecord("实际分钟=28分钟｜滚动复习=是\n错词=issue；address｜熟词僻义=subject｜重要搭配=be subject to\n主要问题=熟词僻义反应慢｜下一步=明早重测错词", { date, taskId: "plan-english" });
  assert.equal(record.status, "completed"); assert.equal(record.actualMinutes, 28); assert.equal(record.plannedMinutes, null); assert.equal(record.reviewedCards, null);
  assert.deepEqual(Array.from(record.errorWords), ["issue", "address"]); assert.deepEqual(Array.from(record.collocations), ["be subject to"]);
});

test("word quick record rejects planned-only and time-only records", () => {
  assert.throws(() => api.parseEnglishWordQuickRecord("实际分钟=｜滚动复习=是\n错词=issue", { date, taskId: "plan-english" }), /实际分钟/);
  assert.throws(() => api.parseEnglishWordQuickRecord("实际分钟=28｜滚动复习=是", { date, taskId: "plan-english" }), /至少填写/);
  assert.throws(() => api.parseEnglishWordQuickRecord("实际分钟=28｜滚动复习=是\n新卡=12｜复习卡=80", { date, taskId: "plan-english" }), /至少填写词汇产出/);
});

test("reading requires all formal completion evidence and keeps accuracy derived", () => {
  const partial = api.normalizeEnglishReadingRecord({ date, taskId: "plan-english", totalQuestions: 5, correctCount: 4, reviewStatus: "complete", evidenceLocated: false, optionAnalysisCompleted: true, paragraphSummaryCompleted: true }, { now });
  assert.equal(partial.status, "partial");
  assert.equal(api.calculateReadingAccuracy(partial), 0.8);
  const complete = api.normalizeEnglishReadingRecord({ ...partial, evidenceLocated: true }, { now });
  assert.equal(complete.status, "completed");
  assert.equal(api.calculateReadingAccuracy({ correctCount: null, totalQuestions: null }), null);
  assert.throws(() => api.normalizeEnglishReadingRecord({ date, taskId: "plan-english", totalQuestions: 4, correctCount: 5 }, { now }), /correctCount/);
  assert.throws(() => api.normalizeEnglishReadingRecord({ date, taskId: "plan-english", wrongQuestionNumbers: [2, -1] }, { now }), /正整数/);
});

test("reading default template keeps only completion evidence", () => {
  assert.match(api.ENGLISH_READING_QUICK_TEMPLATE, /年份=｜篇目=｜用时=/);
  assert.match(api.ENGLISH_READING_QUICK_TEMPLATE, /正确=｜总题数=｜错题号=/);
  assert.match(api.ENGLISH_READING_QUICK_TEMPLATE, /复盘=｜段落概括=｜原文依据=｜选项分析=/);
  assert.match(api.ENGLISH_READING_QUICK_TEMPLATE, /错误类型=｜下一步=/);
  assert.doesNotMatch(api.ENGLISH_READING_QUICK_TEMPLATE, /试卷=|逻辑标志=|长难句=|高价值词=|主要错句=/);
});

test("reading quick record preserves accuracy evidence and full-review facts", () => {
  const record = api.parseEnglishReadingQuickRecord("年份=2010｜试卷=英语一｜篇目=Text 1\n用时=18｜正确=4｜总题数=5\n错题号=3｜错误类型=定位错误；词义判断错误\n复盘=完整｜段落概括=是｜逻辑标志=是｜原文依据=是｜选项分析=是\n长难句=第一句；第二句｜高价值词=issue；address\n主要错句=第三题定位偏移｜下一步=明早重做第三题", { date, taskId: "plan-english" });
  assert.equal(record.status, "completed"); assert.equal(api.calculateReadingAccuracy(record), 0.8);
  assert.deepEqual(Array.from(record.errorTypes), ["location-error", "vocabulary-error"]);
  assert.deepEqual(Array.from(record.longSentences), ["第一句", "第二句"]); assert.equal(record.nextStart, "明早重做第三题");
});

test("reading quick record accepts natural unfinished, minute unit, and evidence-risk wording", () => {
  const record = api.parseEnglishReadingQuickRecord("年份=2009｜篇目=Text 1｜用时=17分钟\n正确=5｜总题数=5｜错题号=无\n复盘=未完成｜段落概括=未完成｜原文依据=未核验｜选项分析=未分析\n错误类型=暂无；Q23、Q25低置信，存在依据不稳风险\n下一步=核对原文依据与干扰项逻辑", { date, taskId: "plan-english" });
  assert.equal(record.firstAttemptMinutes, 17);
  assert.equal(record.reviewStatus, "not-reviewed");
  assert.equal(record.paragraphSummaryCompleted, false);
  assert.equal(record.evidenceLocated, false);
  assert.equal(record.optionAnalysisCompleted, false);
  assert.deepEqual(Array.from(record.wrongQuestionNumbers), []);
  assert.deepEqual(Array.from(record.errorTypes), ["other"]);
  assert.equal(record.mainErrorSentence, "Q23、Q25低置信，存在依据不稳风险");
  assert.equal(record.nextStart, "核对原文依据与干扰项逻辑");
});

test("reading quick record accepts descriptive completion text from the UI", () => {
  const record = api.parseEnglishReadingQuickRecord("年份=2009｜篇目=Text 4｜用时=20分钟\n正确=2｜总题数=5｜错题号=37、39、40\n复盘=已完成｜段落概括=主线已理清，尚未逐段独立复述｜原文依据=已核验｜选项分析=已完成\n错误类型=词义错误（固定搭配）、例证作用判断错误、主体偷换、局部信息代替全文结论｜下一步=D1遮住答案重构全文，重点执行“陌生搭配先看主干—例证回到观点句—全文题汇总各段对象”", { date, taskId: "plan-english" });
  assert.equal(record.firstAttemptMinutes, 20);
  assert.equal(record.paragraphSummaryCompleted, false);
  assert.equal(record.evidenceLocated, true);
  assert.equal(record.optionAnalysisCompleted, true);
  assert.deepEqual(Array.from(record.wrongQuestionNumbers), [37, 39, 40]);
  assert.equal(record.nextStart, "D1遮住答案重构全文，重点执行“陌生搭配先看主干—例证回到观点句—全文题汇总各段对象”");
});

test("reading quick record preserves Markdown review prose after structured fields", () => {
  const record = api.parseEnglishReadingQuickRecord([
    "年份=2009｜篇目=Text 4｜用时=20分钟",
    "正确=3｜总题数=5｜错题号=27、29",
    "复盘=已完成｜段落概括=已完成｜原文依据=已核验｜选项分析=已完成",
    "错误类型=词义错误（固定搭配）、主体偷换｜下一步=D1遮住答案重构全文",
    "文章主题：专利制度变化及其影响。",
    "27题：**a very big deal** 后文解释其重要性；esteem=尊重、敬重。",
    "错误类型=词义错误为主（big deal、esteem）。",
  ].join("\n"), { date, taskId: "plan-english" });
  assert.equal(record.status, "completed");
  assert.match(record.reviewNotes, /文章主题：专利制度变化/);
  assert.match(record.reviewNotes, /27题：\*\*a very big deal\*\*/);
  assert.match(record.reviewNotes, /esteem=尊重、敬重/);
});

test("reading quick record treats descriptive review text as partial prose", () => {
  const record = api.parseEnglishReadingQuickRecord([
    "年份=2010｜篇目=Text 2｜用时=18分40秒",
    "正确=3/5｜总题数=5｜错题号=27、29",
    "复盘=文章主线基本理解，核心是商业方法专利保护范围由宽到严；主要失分来自词义和选项表达。",
    "段落概括=商业方法逐渐可以申请专利，法院随后重新审视并收紧标准。",
  ].join("\n"), { date, taskId: "plan-english" });
  assert.equal(record.reviewStatus, "partial");
  assert.equal(record.status, "partial");
  assert.equal(record.firstAttemptMinutes, 19);
  assert.equal(record.correctCount, 3);
  assert.equal(record.totalQuestions, 5);
  assert.match(record.reviewNotes, /^复盘=文章主线基本理解/);
  assert.equal(record.paragraphSummaryCompleted, false);
  assert.throws(() => api.parseEnglishReadingQuickRecord("年份=2010｜篇目=Text 2｜正确=3/5｜总题数=4", { date, taskId: "plan-english" }), /总题数.*不一致/);
});

test("normalizing a structured reading update preserves existing review prose", () => {
  const existing = api.normalizeEnglishReadingRecord({
    date, taskId: "plan-english", year: "2009", textNumber: "Text 4", correctCount: 3, totalQuestions: 5,
    reviewNotes: "文章主题：专利制度变化。",
  }, { now });
  const updated = api.normalizeEnglishReadingRecord({ ...existing, reviewNotes: undefined, correctCount: 4 }, { existing, now: "2026-07-19T13:00:00.000Z" });
  assert.equal(updated.reviewNotes, existing.reviewNotes);
  assert.equal(updated.correctCount, 4);
});

test("reading result UI exposes a saved review prose panel", () => {
  assert.match(uiSource, /id="englishReadingSavedNotesPanel"/);
  assert.match(uiSource, /fields\.querySelector\("#englishReadingSavedNotes"\)\.value = record\.reviewNotes/);
  assert.match(uiSource, /复盘正文：已保存/);
});

test("reading quick record rejects time-only but preserves arbitrary error labels", () => {
  assert.throws(() => api.parseEnglishReadingQuickRecord("年份=2010｜篇目=Text 1｜用时=18", { date, taskId: "plan-english" }), /正确数和总题数/);
  const arbitrary = api.parseEnglishReadingQuickRecord("年份=2010｜篇目=Text 1｜正确=4｜总题数=5｜错误类型=凭感觉", { date, taskId: "plan-english" });
  assert.deepEqual(Array.from(arbitrary.errorTypes), ["other"]);
  assert.equal(arbitrary.mainErrorSentence, "凭感觉");
  const screenshotRecord = api.parseEnglishReadingQuickRecord("年份=2009｜篇目=Text 3｜用时=18分钟\n正确=3｜总题数=5｜错题号=31、34\n复盘=已完成｜段落概括=已完成｜原文依据=已核验｜选项分析=已完成\n错误类型=逻辑错误、作者意图判断错误、例证作用判断错误｜下一步=D1遮住答案重构", { date, taskId: "plan-english" });
  assert.deepEqual(Array.from(screenshotRecord.errorTypes), ["other"]);
  assert.equal(screenshotRecord.mainErrorSentence, "逻辑错误、作者意图判断错误、例证作用判断错误");
});

test("reading review quick record accepts the Markdown D-stage completion note", () => {
  const record = api.parseEnglishReadingReviewQuickRecord([
    "# 2008年英语一 Text 3",
    "**2008 Text 3 D1遮挡重构完成。**",
    "下一准确起点：",
    "> 继续下一篇英语一真题首次限时阅读。",
    "建议保持：",
    "- 18—20分钟；",
  ].join("\n"), { date, taskId: "plan-english" });
  assert.equal(record.year, "2008");
  assert.equal(record.textNumber, "Text 3");
  assert.equal(record.reviewLevel, "D1");
  assert.equal(record.knowledgeUnitId, "english-reading-2008-text-3");
  assert.equal(record.nextStart, "继续下一篇英语一真题首次限时阅读。");
  assert.throws(() => api.parseEnglishReadingReviewQuickRecord("# 2008年英语一 Text 3\n继续阅读", { date, taskId: "plan-english" }), /不是可识别/);
});

test("English parent partial is derived without adding partial to task status", () => {
  const word = api.normalizeEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true }, { now });
  const reading = api.normalizeEnglishReadingRecord({ date, taskId: "plan-english", totalQuestions: 5, correctCount: 5 }, { now });
  assert.equal(api.deriveEnglishTaskStatus(word, null), "partial");
  assert.equal(api.deriveEnglishTaskStatus(null, reading), "in-progress");
  assert.equal(api.deriveEnglishTaskStatus(word, reading), "partial");
  const completeReading = api.normalizeEnglishReadingRecord({ ...reading, reviewStatus: "complete", evidenceLocated: true, optionAnalysisCompleted: true, paragraphSummaryCompleted: true }, { now });
  assert.equal(api.deriveEnglishTaskStatus(word, completeReading), "completed");
  assert.equal(api.deriveEnglishTaskStatus(null, null, { legacyCompleted: true }), "legacy-unstructured");
});

test("politics validates totals and calculates four nullable accuracy values", () => {
  const record = api.normalizePoliticsRecord({ date, taskId: "plan-politics", singleChoiceTotal: 10, singleChoiceCorrect: 8, multipleChoiceTotal: 5, multipleChoiceCorrect: 3, guessedTotal: 4, guessedCorrect: 2, errorCodes: { K: 2, M: 1 }, status: "completed" }, { now });
  const accuracy = api.calculatePoliticsAccuracy(record);
  assert.equal(accuracy.singleChoiceAccuracy, 0.8);
  assert.equal(accuracy.multipleChoiceAccuracy, 0.6);
  assert.equal(accuracy.totalAccuracy, 11 / 15);
  assert.equal(accuracy.guessedAccuracy, 0.5);
  assert.equal(accuracy.dominantErrorCode, "K");
  assert.equal(api.calculatePoliticsAccuracy({ guessedTotal: null, guessedCorrect: null }).guessedAccuracy, null);
  assert.equal(api.calculatePoliticsAccuracy({ guessedTotal: 0, guessedCorrect: 0 }).guessedAccuracy, null);
  assert.throws(() => api.normalizePoliticsRecord({ date, taskId: "plan-politics", guessedTotal: 2, guessedCorrect: 3 }, { now }), /guessedCorrect/);
  assert.throws(() => api.normalizePoliticsRecord({ date, taskId: "plan-politics", singleChoiceTotal: 2, guessedTotal: 3 }, { now }), /总题量/);
  assert.throws(() => api.normalizePoliticsRecord({ date, taskId: "plan-politics", singleChoiceTotal: 2, singleChoiceCorrect: 1, guessedTotal: 1, guessedCorrect: 2 }, { now }), /guessedCorrect/);
});

test("politics quick record preserves time, accuracy, error codes, and weak points", () => {
  const record = api.parsePoliticsQuickRecord("章节=第一章｜内容=马克思主义基本立场\n课程分钟=35分钟｜刷题分钟=25分\n单选正确=8｜单选总数=10｜多选正确=3｜多选总数=5\n蒙对=1｜蒙题总数=2\n错因K=1｜错因M=0｜错因L=1｜错因W=0｜错因C=0｜错因G=0\n薄弱点=pol-1/物质与意识/K；pol-2/选项范围/L\n完成状态=完成｜下一步=重做两道错题", { date, taskId: "plan-politics" });
  const accuracy = api.calculatePoliticsAccuracy(record);
  assert.equal(record.status, "completed"); assert.equal(record.courseMinutes, 35); assert.equal(accuracy.totalAccuracy, 11 / 15);
  assert.deepEqual(Array.from(record.weakPoints, (item) => [item.knowledgePointId, item.reasonCode]), [["pol-1", "K"], ["pol-2", "L"]]);
});

test("politics default template keeps only daily execution fields", () => {
  assert.match(api.POLITICS_QUICK_TEMPLATE, /章节=｜内容=/);
  assert.match(api.POLITICS_QUICK_TEMPLATE, /单选正确=｜单选总数=｜多选正确=｜多选总数=/);
  assert.match(api.POLITICS_QUICK_TEMPLATE, /下一步=/);
  assert.doesNotMatch(api.POLITICS_QUICK_TEMPLATE, /完成状态|蒙对|蒙题总数|错因[型KMLWCG]|薄弱点/);
});

test("politics quick record rejects time-only, incomplete totals, and malformed weak points", () => {
  assert.throws(() => api.parsePoliticsQuickRecord("章节=第一章｜内容=基本立场\n课程分钟=｜刷题分钟=", { date, taskId: "plan-politics" }), /至少一项/);
  assert.throws(() => api.parsePoliticsQuickRecord("章节=第一章｜内容=基本立场\n课程分钟=30｜单选总数=10", { date, taskId: "plan-politics" }), /同时填写/);
  assert.throws(() => api.parsePoliticsQuickRecord("章节=第一章｜内容=基本立场\n课程分钟=30｜薄弱点=物质与意识/K", { date, taskId: "plan-politics" }), /薄弱点格式/);
});

test("politics candidates are stable, deduplicated, and never invent fuzzy repeated points", () => {
  const first = api.normalizePoliticsRecord({ date: "2026-07-18", taskId: "plan-politics", weakPoints: [{ knowledgePointId: "kp-1", knowledgePoint: "矛盾普遍性", reasonCode: "K" }] }, { now });
  first.reviewCandidates = api.generatePoliticsReviewCandidates(first, [], { now });
  assert.equal(first.reviewCandidates[0].suggestedReview, "D1");
  const second = api.normalizePoliticsRecord({ date, taskId: "plan-politics", weakPoints: [{ knowledgePointId: "kp-1", knowledgePoint: "矛盾普遍性", reasonCode: "M" }, { knowledgePointId: "kp-2", knowledgePoint: "范围", reasonCode: "W" }, { knowledgePointId: "", knowledgePoint: "相似文字", reasonCode: "K" }] }, { now });
  const candidates = api.generatePoliticsReviewCandidates(second, [first], { now });
  assert.equal(candidates.find((item) => item.knowledgePointId === "kp-1").suggestedReview, "D3");
  assert.equal(candidates.find((item) => item.knowledgePointId === "kp-2").suggestedReview, "option-trap");
  assert.equal(candidates.length, 2);
  assert.deepEqual(api.generatePoliticsReviewCandidates({ ...second, reviewCandidates: candidates }, [first], { now }), candidates);
});

test("politics phase-A contract uses weighted totals and explicit K M L W candidates only", () => {
  const record = api.normalizePoliticsRecord({ date, taskId: "plan-politics", singleChoiceTotal: 10, singleChoiceCorrect: 8, multipleChoiceTotal: 10, multipleChoiceCorrect: 6, guessedTotal: 3, guessedCorrect: 2, errorCodes: { K: 1, M: 1, L: 1, W: 1, C: 1, G: 1 }, weakPoints: [
    { knowledgePointId: "k", knowledgePoint: "K点", reasonCode: "K" }, { knowledgePointId: "m", knowledgePoint: "M点", reasonCode: "M" },
    { knowledgePointId: "l", knowledgePoint: "L点", reasonCode: "L" }, { knowledgePointId: "w", knowledgePoint: "W点", reasonCode: "W" },
    { knowledgePointId: "c", knowledgePoint: "C点", reasonCode: "C" }, { knowledgePointId: "g", knowledgePoint: "G点", reasonCode: "G" },
  ] }, { now });
  const accuracy = api.calculatePoliticsAccuracy(record);
  assert.equal(accuracy.singleChoiceAccuracy, 0.8); assert.equal(accuracy.multipleChoiceAccuracy, 0.6); assert.equal(accuracy.totalAccuracy, 0.7); assert.equal(accuracy.guessedAccuracy, 2 / 3);
  const candidates = api.generatePoliticsReviewCandidates(record, [], { now });
  assert.deepEqual(candidates.map((item) => [item.reasonCode, item.suggestedReview]), [["K", "D1"], ["M", "D1"], ["L", "option-trap"], ["W", "option-trap"]]);
});

test("old completed or focus-like fields never produce detailed results", () => {
  assert.equal(api.deriveEnglishTaskStatus(null, null, { legacyCompleted: true }), "legacy-unstructured");
  assert.equal(api.deriveEnglishTaskStatus(null, null, { focusSeconds: 3600 }), "not-started");
});

function createStorageContext(failWrites = false) {
  const values = new Map(Object.entries({
    studyEnglishWordRecords: "[]", studyEnglishReadingRecords: "[]", studyPoliticsRecords: "[]",
    studyFocusSeconds: JSON.stringify({ [date]: 3600 }), reviewQueue: JSON.stringify([{ id: "keep-review" }]),
    studyProfessionalResults: JSON.stringify({ schemaVersion: 1, days: {} }),
    studyDailyPlans: JSON.stringify({ [date]: { tasks: [{ id: "plan-english", taskId: "plan-english", category: "english", status: "not-started" }, { id: "plan-politics", taskId: "plan-politics", category: "politics", status: "not-started" }] } }),
  }));
  const storageContext = vm.createContext({
    console, Date,
    englishWordRecordsKey: "studyEnglishWordRecords", englishReadingRecordsKey: "studyEnglishReadingRecords", politicsRecordsKey: "studyPoliticsRecords",
    dailyPlansKey: "studyDailyPlans", reviewQueueKey: "reviewQueue",
    localStorage: { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), key: (index) => [...values.keys()][index] || null, get length() { return values.size; } },
    readJson: (key, fallback) => values.has(key) ? JSON.parse(values.get(key)) : fallback,
    readRawStorageSnapshot: () => Object.fromEntries(values),
    applyStorageSnapshotTransaction: (target) => { if (failWrites) throw new Error("simulated-write-failure"); Object.entries(target).forEach(([key, value]) => values.set(key, value)); },
    setTaskStatus: (task, status) => { task.status = status; task.completed = status === "completed"; },
    getTaskStatus: (task) => task.status || (task.completed ? "completed" : "not-started"),
    getDateKey: () => date,
  });
  vm.runInContext(`${fs.readFileSync(new URL("../js/p1-results-core.js", import.meta.url), "utf8")}\n${fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8")}\n${fs.readFileSync(new URL("../js/p1-results.js", import.meta.url), "utf8")}\nglobalThis.api={saveEnglishWordRecord,saveEnglishReadingRecord,saveEnglishReadingReviewRecord,getTodayEnglishReviewRecords,savePoliticsRecord,convertPoliticsCandidate,validateP1TrackedTaskCompletion};`, storageContext);
  return { api: storageContext.api, values };
}

test("a saved real reading attempt completes the daily English task without falsifying review quality", () => {
  const storage = createStorageContext();
  const record = storage.api.saveEnglishReadingRecord({
    date,
    taskId: "plan-english",
    year: "2009",
    textNumber: "Text 1",
    firstAttemptMinutes: 17,
    correctCount: 5,
    totalQuestions: 5,
    reviewStatus: "not-reviewed",
    paragraphSummaryCompleted: false,
    evidenceLocated: false,
    optionAnalysisCompleted: false,
  });
  const task = JSON.parse(storage.values.get("studyDailyPlans"))[date].tasks.find((item) => item.taskId === "plan-english");
  assert.equal(record.status, "partial");
  assert.equal(record.reviewStatus, "not-reviewed");
  assert.equal(task.status, "completed");
  assert.equal(task.completed, true);
});

test("tracked English and politics tasks require their own formal result before completion", () => {
  const storage = createStorageContext();
  const english = { id: "plan-english", taskId: "plan-english", category: "english", status: "not-started" };
  const politics = { id: "plan-politics", taskId: "plan-politics", category: "politics", status: "not-started" };
  const other = { id: "plan-exercise", category: "exercise", status: "not-started" };
  assert.equal(storage.api.validateP1TrackedTaskCompletion(english, date).valid, false);
  assert.equal(storage.api.validateP1TrackedTaskCompletion(politics, date).valid, false);
  assert.equal(storage.api.validateP1TrackedTaskCompletion(other, date).valid, true);

  storage.api.saveEnglishReadingRecord({ date, taskId: "plan-english", year: "2009", textNumber: "Text 1", firstAttemptMinutes: 17, correctCount: 5, totalQuestions: 5 });
  storage.api.savePoliticsRecord({ date, taskId: "plan-politics", chapter: "第一章", content: "课程与选择题", courseMinutes: 30 });
  assert.equal(storage.api.validateP1TrackedTaskCompletion(english, date).valid, true);
  assert.equal(storage.api.validateP1TrackedTaskCompletion(politics, date).valid, true);
});

test("storage saves update one stable record without touching focus or reviewQueue", () => {
  const storage = createStorageContext();
  const focusBefore = storage.values.get("studyFocusSeconds");
  const reviewsBefore = storage.values.get("reviewQueue");
  const professionalBefore = storage.values.get("studyProfessionalResults");
  const first = storage.api.saveEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true, actualMinutes: 30 });
  const second = storage.api.saveEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true, actualMinutes: 40 });
  const words = JSON.parse(storage.values.get("studyEnglishWordRecords"));
  assert.equal(words.length, 1);
  assert.equal(first.recordId, second.recordId);
  assert.equal(words[0].actualMinutes, 40);
  storage.api.savePoliticsRecord({ date, taskId: "plan-politics", singleChoiceTotal: 5, singleChoiceCorrect: 4, weakPoints: [{ knowledgePointId: "kp", knowledgePoint: "概念", reasonCode: "K" }], status: "partial" });
  assert.equal(JSON.parse(storage.values.get("studyPoliticsRecords"))[0].reviewCandidates.length, 1);
  assert.equal(JSON.parse(storage.values.get("studyDailyPlans"))[date].tasks.find((item) => item.taskId === "plan-politics").status, "in-progress");
  assert.equal(storage.values.get("studyFocusSeconds"), focusBefore);
  assert.equal(storage.values.get("reviewQueue"), reviewsBefore);
  assert.equal(storage.values.get("studyProfessionalResults"), professionalBefore);
});

test("a real politics execution completes the daily task without a manual completion field", () => {
  const storage = createStorageContext();
  const input = api.parsePoliticsQuickRecord("章节=第一章｜内容=强化课与选择题\n课程分钟=35分钟｜刷题分钟=25分钟\n单选正确=8｜单选总数=10｜多选正确=3｜多选总数=5\n下一步=重做错题", { date, taskId: "plan-politics" });
  const record = storage.api.savePoliticsRecord(input);
  const task = JSON.parse(storage.values.get("studyDailyPlans"))[date].tasks.find((item) => item.taskId === "plan-politics");
  assert.equal(record.status, "partial");
  assert.equal(task.status, "completed");
  assert.equal(task.completed, true);
});

test("failed result transaction leaves all storage unchanged", () => {
  const storage = createStorageContext(true);
  const before = JSON.stringify([...storage.values.entries()]);
  assert.throws(() => storage.api.saveEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true }), /simulated-write-failure/);
  assert.equal(JSON.stringify([...storage.values.entries()]), before);
});

test("English D-stage note saves one completed review without creating a reading record", () => {
  const storage = createStorageContext();
  const input = api.parseEnglishReadingReviewQuickRecord("**2008 Text 3 D1遮挡重构完成。**\n下一步：继续下一篇英语一真题首次限时阅读。", { date, taskId: "plan-english" });
  storage.api.saveEnglishReadingReviewRecord(input);
  storage.api.saveEnglishReadingReviewRecord(input);
  const reviews = JSON.parse(storage.values.get("reviewQueue"));
  const active = reviews.filter((item) => item.businessKey === "english:english-reading-2008-text-3:D1" && item.status !== "cancelled");
  assert.equal(active.length, 1);
  assert.equal(active[0].status, "completed");
  assert.equal(active[0].previousResult, "未验收");
  assert.equal(active[0].nextStart, "继续下一篇英语一真题首次限时阅读。");
  assert.deepEqual(JSON.parse(storage.values.get("studyEnglishReadingRecords")), []);
  const task = { id: "plan-english", taskId: "plan-english", category: "english" };
  assert.equal(storage.api.getTodayEnglishReviewRecords(task, date).length, 1);
});

test("politics candidate conversion is explicit, unique, and stores formal reviewId", () => {
  const storage = createStorageContext();
  const politics = storage.api.savePoliticsRecord({ date, taskId: "plan-politics", singleChoiceTotal: 5, singleChoiceCorrect: 4, weakPoints: [{ knowledgePointId: "kp", knowledgePoint: "概念", reasonCode: "K" }], status: "partial" });
  const candidate = politics.reviewCandidates[0];
  storage.api.convertPoliticsCandidate(politics.recordId, candidate.candidateId);
  storage.api.convertPoliticsCandidate(politics.recordId, candidate.candidateId);
  const reviews = JSON.parse(storage.values.get("reviewQueue"));
  const savedCandidate = JSON.parse(storage.values.get("studyPoliticsRecords"))[0].reviewCandidates[0];
  assert.equal(reviews.filter((item) => item.reviewType === "politics-knowledge" && item.status !== "cancelled").length, 1);
  assert.equal(savedCandidate.status, "converted"); assert.ok(savedCandidate.reviewId);
});
