import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ Date });
vm.runInContext(`${readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8")}\n${readFileSync(new URL("../js/p0-final-core.js", import.meta.url), "utf8")}\nglobalThis.core={getP0PhaseOverview,getP0ReviewFacts,buildP0TopPriorities,getP0FactSummary,getP0TomorrowPriority,buildP0TodaySnapshot,buildP0ControlMarkdown,getLatestP0FormalActivityDate};`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));
const phases = [
  { phaseId: "p1", phaseName: "阶段一", startDate: "2026-07-18", endDate: "2026-07-20", milestones: [{ name: "封口", internalTarget: "2026-07-20" }] },
  { phaseId: "p2", phaseName: "阶段二", startDate: "2026-07-22", endDate: "2026-07-30", milestones: [] },
];
const task = (id, name, status = "not-started", extra = {}) => ({ id, taskId: id, name, status, counted: true, ...extra });
const review = (id, level, dueDate, status = "pending", extra = {}) => ({ reviewId: id, reviewKey: id, reviewLevel: level, dueDate, status, subject: "722", knowledgeUnit: id, ...extra });

test("1. phase start boundary is active", () => assert.equal(core.getP0PhaseOverview(phases, "2026-07-18").currentName, "阶段一"));
test("2. phase end boundary has zero days remaining", () => assert.equal(core.getP0PhaseOverview(phases, "2026-07-20").remainingDays, 0));
test("3. phase gap is explicit", () => assert.equal(core.getP0PhaseOverview(phases, "2026-07-21").status, "transition"));
test("4. ended phases are not current", () => assert.equal(core.getP0PhaseOverview(phases, "2026-08-01").current, null));
test("5. missing templates return unconfigured", () => assert.equal(core.getP0PhaseOverview([], "2026-07-19").currentName, "未配置"));
test("6. missing milestones remain absent", () => assert.equal(core.getP0PhaseOverview([{ ...phases[0], milestones: [] }], "2026-07-19").nextMilestone, null));

test("7. review facts exclude completed and cancelled from due counts", () => {
  const facts = plain(core.getP0ReviewFacts([review("a", "D1", "2026-07-18"), review("b", "D3", "2026-07-19"), review("c", "D7", "2026-07-19", "cancelled"), review("d", "D14", "2026-07-19", "completed")], "2026-07-19"));
  assert.equal(facts.overdue.length, 1); assert.equal(facts.dueToday.length, 1);
});

test("8. completed-today reviews use completedDate", () => {
  const facts = plain(core.getP0ReviewFacts([review("a", "D1", "2026-07-18", "completed", { completedDate: "2026-07-19" })], "2026-07-19"));
  assert.equal(facts.completedToday.length, 1);
});

test("9. priority order starts with overdue short retest then overdue D30", () => {
  const priorities = plain(core.buildP0TopPriorities({ tasks: [task("plan-722", "722")] }, [review("d1", "D1", "2026-07-18"), review("d30", "D30", "2026-07-18"), review("short", "short-retest", "2026-07-18")], "2026-07-19", 5));
  assert.deepEqual(priorities.slice(0, 3).map((item) => item.targetId), ["short", "d30", "d1"]);
});

test("10. priorities deduplicate the same review key", () => {
  const priorities = core.buildP0TopPriorities({ tasks: [] }, [review("a", "D1", "2026-07-18"), { ...review("b", "D1", "2026-07-18"), reviewKey: "a" }], "2026-07-19");
  assert.equal(priorities.length, 1);
});

test("11. completed and skipped tasks are excluded", () => {
  const priorities = core.buildP0TopPriorities({ tasks: [task("a", "722", "completed"), task("b", "844", "skipped"), task("c", "英语")] }, [], "2026-07-19");
  assert.deepEqual(plain(priorities.map((item) => item.targetId)), ["c"]);
});

test("12. task priority follows 722, 844, English", () => {
  const priorities = core.buildP0TopPriorities({ tasks: [task("e", "英语"), task("m", "844"), task("y", "722")] }, [], "2026-07-19", 3);
  assert.deepEqual(plain(priorities.map((item) => item.targetId)), ["y", "m", "e"]);
});

test("13. fact summary identifies schedule-overdue unfinished tasks", () => {
  const facts = core.getP0FactSummary({ tasks: [task("a", "722", "not-started", { time: "08:00—10:00" }), task("b", "844", "in-progress", { time: "14:00—16:00" })] }, [], "2026-07-19", 12 * 60);
  assert.equal(facts.unfinishedTaskCount, 2); assert.deepEqual(facts.overdueBySchedule.map((item) => item.id), ["a"]);
});

