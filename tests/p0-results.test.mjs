import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const context = { console };
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8")}
globalThis.api = {
  stableKnowledgeUnitId,
  buildReviewKey,
  ensureReviewSchedule,
  normalizeReviewQueueRecords,
  applyReviewResult,
  rescheduleReview,
  getDueReviews,
  normalizeProfessionalResultsStore,
  validateProfessionalUnit,
};`, context);

const unit = {
  subject: "722",
  unitId: context.api.stableKnowledgeUnitId("722", "实践与认识"),
  name: "实践与认识",
  sourceTaskId: "ma-yuan-722",
};
const now = "2026-07-18T12:00:00.000Z";
const scheduled = context.api.ensureReviewSchedule([], unit, "2026-07-18", now);
assert.equal(scheduled.length, 6);
assert.equal(new Set(scheduled.map((item) => item.reviewKey)).size, 6);
assert.equal(context.api.ensureReviewSchedule(scheduled, unit, "2026-07-18", now).length, 6);

const d1 = scheduled.find((item) => item.reviewLevel === "D1");
const partial = context.api.applyReviewResult(scheduled, d1.reviewId, "partial", "2026-07-19", "2026-07-19T12:00:00.000Z");
assert.equal(partial.records.find((item) => item.reviewId === d1.reviewId).status, "completed");
assert.equal(partial.records.filter((item) => item.reviewLevel === "short-retest").length, 1);
assert.equal(partial.records.find((item) => item.reviewLevel === "short-retest").dueDate, "2026-07-20");
assert.equal(partial.records.find((item) => item.reviewLevel === "short-retest").dueAt, "2026-07-20T12:00:00.000Z");

const moved = context.api.rescheduleReview(partial.records, partial.records.find((item) => item.reviewLevel === "D7").reviewId, "2026-07-30", now);
assert.equal(moved.records.find((item) => item.reviewLevel === "D7").dueDate, "2026-07-30");
assert.equal(moved.records.length, partial.records.length);

const d3 = moved.records.find((item) => item.reviewLevel === "D3");
const failed = context.api.applyReviewResult(moved.records, d3.reviewId, "failed", "2026-07-21", "2026-07-21T12:00:00.000Z");
assert.equal(failed.records.find((item) => item.reviewLevel === "D0").status, "pending");
assert.equal(failed.records.find((item) => item.reviewLevel === "D0").dueDate, "2026-07-21");
assert.equal(failed.records.find((item) => item.reviewLevel === "D1").dueDate, "2026-07-22");
assert.equal(failed.records.filter((item) => item.reviewKey === context.api.buildReviewKey("722", unit.unitId, "D0")).length, 1);

const overdueShort = { ...failed.records.find((item) => item.reviewLevel === "short-retest"), status: "pending", dueDate: "2026-07-20" };
const due = context.api.getDueReviews([...failed.records.filter((item) => item.reviewLevel !== "short-retest"), overdueShort], "2026-07-21");
assert.equal(due[0].reviewLevel, "short-retest");

assert.equal(context.api.normalizeProfessionalResultsStore({}).schemaVersion, 1);
assert.equal(context.api.validateProfessionalUnit({
  subject: "722", name: "实践与认识", mastery: "L3", reviewResult: "通过",
  closedBookResult: "", mainGaps: ["概念边界"], nextStart: "重做闭卷复述",
}).valid, false);
assert.equal(context.api.validateProfessionalUnit({
  subject: "722", name: "实践与认识", mastery: "L3", reviewResult: "通过",
  closedBookResult: "可闭卷恢复核心关系", mainGaps: ["概念边界"], nextStart: "重做闭卷复述",
}).valid, true);

console.log("P0_RESULTS_TEST_OK");
