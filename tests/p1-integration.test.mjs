import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ console, Date });
for (const file of ["plan-window-core.js", "p0-results.js", "p0-final-core.js", "p1-integration-core.js"]) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8"), context);
}
const api = vm.runInContext("({getP1WeekRange,buildP1WeeklyStats,buildP1TodaySnapshot,buildP1ControlMarkdown,isAuxiliaryManualStudyRecord,getDailyClosedBookGateStatus,getCurrentDailyExecutionGap,getAnchorAwareDailyExecutionGap,getNightExecutionState})", context);
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
  assert.equal(Object.prototype.hasOwnProperty.call(stats, "execution"), false);
});

test("auxiliary activities never count as effective study", () => {
  ["Anki制作", "网站维护", "数据整理", "提示词优化", "文件整理", "工具建设"].forEach((note) => {
    assert.equal(api.isAuxiliaryManualStudyRecord({ taskId: "other-study", taskTitle: "其他考研学习", note }), true);
  });
  assert.equal(api.isAuxiliaryManualStudyRecord({ taskId: "other-study", taskTitle: "英语单词", note: "Anki滚动复习" }), false);
  assert.equal(api.isAuxiliaryManualStudyRecord({ taskId: "plan-722", taskTitle: "722", note: "闭卷重构" }), false);
  const stats = plain(api.buildP1WeeklyStats({
    focusTotals: { "2026-07-20": 3600 },
    manualRecords: [
      { date: "2026-07-20", durationSeconds: 1800, taskTitle: "网站维护" },
      { date: "2026-07-20", durationSeconds: 1200, taskTitle: "Anki制作" },
    ],
  }, "2026-07-22"));
  assert.equal(stats.effectiveStudy.totalSeconds, 3600);
});

test("weekly warning flags study time without formal learning results", () => {
  const withoutResults = plain(api.buildP1WeeklyStats({ focusTotals: { "2026-07-20": 3600 } }, "2026-07-22"));
  assert.equal(withoutResults.warnings.includes("本周已有学习时间，但未保存英语、政治或专业课正式结果"), true);
  const withResult = plain(api.buildP1WeeklyStats({
    focusTotals: { "2026-07-20": 3600 },
    wordRecords: [{ date: "2026-07-20", recordId: "word-1" }],
  }, "2026-07-22"));
  assert.equal(withResult.warnings.includes("本周已有学习时间，但未保存英语、政治或专业课正式结果"), false);
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
  const input = { date: "2026-07-22", dailyPlan: { tasks: [] }, dailyPlans: {}, phaseTemplates: [], reviewQueue: [], professionalStore: {}, history: [], wordRecords: [{ date: "2026-07-22", recordId: "w" }], politicsRecords: [], outputRecords: [] };
  const before = JSON.stringify(input); const snapshot = plain(api.buildP1TodaySnapshot(input));
  assert.equal(snapshot.schemaVersion, 2); assert.equal(snapshot.type, "study-dashboard-today-snapshot"); assert.equal(snapshot.english.words.length, 1); assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "anki"), false); assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "execution"), false); assert.equal(JSON.stringify(input), before);
  const markdown = api.buildP1ControlMarkdown(snapshot); assert.match(markdown, /英语单词实际/); assert.doesNotMatch(markdown, /Anki|执行模式|当前欠账/);
});

test("daily closed-book gate ignores time-only activity and unfinished text", () => {
  const status = plain(api.getDailyClosedBookGateStatus({
    focusTotals: { "2026-07-30": 7200 },
    professionalStore: { days: { "2026-07-30": { "722": { units: [{
      subject: "722", name: "实践", nextStart: "下一节", closedBookResult: "未完成",
    }] } } } },
    outputRecords: [{ date: "2026-07-30", closedBook: false, question: "实践", structureResult: "三层结构" }],
  }, "2026-07-30"));
  assert.equal(status.hasProduct, false);
  assert.equal(status.professionalProducts.length, 0);
  assert.equal(status.outputProducts.length, 0);
});

