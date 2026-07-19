import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ console, Date });
vm.runInContext(`${fs.readFileSync(new URL("../js/p1-results-core.js", import.meta.url), "utf8")}
globalThis.api={normalizeEnglishWordRecord,normalizeEnglishReadingRecord,normalizePoliticsRecord,deriveEnglishTaskStatus,calculateReadingAccuracy,calculatePoliticsAccuracy,generatePoliticsReviewCandidates};`, context);
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
  vm.runInContext(`${fs.readFileSync(new URL("../js/p1-results-core.js", import.meta.url), "utf8")}\n${fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8")}\n${fs.readFileSync(new URL("../js/p1-results.js", import.meta.url), "utf8")}\nglobalThis.api={saveEnglishWordRecord,saveEnglishReadingRecord,savePoliticsRecord,convertPoliticsCandidate};`, storageContext);
  return { api: storageContext.api, values };
}

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
  assert.equal(storage.values.get("studyFocusSeconds"), focusBefore);
  assert.equal(storage.values.get("reviewQueue"), reviewsBefore);
  assert.equal(storage.values.get("studyProfessionalResults"), professionalBefore);
});

test("failed result transaction leaves all storage unchanged", () => {
  const storage = createStorageContext(true);
  const before = JSON.stringify([...storage.values.entries()]);
  assert.throws(() => storage.api.saveEnglishWordRecord({ date, taskId: "plan-english", reviewCompleted: true }), /simulated-write-failure/);
  assert.equal(JSON.stringify([...storage.values.entries()]), before);
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
