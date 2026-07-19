import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ Date });
vm.runInContext(`${readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8")}\n${readFileSync(new URL("../js/p0-final-core.js", import.meta.url), "utf8")}\nglobalThis.core={getP0PhaseOverview,getP0ReviewFacts,buildP0TopPriorities,getP0FactSummary,buildP0TodaySnapshot,buildP0ControlMarkdown,getLatestP0FormalActivityDate};`, context);
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
  assert.equal(snapshot.effectiveStudySeconds, 0); assert.deepEqual(snapshot.tasks.completed, []); assert.deepEqual(snapshot.professionalProgress["722"].actualUnits, []); assert.equal(snapshot.tomorrowPriority, "未记录");
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
  ["日期：", "当前阶段：", "有效学习时长：", "722实际完成：", "844下一起点：", "明日最高优先级："].forEach((label) => assert.ok(markdown.includes(label)));
  assert.ok(markdown.includes("未记录"));
});

test("19. latest activity uses formal data and ignores an old supplied date", () => {
  const latest = core.getLatestP0FormalActivityDate({ history: [{ date: "2026-07-18" }], focusTotals: { "2026-07-19": 60 }, dailyPlans: { "2026-07-20": { tasks: [task("a", "722")] } } });
  assert.equal(latest, "2026-07-19");
});

test("20. professional and completed-review dates participate in latest activity", () => {
  const latest = core.getLatestP0FormalActivityDate({ professionalStore: { days: { "2026-07-20": {} } }, reviewQueue: [review("a", "D1", "2026-07-19", "completed", { completedDate: "2026-07-21" })] });
  assert.equal(latest, "2026-07-21");
});