test("daily closed-book gate accepts formal recovery, paper reconstruction, or valid closed-book output", () => {
  const professional = plain(api.getDailyClosedBookGateStatus({
    professionalStore: { days: { "2026-07-30": {
      "722": { units: [{ name: "实践", nextStart: "核对教材", closedBookResult: "恢复三个层次" }] },
      "844": { units: [{ name: "青年马克思", nextStart: "重看手稿", writtenReconstruction: "人物—著作—命题链" }] },
    } } },
  }, "2026-07-30"));
  assert.equal(professional.hasProduct, true);
  assert.deepEqual(professional.professionalProducts.map((item) => item.product), ["闭卷恢复", "纸上重构"]);
  const output = plain(api.getDailyClosedBookGateStatus({
    outputRecords: [{ date: "2026-07-30", closedBook: true, question: "实践标准", structureResult: "定义—关系—意义" }],
  }, "2026-07-30"));
  assert.equal(output.hasProduct, true);
  assert.equal(output.outputProducts.length, 1);
});

test("daily execution gaps unlock by checkpoint and return only the highest-priority missing fact", () => {
  const items = [
    { key: "english", taskId: "english", complete: false, deadlineMinutes: 12 * 60 + 35, priority: 10 },
    { key: "722", taskId: "722", complete: false, deadlineMinutes: 12 * 60 + 35, priority: 20 },
    { key: "844", taskId: "844", complete: false, deadlineMinutes: 17 * 60, priority: 30 },
    { key: "politics", taskId: "politics", complete: false, deadlineMinutes: 20 * 60 + 10, priority: 50 },
  ];
  assert.equal(api.getCurrentDailyExecutionGap(items, { nowMinutes: 12 * 60 + 34 }), null);
  const midday = plain(api.getCurrentDailyExecutionGap(items, { nowMinutes: 12 * 60 + 35 }));
  assert.equal(midday.key, "english");
  assert.equal(midday.remainingCount, 2);
  const afterEnglish = plain(api.getCurrentDailyExecutionGap(items.map((item) => item.key === "english" ? { ...item, complete: true } : item), { nowMinutes: 17 * 60 }));
  assert.equal(afterEnglish.key, "722");
  assert.equal(afterEnglish.remainingCount, 2);
});

test("daily execution gaps respect active modes, omit missing task ids, and allow an explicit forced item", () => {
  const items = [
    { key: "invalid", taskId: "", complete: false, deadlineMinutes: 0, priority: 1 },
    { key: "closed-book", taskId: "output", complete: false, deadlineMinutes: 20 * 60 + 20, priority: 5, forceEligible: true },
  ];
  assert.equal(api.getCurrentDailyExecutionGap(items, { nowMinutes: 10 * 60, blocked: true }), null);
  assert.equal(api.getCurrentDailyExecutionGap(items, { nowMinutes: 10 * 60 }).key, "closed-book");
  assert.equal(api.getCurrentDailyExecutionGap([{ ...items[1], complete: true }], { nowMinutes: 21 * 60 }), null);
});

test("daily review budget enters the gap only after its own time block", () => {
  const items = [
    { key: "review", taskId: "rolling-review", complete: false, deadlineMinutes: 21 * 60, priority: 40 },
    { key: "politics", taskId: "politics", complete: false, deadlineMinutes: 15 * 60 + 30, priority: 50 },
  ];
  assert.equal(api.getCurrentDailyExecutionGap(items, { nowMinutes: 20 * 60 + 59 }).key, "politics");
  const afterReviewBlock = plain(api.getCurrentDailyExecutionGap(items, { nowMinutes: 21 * 60 }));
  assert.equal(afterReviewBlock.key, "review");
  assert.equal(afterReviewBlock.remainingCount, 2);
  assert.equal(api.getCurrentDailyExecutionGap([{ ...items[0], complete: true }], { nowMinutes: 21 * 60 }), null);
});

