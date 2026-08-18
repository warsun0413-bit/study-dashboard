import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const planWindowSource = fs.readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8");
const tomorrowSource = fs.readFileSync(new URL("../js/ai-tomorrow-plan-core.js", import.meta.url), "utf8");
const rollingSource = fs.readFileSync(new URL("../js/ai-rolling-week-plan-core.js", import.meta.url), "utf8");
const p1Source = fs.readFileSync(new URL("../js/p1-integration-core.js", import.meta.url), "utf8");
const weeklySource = fs.readFileSync(new URL("../js/weekly-improvement-core.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(`${planWindowSource}\n${tomorrowSource}\n${rollingSource}\n${p1Source}\n${weeklySource}\nglobalThis.core = {
  buildWeeklyImprovementRange, buildWeeklyImprovementReport, chooseWeeklyImprovementDiagnosis,
  buildWeeklyImprovementFingerprint, createWeeklyImprovementSnapshot, bindWeeklyImprovementSnapshot,
  resolveWeeklyImprovementConstraint, getWeeklyImprovementTargetRange
};`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));

function formalDay(date, options = {}) {
  return {
    recordSchemaVersion: 2,
    manualRecordsSaved: true,
    date,
    totalStudySeconds: options.study ?? 7200,
    completionDone: options.done ?? 4,
    completionTotal: options.total ?? 5,
    executionTargetSeconds: options.target ?? 9000,
  };
}

function baseInput(options = {}) {
  const dates = options.dates || ["2026-08-12", "2026-08-13", "2026-08-14"];
  return {
    history: options.history || dates.map((date) => formalDay(date)),
    dailyPlans: {},
    professionalStore: options.professionalStore || { days: {
      "2026-08-12": { "722": { units: [{ reviewResult: "通过", closedBookResult: "闭卷写出实践结构", name: "实践", nextStart: "下一节" }] } },
    } },
    reviewQueue: options.reviewQueue || [],
    focusTotals: options.focusTotals || {},
    manualRecords: options.manualRecords || [],
    wordRecords: options.wordRecords || [],
    readingRecords: options.readingRecords || [{ date: "2026-08-12", correctCount: 4, totalQuestions: 5 }],
    politicsRecords: options.politicsRecords || [{ date: "2026-08-13", singleChoiceCorrect: 6, singleChoiceTotal: 10 }],
    outputRecords: options.outputRecords || [],
  };
}

test("rolling ranges are exact adjacent seven-day windows across month and year boundaries", () => {
  assert.deepEqual(plain(core.buildWeeklyImprovementRange("2026-01-02")), {
    start: "2025-12-27", end: "2026-01-02",
    dates: ["2025-12-27", "2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"],
  });
  const report = plain(core.buildWeeklyImprovementReport(baseInput(), "2026-08-18"));
  assert.deepEqual(report.range, { start: "2026-08-12", end: "2026-08-18", dates: ["2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18"] });
  assert.equal(report.previousRange.start, "2026-08-05");
  assert.equal(report.previousRange.end, "2026-08-11");
});

test("future duplicate legacy and abnormal records are excluded without mutating input", () => {
  const input = baseInput({ history: [
    formalDay("2026-08-12"), formalDay("2026-08-13"), formalDay("2026-08-13"),
    { date: "2026-08-14", totalStudySeconds: 7200, completionDone: 4, completionTotal: 5 },
    formalDay("2026-08-15", { study: 90000 }), formalDay("2026-08-19"),
  ] });
  const before = JSON.stringify(input);
  const report = plain(core.buildWeeklyImprovementReport(input, "2026-08-18"));
  assert.equal(report.audit.evidenceDays, 1);
  assert.equal(report.audit.excludedDays, 4);
  assert.deepEqual(report.audit.exclusionReasonCounts, { "future-record": 1, "duplicate-date": 1, "unverified-record-schema": 1, "invalid-study-time": 1 });
  assert.equal(JSON.stringify(input), before);
});

test("weighted quality rates always retain their denominators and small samples stay ineligible", () => {
  const report = plain(core.buildWeeklyImprovementReport(baseInput({
    readingRecords: [
      { date: "2026-08-12", correctCount: 3, totalQuestions: 5 },
      { date: "2026-08-13", correctCount: 4, totalQuestions: 7 },
      { date: "2026-08-14", correctCount: null, totalQuestions: null },
    ],
    politicsRecords: [{ date: "2026-08-12", singleChoiceCorrect: 6, singleChoiceTotal: 10 }],
  }), "2026-08-18"));
  assert.equal(report.metrics.current.quality.englishCorrect, 7);
  assert.equal(report.metrics.current.quality.englishQuestions, 12);
  assert.equal(report.metrics.current.quality.englishEligible, true);
  assert.equal(report.metrics.current.quality.englishReadingCount, 2);
  assert.equal(report.metrics.current.quality.englishContinuityDays, 3);
  assert.equal(report.metrics.current.quality.politicsQuestions, 10);
  assert.equal(report.metrics.current.quality.politicsEligible, false);
});

test("quality sample gates count only scored records while continuity reports saved record days", () => {
  const report = plain(core.buildWeeklyImprovementReport(baseInput({
    readingRecords: [
      { date: "2026-08-12", correctCount: 6, totalQuestions: 10 },
      { date: "2026-08-13", correctCount: null, totalQuestions: null },
    ],
    politicsRecords: [
      { date: "2026-08-12", singleChoiceCorrect: 12, singleChoiceTotal: 20 },
      { date: "2026-08-14", singleChoiceCorrect: null, singleChoiceTotal: null },
    ],
  }), "2026-08-18"));
  assert.equal(report.metrics.current.quality.englishReadingCount, 1);
  assert.equal(report.metrics.current.quality.englishRecordDays, 2);
  assert.equal(report.metrics.current.quality.englishContinuityDays, 2);
  assert.equal(report.metrics.current.quality.englishEligible, false);
  assert.equal(report.metrics.current.quality.politicsRecordCount, 1);
  assert.equal(report.metrics.current.quality.politicsRecordDays, 2);
  assert.equal(report.metrics.current.quality.politicsContinuityDays, 1);
  assert.equal(report.metrics.current.quality.politicsEligible, false);
});

test("fewer than three formal days reports evidence accumulation without judging performance", () => {
  const report = plain(core.buildWeeklyImprovementReport(baseInput({ dates: ["2026-08-12", "2026-08-13"] }), "2026-08-18"));
  assert.equal(report.metrics.current.evidence.status, "insufficient-data");
  assert.equal(report.diagnosis.id, "evidence-accumulation");
  assert.match(report.diagnosis.evidence[0], /至少需要3日/);
});

test("diagnosis priority is evidence then review then closed book then capacity", () => {
  const evidence = plain(core.buildWeeklyImprovementReport(baseInput({ readingRecords: [], politicsRecords: [], professionalStore: {}, outputRecords: [] }), "2026-08-18"));
  assert.equal(evidence.diagnosis.id, "formal-evidence");

  const review = plain(core.buildWeeklyImprovementReport(baseInput({ reviewQueue: [
    { reviewId: "d1", reviewLevel: "D1", dueDate: "2026-08-13", status: "pending" },
  ] }), "2026-08-18"));
  assert.equal(review.diagnosis.id, "review-recovery");

  const closedBook = plain(core.buildWeeklyImprovementReport(baseInput({ professionalStore: {}, outputRecords: [] }), "2026-08-18"));
  assert.equal(closedBook.diagnosis.id, "closed-book-output");

  const capacity = plain(core.buildWeeklyImprovementReport(baseInput({
    history: ["2026-08-12", "2026-08-13", "2026-08-14"].map((date) => formalDay(date, { study: 3600, done: 2, total: 5, target: 7200 })),
  }), "2026-08-18"));
  assert.equal(capacity.diagnosis.id, "capacity-mismatch");
});

test("subject weakness requires minimum samples and uses the existing sixty-percent line", () => {
  const english = plain(core.buildWeeklyImprovementReport(baseInput({
    readingRecords: [
      { date: "2026-08-12", correctCount: 2, totalQuestions: 5 },
      { date: "2026-08-13", correctCount: 3, totalQuestions: 6 },
    ],
    politicsRecords: [],
  }), "2026-08-18"));
  assert.equal(english.diagnosis.id, "english-reading");

  const politics = plain(core.buildWeeklyImprovementReport(baseInput({
    readingRecords: [{ date: "2026-08-12", correctCount: 4, totalQuestions: 5 }],
    politicsRecords: [
      { date: "2026-08-12", singleChoiceCorrect: 5, singleChoiceTotal: 10 },
      { date: "2026-08-13", singleChoiceCorrect: 6, singleChoiceTotal: 11 },
    ],
  }), "2026-08-18"));
  assert.equal(politics.diagnosis.id, "politics-accuracy");
});

test("professional imbalance is used only after at least two formal units", () => {
  const report = plain(core.buildWeeklyImprovementReport(baseInput({
    professionalStore: { days: {
      "2026-08-12": { "722": { units: [
        { reviewResult: "通过", closedBookResult: "闭卷一", name: "一", nextStart: "二" },
        { reviewResult: "部分通过", closedBookResult: "闭卷二", name: "二", nextStart: "三" },
      ] } },
    } },
  }), "2026-08-18"));
  assert.equal(report.diagnosis.id, "professional-imbalance");
  assert.match(report.diagnosis.action, /844/);
});

test("fingerprints are stable and change only when frozen evidence changes", () => {
  const input = baseInput();
  const first = plain(core.buildWeeklyImprovementReport(input, "2026-08-18"));
  const second = plain(core.buildWeeklyImprovementReport(JSON.parse(JSON.stringify(input)), "2026-08-18"));
  assert.equal(first.evidenceFingerprint, second.evidenceFingerprint);
  const changed = baseInput();
  changed.history[0].completionDone = 3;
  assert.notEqual(first.evidenceFingerprint, core.buildWeeklyImprovementReport(changed, "2026-08-18").evidenceFingerprint);
});

test("snapshot locks diagnosis evidence and allows only a bounded confirmed action", () => {
  const report = core.buildWeeklyImprovementReport(baseInput(), "2026-08-18");
  const snapshot = plain(core.createWeeklyImprovementSnapshot(report, "未来7天先完成闭卷产物", { startDate: "2026-08-19", endDate: "2026-08-25" }, "2026-08-18T20:00:00.000Z"));
  assert.equal(snapshot.recordId, "weekly-improvement-2026-08-18");
  assert.equal(snapshot.diagnosis.confirmedText, "未来7天先完成闭卷产物");
  assert.equal(snapshot.binding.status, "bound");
  assert.throws(() => core.createWeeklyImprovementSnapshot(report, ""), /具体的主纠偏动作/);
  assert.throws(() => core.createWeeklyImprovementSnapshot(report, "a".repeat(301)), /不能超过300字/);
});

test("previous commitment distinguishes improved not observed and insufficient evidence", () => {
  const previous = {
    schemaVersion: 1, endDate: "2026-08-11", confirmedAt: "2026-08-11T20:00:00.000Z",
    diagnosis: { confirmedText: "补足正式记录", targetMetric: "execution.validFormalDays", targetDirection: "up", targetDelta: 1, baselineMetricValue: 2 },
  };
  const improved = plain(core.buildWeeklyImprovementReport(baseInput(), "2026-08-18", [previous]));
  assert.equal(improved.previousCommitmentEvaluation.status, "improved");

  previous.diagnosis.baselineMetricValue = 3;
  const unchanged = plain(core.buildWeeklyImprovementReport(baseInput(), "2026-08-18", [previous]));
  assert.equal(unchanged.previousCommitmentEvaluation.status, "not-observed");

  const insufficient = plain(core.buildWeeklyImprovementReport(baseInput({ dates: ["2026-08-12", "2026-08-13"] }), "2026-08-18", [previous]));
  assert.equal(insufficient.previousCommitmentEvaluation.status, "insufficient-data");
});

test("constraints resolve only for an exact bound plan range", () => {
  const report = core.buildWeeklyImprovementReport(baseInput(), "2026-08-18");
  const pending = core.createWeeklyImprovementSnapshot(report, "保持闭卷证据", null, "2026-08-18T20:00:00.000Z");
  assert.equal(core.resolveWeeklyImprovementConstraint([pending], { startDate: "2026-08-19", endDate: "2026-08-25" }), null);
  const bound = core.bindWeeklyImprovementSnapshot(pending, { startDate: "2026-08-19", endDate: "2026-08-25" }, "2026-08-18T20:05:00.000Z");
  const constraint = plain(core.resolveWeeklyImprovementConstraint([bound], { startDate: "2026-08-19", endDate: "2026-08-25" }));
  assert.equal(constraint.primaryAction, "保持闭卷证据");
  assert.equal(constraint.guardrails.length, 2);
  assert.equal(core.resolveWeeklyImprovementConstraint([bound], { startDate: "2026-08-20", endDate: "2026-08-26" }), null);
  assert.equal(core.resolveWeeklyImprovementConstraint([{ ...bound, diagnosis: { ...bound.diagnosis, confirmedText: "" } }], { startDate: "2026-08-19", endDate: "2026-08-25" }), null);
});

test("trusted imported metadata derives the next exact range and rejects guesses", () => {
  assert.deepEqual(plain(core.getWeeklyImprovementTargetRange({
    planType: "nankai-marxism-control-plan", schemaVersion: 3, planId: "nankai-control-2026-08-06",
    detailedPlanEnd: "2026-08-18", importedAt: "2026-08-18T09:00:00.000Z",
  })), { startDate: "2026-08-19", endDate: "2026-08-25" });
  assert.equal(core.getWeeklyImprovementTargetRange({ detailedPlanEnd: "2026-08-18" }), null);
});

test("page cache and backup path expose the folded explicit-confirm workflow", () => {
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../js/weekly-improvement.js", import.meta.url), "utf8");
  const storage = fs.readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");
  const backup = fs.readFileSync(new URL("../js/data-safety.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(index, /<details id="weeklyImprovementPanel"/);
  assert.match(index, /id="confirmWeeklyImprovementBtn"/);
  assert.match(index, /weekly-improvement-core\.js\?v=weekly-improvement-v154/);
  assert.match(ui, /records\.some\(\(record\) => record && record\.endDate === endDate\)/);
  assert.match(storage, /studyWeeklyImprovementRecords/);
  assert.doesNotMatch(storage, /writeJson\(weeklyImprovementRecordsKey/);
  assert.match(backup, /for \(let index = 0; index < localStorage\.length/);
  assert.match(worker, /study-dashboard-magic-link-v158/);
  assert.match(worker, /weekly-improvement\.js\?v=weekly-improvement-v154/);
  const review = fs.readFileSync(new URL("../js/review.js", import.meta.url), "utf8");
  assert.match(review, /renderAiRollingWeekImprovementConstraint\(constraint, imported\.improvementConstraint \|\| null\)/);
});
