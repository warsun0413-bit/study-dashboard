import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ console, Date });
for (const file of ["plan-window-core.js", "p0-results.js", "p0-final-core.js", "p1-execution-debt-core.js", "p1-integration-core.js"]) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8"), context);
}
const api = vm.runInContext("({getP1WeekRange,buildP1WeeklyStats,buildP1TodaySnapshot,buildP1ControlMarkdown})", context);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("week range is local Monday through Sunday across month boundary", () => {
  assert.deepEqual(plain(api.getP1WeekRange("2026-08-01")), { start: "2026-07-27", end: "2026-08-02", dates: ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"] });
});

test("weekly rates are weighted, null data is excluded, and result minutes do not add study time", () => {
  const stats = plain(api.buildP1WeeklyStats({
    focusTotals: { "2026-07-20": 3600 },
    manualRecords: [{ date: "2026-07-20", durationSeconds: 600, taskTitle: "英语阅读" }, { date: "2026-07-20", durationSeconds: 900, taskTitle: "居家训练" }],
    readingRecords: [{ date: "2026-07-20", correctCount: 8, totalQuestions: 10, firstAttemptMinutes: 100 }, { date: "2026-07-21", correctCount: 1, totalQuestions: 2, firstAttemptMinutes: 200 }, { date: "2026-07-22", correctCount: null, totalQuestions: null }],
    politicsRecords: [{ date: "2026-07-20", singleChoiceCorrect: 8, singleChoiceTotal: 10, multipleChoiceCorrect: 2, multipleChoiceTotal: 5, errorCodes: { K: 2 } }, { date: "2026-07-21", singleChoiceCorrect: 1, singleChoiceTotal: 2, multipleChoiceCorrect: null, multipleChoiceTotal: null, errorCodes: { K: 1, M: 3 } }],
  }, "2026-07-22"));
  assert.equal(stats.effectiveStudy.totalSeconds, 4200);
  assert.equal(stats.english.readingAccuracy.correct, 9);
  assert.equal(stats.english.readingAccuracy.total, 12);
  assert.equal(stats.politics.total.correct, 11);
  assert.equal(stats.politics.total.total, 17);
  assert.deepEqual(stats.politics.errorCodes, { K: 3, M: 3, L: 0, W: 0, C: 0, G: 0 });
});

test("D1 and mastery denominators exclude cancelled duplicate and unverified facts", () => {
  const stats = plain(api.buildP1WeeklyStats({
    reviewQueue: [{ reviewId: "a", reviewLevel: "D1", dueDate: "2026-07-21", status: "completed" }, { reviewId: "b", reviewLevel: "D1", dueDate: "2026-07-22", status: "cancelled" }, { reviewId: "c", reviewLevel: "D1", dueDate: "2026-07-22", status: "pending", duplicateOf: "a" }],
    professionalStore: { days: { "2026-07-20": { "722": { units: [{ unitId: "u1", mastery: "L2", reviewResult: "通过" }, { unitId: "u2", mastery: "L0", reviewResult: "未验收" }] } } } },
  }, "2026-07-22"));
  assert.equal(stats.reviews.d1Due, 1); assert.equal(stats.reviews.d1CompletionRate, 1);
  assert.equal(stats.professional.formalUnits, 1); assert.equal(stats.professional.l2OrL3Rate, 1);
});

test("snapshot schema 2 preserves P0 facts and adds P1 factual sections without writing", () => {
  const input = { date: "2026-07-22", dailyPlan: { tasks: [] }, dailyPlans: {}, phaseTemplates: [], reviewQueue: [], professionalStore: {}, history: [], wordRecords: [{ date: "2026-07-22", recordId: "w" }], politicsRecords: [], outputRecords: [], ankiCandidates: [{ status: "candidate" }], executionModes: { days: { "2026-07-22": { mode: "compressed" } } }, debtQueue: [] };
  const before = JSON.stringify(input); const snapshot = plain(api.buildP1TodaySnapshot(input));
  assert.equal(snapshot.schemaVersion, 2); assert.equal(snapshot.type, "study-dashboard-today-snapshot"); assert.equal(snapshot.english.words.length, 1); assert.equal(snapshot.anki.pending, 1); assert.equal(snapshot.execution.mode, "compressed"); assert.equal(JSON.stringify(input), before);
  const markdown = api.buildP1ControlMarkdown(snapshot); assert.match(markdown, /英语单词实际/); assert.match(markdown, /Anki待审核/);
});