test("scheduled task anchors keep the cockpit on 844 before and during its time block", () => {
  const items = [
    { key: "722", taskId: "722", complete: false, priority: 20, deadlineMinutes: 10 * 60 + 35, minimumBlockMinutes: 5 },
    { key: "844", taskId: "844", complete: false, priority: 30, deadlineMinutes: 12 * 60 + 20, minimumBlockMinutes: 5 },
  ];
  const anchors = [
    { key: "722", taskId: "722", label: "722", complete: false, startMinutes: 8 * 60 + 35, endMinutes: 10 * 60 + 35, transitionMinutes: 15 },
    { key: "844", taskId: "844", label: "844", complete: false, startMinutes: 10 * 60 + 50, endMinutes: 12 * 60 + 20, transitionMinutes: 15 },
  ];
  const noRoom = plain(api.getAnchorAwareDailyExecutionGap(items, { nowMinutes: 10 * 60 + 31, anchors: [anchors[1]], minimumBlockMinutes: 5 }));
  assert.equal(noRoom.key, "844");
  assert.equal(noRoom.anchorState, "upcoming");
  assert.equal(noRoom.availableMinutes, 4);
  const prepare = plain(api.getAnchorAwareDailyExecutionGap(items, { nowMinutes: 10 * 60 + 41, anchors }));
  assert.equal(prepare.key, "844");
  assert.equal(prepare.anchorState, "prepare");
  const active = plain(api.getAnchorAwareDailyExecutionGap(items, { nowMinutes: 10 * 60 + 50, anchors }));
  assert.equal(active.key, "844");
  assert.equal(active.anchorState, "active");
  const overdue = plain(api.getAnchorAwareDailyExecutionGap(items, { nowMinutes: 12 * 60 + 20, anchors }));
  assert.equal(overdue.key, "722");
  assert.equal(overdue.anchorState, undefined);
});

test("completed, blocked, or inspected schedule anchors never mutate execution facts", () => {
  const items = [
    { key: "722", taskId: "722", complete: false, priority: 20, deadlineMinutes: 10 * 60 + 35, minimumBlockMinutes: 5 },
  ];
  const anchors = [{ key: "844", taskId: "844", complete: true, startMinutes: 10 * 60 + 50, endMinutes: 12 * 60 + 20, transitionMinutes: 15 }];
  const before = JSON.stringify({ items, anchors });
  assert.equal(api.getAnchorAwareDailyExecutionGap(items, { nowMinutes: 10 * 60 + 50, anchors }).key, "722");
  assert.equal(api.getAnchorAwareDailyExecutionGap(items, { nowMinutes: 10 * 60 + 50, anchors, blocked: true }), null);
  assert.equal(JSON.stringify({ items, anchors }), before);
});

test("night stop keeps at most one professional product and one English-or-politics support task", () => {
  const items = [
    { key: "english", taskId: "english", complete: false, priority: 10 },
    { key: "722", taskId: "722", complete: false, priority: 20 },
    { key: "844", taskId: "844", complete: false, priority: 30 },
    { key: "politics", taskId: "politics", complete: false, priority: 50 },
    { key: "closed-book", taskId: "output", complete: false, priority: 60 },
  ];
  assert.equal(api.getNightExecutionState(items, { nowMinutes: 21 * 60 + 39, cutoffMinutes: 21 * 60 + 40, hardCutoffMinutes: 22 * 60 + 30 }), null);
  const night = plain(api.getNightExecutionState(items, { nowMinutes: 21 * 60 + 40, cutoffMinutes: 21 * 60 + 40, hardCutoffMinutes: 22 * 60 + 30 }));
  assert.equal(night.mode, "tasks");
  assert.deepEqual(night.items.map((item) => item.key), ["722", "english"]);
  assert.equal(night.remainingCount, 2);
});

test("night stop does not replace completed English with politics after the cutoff and hard-stops at 22:30", () => {
  const items = [
    { key: "english", taskId: "english", complete: true, priority: 10 },
    { key: "politics", taskId: "politics", complete: false, priority: 50 },
    { key: "closed-book", taskId: "output", complete: true, priority: 60 },
  ];
  const consumed = plain(api.getNightExecutionState(items, {
    nowMinutes: 22 * 60, cutoffMinutes: 21 * 60 + 40, hardCutoffMinutes: 22 * 60 + 30,
    englishCompletedAfterCutoff: true,
  }));
  assert.equal(consumed.mode, "closeout");
  const politics = plain(api.getNightExecutionState(items, {
    nowMinutes: 22 * 60, cutoffMinutes: 21 * 60 + 40, hardCutoffMinutes: 22 * 60 + 30,
    englishCompletedAfterCutoff: false,
  }));
  assert.deepEqual(politics.items.map((item) => item.key), ["politics"]);
  assert.equal(api.getNightExecutionState(items, {
    nowMinutes: 22 * 60 + 30, cutoffMinutes: 21 * 60 + 40, hardCutoffMinutes: 22 * 60 + 30,
  }).mode, "closeout");
  assert.equal(api.getNightExecutionState(items, {
    nowMinutes: 22 * 60, cutoffMinutes: 21 * 60 + 40, hardCutoffMinutes: 22 * 60 + 30, blocked: true,
  }), null);
});