test("14. empty snapshot contains no fabricated results", () => {
  const snapshot = plain(core.buildP0TodaySnapshot({ date: "2026-07-19" }));
  assert.equal(snapshot.effectiveStudySeconds, 0); assert.deepEqual(snapshot.tasks.completed, []); assert.deepEqual(snapshot.professionalProgress["722"].actualUnits, []); assert.deepEqual(snapshot.tomorrowPriority, { value: "未记录", source: "none" });
});

test("15. snapshot completed tasks require explicit completed status", () => {
  const snapshot = plain(core.buildP0TodaySnapshot({ date: "2026-07-19", dailyPlan: { tasks: [task("a", "722", "completed"), task("b", "844", "in-progress"), task("c", "英语")] } }));
  assert.deepEqual(snapshot.tasks.completed.map((item) => item.taskId), ["a"]); assert.deepEqual(snapshot.tasks.inProgress.map((item) => item.taskId), ["b"]); assert.deepEqual(snapshot.tasks.unfinished.map((item) => item.taskId), ["c"]);
});

test("16. unverified professional data is retained and warned, never upgraded", () => {
  const store = { schemaVersion: 1, days: { "2026-07-19": { "722": { units: [{ unitId: "u", name: "实践", mastery: "L2", reviewResult: "未验收", mainGaps: ["遗漏"], nextStart: "下一节" }] } } } };
  const snapshot = plain(core.buildP0TodaySnapshot({ date: "2026-07-19", professionalStore: store }));
  assert.equal(snapshot.professionalProgress["722"].mastery[0].level, "L2"); assert.equal(snapshot.professionalProgress["722"].reviewResults[0].result, "未验收"); assert.ok(snapshot.warnings.some((warning) => warning.includes("尚未验收")));
});

test("17. task focus and planned time remain separate", () => {
  const snapshot = plain(core.buildP0TodaySnapshot({ date: "2026-07-19", effectiveStudySeconds: 600, taskFocusSeconds: { a: 300 }, dailyPlan: { tasks: [task("a", "722", "in-progress", { time: "10:00—12:00" })] } }));
  assert.equal(snapshot.effectiveStudySeconds, 600); assert.equal(snapshot.tasks.inProgress[0].actualFocusSeconds, 300); assert.equal(snapshot.tasks.inProgress[0].plannedTime, "10:00—12:00");
});

test("18. Markdown has the fixed control fields and missing values", () => {
  const markdown = core.buildP0ControlMarkdown(core.buildP0TodaySnapshot({ date: "2026-07-19" }));
  ["日期：", "当前阶段：", "有效学习时长：", "722实际完成：", "844下一起点：", "明日最高优先级：", "优先级来源：none"].forEach((label) => assert.ok(markdown.includes(label)));
  assert.ok(markdown.includes("未记录"));
});

test("19. latest activity uses formal data and ignores an old supplied date", () => {
  const latest = core.getLatestP0FormalActivityDate({ history: [{ date: "2026-07-18" }], focusTotals: { "2026-07-19": 60 }, dailyPlans: { "2026-07-20": { tasks: [task("a", "722")] } } });
  assert.equal(latest, "2026-07-19");
});

test("20. professional and completed-review dates participate in latest activity", () => {
  const latest = core.getLatestP0FormalActivityDate({ professionalStore: { days: { "2026-07-20": {} } }, reviewQueue: [review("a", "D1", "2026-07-19", "completed", { completedDate: "2026-07-21" })] }, "2026-07-21");
  assert.equal(latest, "2026-07-21");
});

test("21. invalid rescheduled and duplicate reviews are excluded", () => {
  const facts = plain(core.getP0ReviewFacts([
    review("valid", "D1", "2026-07-18"),
    review("rescheduled", "D3", "2026-07-18", "rescheduled"),
    review("duplicate", "D7", "2026-07-18", "pending", { duplicateOf: "valid" }),
    review("superseded", "D14", "2026-07-18", "pending", { supersededBy: "new" }),
  ], "2026-07-19"));
  assert.deepEqual(facts.overdue.map((item) => item.reviewId), ["valid"]);
});

