import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(`${source}\nglobalThis.core = { getLocalPlanDateKey, addLocalPlanDays, getDetailedPlanWindow, createDetailedPlanFromSource, buildPhaseTemplatesFromImportedPlan, buildPhaseTemplatesFromDailyPlans, migrateDetailedPlanWindow, buildPlanImportPreview, materializeDayFromPhaseTemplate, makePlanWindowState };`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));

function sourceDay(phase = "第一轮正式背诵", suffix = "") {
  return {
    weekday: "周六",
    phase,
    targetEffectiveStudyHours: 9,
    defaultStatus: "未开始",
    tasks: Object.fromEntries(["722", "844", "english", "politics", "outputOrMock", "originalTextOrReview", "training"].map((key) => [key, { description: `${key}${suffix}` }])),
  };
}

function makePlan() {
  const dailyPlans = {};
  for (let index = -1; index < 10; index += 1) dailyPlans[core.addLocalPlanDays("2026-07-18", index)] = sourceDay(index < 7 ? "第一轮正式背诵" : "第一轮全书封口", `-${index}`);
  return {
    planType: "nankai-marxism-exam-plan",
    schemaVersion: 2,
    dailyPlans,
    phases: [
      { name: "第一轮正式背诵", start: "2026-07-18", end: "2026-07-24", goal: "原目标", acceptance: "原验收" },
      { name: "第一轮全书封口", start: "2026-07-25", end: "2026-07-31", goal: "封口目标", acceptance: "封口验收" },
    ],
    coreMilestones: [{ name: "第一轮正式背诵", internalTarget: "2026-07-24", coreOutput: "里程碑" }],
  };
}