test("22. tomorrow priority prefers formal review history", () => {
  const result = plain(core.getP0TomorrowPriority({
    todayKey: "2026-07-19",
    history: [{ date: "2026-07-19", tomorrowPriority: "先闭卷复述实践论" }],
    reviewQueue: [review("r", "D1", "2026-07-20")],
  }));
  assert.deepEqual(result, { value: "先闭卷复述实践论", source: "manual-review-history" });
});

test("23. tomorrow priority falls back to active review then categorized plan", () => {
  const reviewResult = plain(core.getP0TomorrowPriority({ todayKey: "2026-07-19", reviewQueue: [review("r", "D1", "2026-07-20")] }));
  assert.equal(reviewResult.source, "review-queue");
  const planResult = plain(core.getP0TomorrowPriority({
    todayKey: "2026-07-19",
    dailyPlans: { "2026-07-20": { tasks: [task("e", "英语"), task("y", "722核心任务"), task("done", "722已完成", "completed")] } },
  }));
  assert.deepEqual(planResult, { value: "722核心任务", source: "tomorrow-plan" });
});

test("24. latest activity excludes future, skipped, empty, zero, and non-study manual records", () => {
  const latest = core.getLatestP0FormalActivityDate({
    focusTotals: { "2026-07-18": 60, "2026-07-20": 90 },
    focusSessions: [{ date: "2026-07-19", seconds: 0 }],
    professionalStore: { days: { "2026-07-19": {}, "2026-07-20": { "722": { units: [{ name: "未来结果" }] } } } },
    manualRecords: [{ date: "2026-07-19", durationSeconds: 3600, taskTitle: "居家训练" }],
    dailyPlans: { "2026-07-19": { tasks: [task("skip", "跳过", "skipped")] } },
  }, "2026-07-19");
  assert.equal(latest, "2026-07-18");
});

test("25. actual result or positive focus is formal activity without completion", () => {
  assert.equal(core.getLatestP0FormalActivityDate({ focusTotals: { "2026-07-19": 1 } }, "2026-07-19"), "2026-07-19");
  assert.equal(core.getLatestP0FormalActivityDate({ dailyPlans: { "2026-07-19": { tasks: [task("a", "722", "not-started", { actualResult: { note: "已记录实际结果" } })] } } }, "2026-07-19"), "2026-07-19");
});

test("26. task focus never implies task completion or professional mastery", () => {
  const snapshot = plain(core.buildP0TodaySnapshot({ date: "2026-07-19", taskFocusSeconds: { a: 3600 }, dailyPlan: { tasks: [task("a", "722")] } }));
  assert.equal(snapshot.tasks.completed.length, 0);
  assert.deepEqual(snapshot.professionalProgress["722"].mastery, []);
});

test("27. top priorities exclude invalid rescheduled reviews and deduplicate task business keys", () => {
  const priorities = plain(core.buildP0TopPriorities({ tasks: [task("a", "722"), { ...task("b", "722重复"), taskId: "a" }] }, [review("old", "D30", "2026-07-18", "pending", { rescheduledTo: "new" })], "2026-07-19", 5));
  assert.deepEqual(priorities.map((item) => item.targetId), ["a"]);
});

test("28. warnings contain only observed overdue and explicit unfinished facts", () => {
  const snapshot = plain(core.buildP0TodaySnapshot({ date: "2026-07-19", dailyPlan: { tasks: [task("a", "722")] }, reviewQueue: [review("r", "D1", "2026-07-18")] }));
  assert.ok(snapshot.warnings.includes("存在1项逾期复盘"));
  assert.ok(snapshot.warnings.includes("今日有1项明确未完成任务"));
});

test("29. review facts deduplicate business keys and use completedAt local date", () => {
  const facts = plain(core.getP0ReviewFacts([
    review("a", "D1", "2026-07-20"),
    { ...review("b", "D1", "2026-07-20"), reviewKey: "a" },
    review("done", "D1", "2026-07-18", "completed", { completedAt: "2026-07-19T08:00:00+08:00" }),
  ], "2026-07-19"));
  assert.equal(facts.dueTomorrow.length, 1);
  assert.equal(facts.completedToday.length, 1);
});

test("30. cancelled tasks never enter today or tomorrow priority", () => {
  assert.equal(core.buildP0TopPriorities({ tasks: [task("x", "722", "cancelled")] }, [], "2026-07-19").length, 0);
  assert.deepEqual(plain(core.getP0TomorrowPriority({ todayKey: "2026-07-19", dailyPlans: { "2026-07-20": { tasks: [task("x", "722", "cancelled")] } } })), { value: "未记录", source: "none" });
});