test("1. seven-day window is today through today plus six", () => {
  assert.deepEqual(plain(core.getDetailedPlanWindow("2026-07-18")), {
    windowStart: "2026-07-18", windowEnd: "2026-07-24",
    dates: ["2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
  });
});

test("2. month end rolls in local calendar", () => assert.equal(core.addLocalPlanDays("2026-07-31", 1), "2026-08-01"));
test("3. year end rolls in local calendar", () => assert.equal(core.addLocalPlanDays("2026-12-31", 1), "2027-01-01"));
test("4. leap day is retained", () => assert.equal(core.addLocalPlanDays("2028-02-28", 1), "2028-02-29"));
test("5. local getters, not UTC serialization, decide the date", () => {
  const fakeLocalDate = { getFullYear: () => 2026, getMonth: () => 0, getDate: () => 1, toISOString: () => "2025-12-31T16:00:00.000Z" };
  assert.equal(core.getLocalPlanDateKey(fakeLocalDate), "2026-01-01");
});

test("6. imported phase names, dates, goals and milestones stay source-exact", () => {
  const templates = plain(core.buildPhaseTemplatesFromImportedPlan(makePlan()));
  assert.equal(templates[0].phaseName, "第一轮正式背诵");
  assert.equal(templates[0].startDate, "2026-07-18");
  assert.equal(templates[0].endDate, "2026-07-24");
  assert.equal(templates[0].goal, "原目标");
  assert.equal(templates[0].milestones[0].coreOutput, "里程碑");
});

test("7. migration keeps history and only seven current/future detailed dates", () => {
  const plan = makePlan();
  const plans = { "2026-07-17": { actual: true }, ...Object.fromEntries(Object.entries(plan.dailyPlans).filter(([date]) => date >= "2026-07-18")) };
  const result = plain(core.migrateDetailedPlanWindow(plans, core.buildPhaseTemplatesFromImportedPlan(plan), "2026-07-18"));
  assert.equal(result.dailyPlans["2026-07-17"].actual, true);
  assert.equal(Object.keys(result.dailyPlans).filter((date) => date >= "2026-07-18").length, 7);
  assert.ok(Object.keys(result.archivedFarPlans).every((date) => date >= "2026-07-25"));
});

test("8. crossing a day adds only the new seventh day", () => {
  const plan = makePlan();
  const templates = core.buildPhaseTemplatesFromImportedPlan(plan);
  const initial = core.migrateDetailedPlanWindow(plan.dailyPlans, templates, "2026-07-18").dailyPlans;
  const rolled = plain(core.migrateDetailedPlanWindow(initial, templates, "2026-07-19"));
  assert.ok(rolled.dailyPlans["2026-07-25"]);
  assert.equal(rolled.dailyPlans["2026-07-25"].template, "phase-template-v1");
  assert.equal(Object.keys(rolled.dailyPlans).length, Object.keys(initial).length + 1);
  assert.equal(Object.keys(rolled.dailyPlans).filter((date) => date >= "2026-07-19").length, 7);
});

test("9. import skips past and converts day eight onward to phase templates", () => {
  const preview = plain(core.buildPlanImportPreview(makePlan(), {}, "2026-07-18"));
  assert.deepEqual(preview.skippedHistoryDates, ["2026-07-17"]);
  assert.equal(preview.newDates.length, 7);
  assert.equal(preview.farDatesConverted.length, 3);
  assert.equal(Object.keys(preview.result.dailyPlans).length, 7);
});

test("10. completed, in-progress and manual-edited tasks default to local", () => {
  const plan = makePlan();
  const local = core.createDetailedPlanFromSource("2026-07-18", sourceDay("第一轮正式背诵", "-local"));
  local.tasks[0].status = "completed";
  local.tasks[1].status = "in-progress";
  local.tasks[2].manualEdited = true;
  local.tasks[2].description = "人工说明";
  const preview = plain(core.buildPlanImportPreview(plan, { "2026-07-18": local }, "2026-07-18"));
  assert.equal(preview.completedConflicts.length, 1);
  assert.equal(preview.inProgressConflicts.length, 1);
  assert.equal(preview.manualEditedConflicts.length, 1);
  assert.equal(preview.result.dailyPlans["2026-07-18"].tasks[2].description, "人工说明");
});

test("11. custom tasks are preserved and never name-matched", () => {
  const local = core.createDetailedPlanFromSource("2026-07-18", sourceDay());
  local.tasks.push({ id: "custom-1", name: "英语", description: "我的自定义任务", status: "not-started" });
  const preview = plain(core.buildPlanImportPreview(makePlan(), { "2026-07-18": local }, "2026-07-18"));
  assert.equal(preview.customTasks.length, 1);
  assert.ok(preview.result.dailyPlans["2026-07-18"].tasks.some((task) => task.id === "custom-1"));
});

test("12. taskId has priority and sourceTaskKey is the stable fallback", () => {
  const local = core.createDetailedPlanFromSource("2026-07-18", sourceDay());
  local.tasks[0].taskId = "different";
  local.tasks[0].id = "different";
  local.tasks[0].sourceTaskKey = "english";
  const preview = plain(core.buildPlanImportPreview(makePlan(), { "2026-07-18": local }, "2026-07-18"));
  assert.ok(preview.updatedTasks.some((item) => item.importedTask.sourceTaskKey === "english"));
});

test("13. an explicit use-import decision changes content but retains actual status", () => {
  const plan = makePlan();
  const local = core.createDetailedPlanFromSource("2026-07-18", sourceDay("第一轮正式背诵", "-old"));
  local.tasks[0].status = "completed";
  const first = plain(core.buildPlanImportPreview(plan, { "2026-07-18": local }, "2026-07-18"));
  const decisions = { [first.completedConflicts[0].id]: "use-import" };
  const second = plain(core.buildPlanImportPreview(plan, { "2026-07-18": local }, "2026-07-18", decisions));
  assert.equal(second.result.dailyPlans["2026-07-18"].tasks[0].description, "english-0");
  assert.equal(second.result.dailyPlans["2026-07-18"].tasks[0].status, "completed");
});

test("14. preview construction and cancellation path perform zero writes", () => {
  const existing = { "2026-07-17": { marker: "unchanged" } };
  const before = JSON.stringify(existing);
  core.buildPlanImportPreview(makePlan(), existing, "2026-07-18");
  assert.equal(JSON.stringify(existing), before);
});

test("15. repeated window migration is idempotent", () => {
  const plan = makePlan();
  const templates = core.buildPhaseTemplatesFromImportedPlan(plan);
  const first = plain(core.migrateDetailedPlanWindow(plan.dailyPlans, templates, "2026-07-18"));
  const second = plain(core.migrateDetailedPlanWindow(first.dailyPlans, templates, "2026-07-18"));
  assert.deepEqual(second.dailyPlans, first.dailyPlans);
  assert.deepEqual(second.archivedFarPlans, {});
});

test("16. state records the formal schema and migration id", () => {
  const state = plain(core.makePlanWindowState("2026-07-18"));
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.migrationId, "p0-plan-window-v1");
});

test("17. detailed imported tasks carry the required stable and result fields", () => {
  const day = plain(core.createDetailedPlanFromSource("2026-07-18", sourceDay(), [
    { module: "722", minimumOutput: "阶段门槛达标" },
  ]));
  const task = day.tasks.find((item) => item.taskId === "plan-722");
  assert.equal(day.date, "2026-07-18");
  assert.equal(task.sourceTaskKey, "722");
  assert.equal(task.subject, "722马原");
  assert.equal(task.completionCriteria, "阶段门槛达标");
  assert.equal(task.manualEdited, false);
  assert.deepEqual(task.actualResultRefs, []);
  const english = day.tasks.find((item) => item.taskId === "plan-english");
  assert.equal(english.resultTrackingVersion, 1);
  assert.deepEqual(english.subtasks.map((item) => [item.subtaskId, item.required]), [["words", true], ["reading", true]]);
});

test("18. an unreliable name-only candidate enters conflict instead of being overwritten", () => {
  const localDay = { tasks: [{ id: "custom-english", name: "英语", description: "自定义", status: "not-started" }], currentTaskId: "" };
  const preview = plain(core.buildPlanImportPreview(makePlan(), { "2026-07-18": localDay }, "2026-07-18"));
  assert.equal(preview.unmatchedConflicts.length, 1);
  assert.equal(preview.unmatchedConflicts[0].decision, "keep-local");
  assert.equal(preview.result.dailyPlans["2026-07-18"].tasks[0].description, "自定义");
});
