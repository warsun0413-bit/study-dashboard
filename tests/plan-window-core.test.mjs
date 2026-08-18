import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(`${source}\nglobalThis.core = { getLocalPlanDateKey, addLocalPlanDays, findPlanTaskForMinutes, findNextExecutablePlanTask, findNextScheduledPlanTask, buildSafeguardSequence, getDailyHandoffCategory, buildDailyHandoffCandidate, buildScheduledDailyHandoffCandidate, findLatestProfessionalBreakpoint, findLatestExecutionBreakpoint, inferPlanOutputSubject, activatePlanTaskForFocus, clearTerminalCurrentPlanTask, clearPlanCurrentTask, selectPlanCurrentTask, getDetailedPlanWindow, getTrustedImportedDailyDates, createDetailedPlanFromSource, buildPhaseTemplatesFromImportedPlan, buildPhaseTemplatesFromDailyPlans, migrateDetailedPlanWindow, buildPlanImportPreview, materializeDayFromPhaseTemplate, makePlanWindowState };`, context);
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

test("6a. legacy phase templates without provenance stay untrusted", () => {
  const day = plain(core.materializeDayFromPhaseTemplate("2026-08-13", {
    phaseId: "legacy-phase",
    phaseName: "旧阶段",
    startDate: "2026-08-13",
    endDate: "2026-08-20",
    taskTemplates: {},
    completionCriteria: {},
  }));
  assert.equal(day.sourcePlanType, "");
  assert.equal(day.sourceSchemaVersion, 0);
});

test("6b. only source days retained in the current seven-day window are trusted as exact", () => {
  const plan = makePlan();
  const window = core.getDetailedPlanWindow("2026-07-18");
  assert.deepEqual(plain(core.getTrustedImportedDailyDates(plan, window)), [
    "2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
  ]);
  assert.equal(Object.keys(plan.dailyPlans).length > 7, true);
});

test("7. migration keeps history and only seven current/future detailed dates", () => {
  const plan = makePlan();
  const plans = { "2026-07-17": { actual: true }, ...Object.fromEntries(Object.entries(plan.dailyPlans).filter(([date]) => date >= "2026-07-18")) };
  const result = plain(core.migrateDetailedPlanWindow(plans, core.buildPhaseTemplatesFromImportedPlan(plan), "2026-07-18"));
  assert.equal(result.dailyPlans["2026-07-17"].actual, true);
  assert.equal(Object.keys(result.dailyPlans).filter((date) => date >= "2026-07-18").length, 7);
  assert.ok(Object.keys(result.archivedFarPlans).every((date) => date >= "2026-07-25"));
});

test("7a. migration updates recognized schedule times without changing user task evidence", () => {
  const day = plain(core.createDetailedPlanFromSource("2026-07-18", sourceDay()));
  day.tasks = day.tasks.filter((task) => task.sourceTaskKey !== "englishWords");
  const english = day.tasks.find((task) => task.sourceTaskKey === "english");
  english.time = "08:00—10:00";
  english.status = "completed";
  english.manualEdited = true;
  english.description = "我的人工英语安排";
  english.actualResultRefs = ["reading-1"];
  day.tasks.push({ id: "custom", time: "13:00—13:30", name: "自定义任务", description: "保持不变", status: "in-progress" });

  const migrated = plain(core.migrateDetailedPlanWindow({ "2026-07-18": day }, [], "2026-07-18")).dailyPlans["2026-07-18"];
  const migratedEnglish = migrated.tasks.find((task) => task.sourceTaskKey === "english");
  const migratedWords = migrated.tasks.find((task) => task.sourceTaskKey === "englishWords");
  const custom = migrated.tasks.find((task) => task.id === "custom");
  assert.equal(migratedWords.time, "08:00—08:25");
  assert.equal(migratedWords.name, "英语单词");
  assert.equal(migrated.tasks.filter((task) => task.sourceTaskKey === "englishWords").length, 1);
  assert.ok(migrated.tasks.indexOf(migratedWords) < migrated.tasks.indexOf(migratedEnglish));
  assert.equal(migratedEnglish.time, "15:45—17:15");
  assert.equal(migratedEnglish.status, "completed");
  assert.equal(migratedEnglish.manualEdited, true);
  assert.equal(migratedEnglish.description, "我的人工英语安排");
  assert.deepEqual(migratedEnglish.actualResultRefs, ["reading-1"]);
  assert.equal(custom.time, "13:00—13:30");
  assert.equal(custom.description, "保持不变");
});

test("7b. migration preserves an explicitly confirmed AI rolling time", () => {
  const day = plain(core.createDetailedPlanFromSource("2026-07-18", sourceDay()));
  const task722 = day.tasks.find((task) => task.sourceTaskKey === "722");
  task722.time = "08:35—10:25";
  task722.aiPlanned = true;
  task722.studyRole = "main-professional";
  day.template = "ai-rolling-week-v1";
  day.studyLoadProfile = { profileId: "standard", mainSubject: "722" };

  const migrated = plain(core.migrateDetailedPlanWindow({ "2026-07-18": day }, [], "2026-07-18")).dailyPlans["2026-07-18"];
  const migrated722 = migrated.tasks.find((task) => task.sourceTaskKey === "722");
  assert.equal(migrated722.time, "08:35—10:25");
  assert.equal(migrated722.studyRole, "main-professional");
  assert.equal(migrated.studyLoadProfile.mainSubject, "722");
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
  const english = local.tasks.find((task) => task.sourceTaskKey === "english");
  const task722 = local.tasks.find((task) => task.sourceTaskKey === "722");
  const task844 = local.tasks.find((task) => task.sourceTaskKey === "844");
  english.status = "completed";
  task722.status = "in-progress";
  task844.manualEdited = true;
  task844.description = "人工说明";
  const preview = plain(core.buildPlanImportPreview(plan, { "2026-07-18": local }, "2026-07-18"));
  assert.equal(preview.completedConflicts.length, 1);
  assert.equal(preview.inProgressConflicts.length, 1);
  assert.equal(preview.manualEditedConflicts.length, 1);
  assert.equal(preview.result.dailyPlans["2026-07-18"].tasks.find((task) => task.sourceTaskKey === "844").description, "人工说明");
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
  const english = local.tasks.find((task) => task.sourceTaskKey === "english");
  english.taskId = "different";
  english.id = "different";
  const preview = plain(core.buildPlanImportPreview(makePlan(), { "2026-07-18": local }, "2026-07-18"));
  assert.ok(preview.updatedTasks.some((item) => item.importedTask.sourceTaskKey === "english"));
});

test("13. an explicit use-import decision changes content but retains actual status", () => {
  const plan = makePlan();
  const local = core.createDetailedPlanFromSource("2026-07-18", sourceDay("第一轮正式背诵", "-old"));
  local.tasks.find((task) => task.sourceTaskKey === "english").status = "completed";
  const first = plain(core.buildPlanImportPreview(plan, { "2026-07-18": local }, "2026-07-18"));
  const decisions = { [first.completedConflicts[0].id]: "use-import" };
  const second = plain(core.buildPlanImportPreview(plan, { "2026-07-18": local }, "2026-07-18", decisions));
  const english = second.result.dailyPlans["2026-07-18"].tasks.find((task) => task.sourceTaskKey === "english");
  assert.equal(english.description, "english-0");
  assert.equal(english.status, "completed");
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
  const words = day.tasks.find((item) => item.taskId === "plan-english-words");
  assert.equal(words.time, "08:00—08:25");
  assert.equal(words.name, "英语单词");
  assert.equal(words.description.includes("[object Object]"), false);
  assert.equal(words.resultTrackingVersion, undefined);
  const english = day.tasks.find((item) => item.taskId === "plan-english");
  assert.equal(english.time, "15:45—17:15");
  assert.equal(english.name, "英语阅读");
  assert.equal(english.resultTrackingVersion, 1);
  assert.deepEqual(english.subtasks.map((item) => [item.subtaskId, item.required]), [["reading", true]]);
});

test("18. an unreliable name-only candidate enters conflict instead of being overwritten", () => {
  const localDay = { tasks: [{ id: "custom-english", name: "英语阅读", description: "自定义", status: "not-started" }], currentTaskId: "" };
  const preview = plain(core.buildPlanImportPreview(makePlan(), { "2026-07-18": localDay }, "2026-07-18"));
  assert.equal(preview.unmatchedConflicts.length, 1);
  assert.equal(preview.unmatchedConflicts[0].decision, "keep-local");
  assert.equal(preview.result.dailyPlans["2026-07-18"].tasks.find((task) => task.id === "custom-english").description, "自定义");
});

test("19. P1 plan metadata is previewed and preserved without creating business records", () => {
  const plan = makePlan();
  plan.dailyPlans["2026-07-18"].executionMode = "compressed";
  plan.dailyPlans["2026-07-18"].p1Metadata = { dueReviews: ["review-a"], executionMode: "compressed", ankiTask: { enabled: true }, debtSchedule: { priority: "P0" } };
  plan.dailyPlans["2026-07-18"].tasks.english.englishSubtasks = { words: { plannedMinutes: 20 }, reading: { plannedMinutes: 50 } };
  plan.dailyPlans["2026-07-18"].tasks.english.ankiTask = { enabled: true };
  plan.dailyPlans["2026-07-18"].tasks.english.debtSchedule = { priority: "P1" };
  plan.dailyPlans["2026-07-18"].tasks.politics.politicsTarget = { chapter: "第一章", questions: 20 };
  const before = JSON.stringify(plan);
  const preview = plain(core.buildPlanImportPreview(plan, {}, "2026-07-18"));
  const day = preview.result.dailyPlans["2026-07-18"];
  assert.deepEqual(preview.p1MetadataChanges, ["2026-07-18"]);
  assert.deepEqual(day.p1Metadata, { dueReviews: ["review-a"] });
  assert.deepEqual(day.tasks.find((task) => task.sourceTaskKey === "english").englishSubtasks, { words: { plannedMinutes: 20 }, reading: { plannedMinutes: 50 } });
  assert.equal(Object.prototype.hasOwnProperty.call(day, "executionMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(day.tasks.find((task) => task.sourceTaskKey === "english"), "ankiTask"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(day.tasks.find((task) => task.sourceTaskKey === "english"), "debtSchedule"), false);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(Object.prototype.hasOwnProperty.call(preview.result, "reviewQueue"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(preview.result, "studyDebtQueue"), false);
});

test("20. current time suggests only an unfinished scheduled task", () => {
  const tasks = [
    { id: "english", time: "08:00—10:00", status: "not-started" },
    { id: "722", time: "10:15—12:35", status: "not-started" },
    { id: "844", time: "14:00—16:20", status: "completed" },
  ];
  assert.equal(core.findPlanTaskForMinutes(tasks, 8 * 60 + 30).id, "english");
  assert.equal(core.findPlanTaskForMinutes(tasks, 10 * 60 + 15).id, "722");
  assert.equal(core.findPlanTaskForMinutes(tasks, 10 * 60), null);
  assert.equal(core.findPlanTaskForMinutes(tasks, 14 * 60 + 30), null);
});

test("21. schedule suggestion supports midnight ranges and rejects invalid time", () => {
  const tasks = [{ id: "late", time: "23:30—00:30", status: "not-started" }, { id: "bad", time: "自定", status: "not-started" }];
  assert.equal(core.findPlanTaskForMinutes(tasks, 23 * 60 + 45).id, "late");
  assert.equal(core.findPlanTaskForMinutes(tasks, 15).id, "late");
  assert.equal(core.findPlanTaskForMinutes(tasks, -1), null);
  assert.equal(core.findPlanTaskForMinutes(tasks, 1440), null);
});

test("22. starting focus activates only an unfinished plan task", () => {
  const plan = {
    currentTaskId: "",
    tasks: [
      { id: "722", status: "not-started", completed: false },
      { id: "done", status: "completed", completed: true },
      { id: "skipped", status: "skipped", completed: false },
    ],
  };
  assert.equal(core.activatePlanTaskForFocus(plan, "722").changed, true);
  assert.equal(plan.currentTaskId, "722");
  assert.equal(plan.tasks[0].status, "in-progress");
  assert.equal(core.activatePlanTaskForFocus(plan, "722").changed, false);
  assert.equal(core.activatePlanTaskForFocus(plan, "done").changed, false);
  assert.equal(core.activatePlanTaskForFocus(plan, "skipped").changed, false);
  assert.equal(core.activatePlanTaskForFocus(plan, "__unassigned__").task, null);
  assert.equal(plan.currentTaskId, "722");
});

test("23. terminal status releases only that current selection", () => {
  const plan = {
    currentTaskId: "722",
    tasks: [
      { id: "722", status: "completed", completed: true },
      { id: "844", status: "not-started", completed: false },
    ],
  };
  assert.equal(core.clearTerminalCurrentPlanTask(plan, "722"), true);
  assert.equal(plan.currentTaskId, "");

  plan.currentTaskId = "844";
  assert.equal(core.clearTerminalCurrentPlanTask(plan, "722"), false);
  assert.equal(core.clearTerminalCurrentPlanTask(plan, "844"), false);
  assert.equal(plan.currentTaskId, "844");

  plan.tasks[1].status = "skipped";
  assert.equal(core.clearTerminalCurrentPlanTask(plan, "844"), true);
  assert.equal(plan.currentTaskId, "");
});

test("24. explicit unassigned selection clears a stale current task", () => {
  const plan = { currentTaskId: "722", tasks: [] };
  assert.equal(core.clearPlanCurrentTask(plan), true);
  assert.equal(plan.currentTaskId, "");
  assert.equal(core.clearPlanCurrentTask(plan), false);
  assert.equal(core.clearPlanCurrentTask(null), false);
});

test("25. selecting a current task never starts it before focus begins", () => {
  const plan = { currentTaskId: "", tasks: [{ id: "722", status: "not-started", completed: false }] };
  const selected = core.selectPlanCurrentTask(plan, "722");
  assert.equal(selected.changed, true);
  assert.equal(plan.currentTaskId, "722");
  assert.equal(plan.tasks[0].status, "not-started");
  assert.equal(plan.tasks[0].completed, false);
  assert.equal(core.selectPlanCurrentTask(plan, "722").changed, false);
  assert.equal(core.selectPlanCurrentTask(plan, "missing").task, null);
});

test("26. cockpit keeps an active task but never promotes an off-window task", () => {
  const tasks = [
    { id: "wake", time: "07:20—07:40", counted: false, status: "not-started" },
    { id: "english", time: "08:00—10:00", counted: true, status: "completed", completed: true },
    { id: "722", time: "10:15—12:35", counted: true, status: "in-progress", completed: false },
    { id: "844", time: "14:00—16:20", counted: true, status: "not-started", completed: false },
    { id: "review", time: "16:20—17:00", counted: true, category: "rollingReview", status: "not-started", completed: false },
    { id: "exercise", time: "17:10—18:10", counted: false, exercise: true, status: "not-started" },
  ];
  assert.equal(core.findNextExecutablePlanTask(tasks, "844", 10 * 60 + 30).id, "844");
  assert.equal(core.findNextExecutablePlanTask(tasks, "", 10 * 60 + 30).id, "722");
  tasks[2].status = "completed";
  tasks[2].completed = true;
  assert.equal(core.findNextExecutablePlanTask(tasks, "722", 14 * 60 + 30).id, "844");
  tasks[3].status = "completed";
  tasks[3].completed = true;
  assert.equal(core.findNextExecutablePlanTask(tasks, "review", 16 * 60 + 30), null);
  assert.equal(core.findNextScheduledPlanTask(tasks, 16 * 60 + 30).id, "exercise");
  assert.equal(core.findNextExecutablePlanTask(tasks, "", 13 * 60), null);
  assert.equal(core.findNextScheduledPlanTask(tasks, 13 * 60).id, "exercise");
});

test("27. safeguard keeps one professional task and advances only on formal completion", () => {
  const tasks = [
    { id: "english", category: "english", status: "completed", completed: true },
    { id: "722", category: "maYuan", status: "not-started", completed: false },
    { id: "844", category: "maHistory", status: "in-progress", completed: false },
    { id: "politics", category: "politics", status: "not-started", completed: false },
  ];
  const steps = core.buildSafeguardSequence(tasks, {
    professionalTaskId: "844",
    initialReviewRemaining: 4,
    initialReviewCompleted: 1,
    reviewCompletedCount: 1,
    closeoutSaved: false,
  });
  assert.deepEqual(plain(steps.map((step) => [step.key, step.taskId || "", step.completed])), [
    ["professional", "844", false],
    ["english", "english", true],
    ["politics", "politics", false],
    ["closeout", "", false],
  ]);
});

test("28. safeguard ignores external review counters and ends with closeout", () => {
  const tasks = [{ id: "722", category: "maYuan", status: "completed", completed: true }];
  const pending = core.buildSafeguardSequence(tasks, {
    professionalTaskId: "722",
    initialReviewRemaining: 3,
    initialReviewCompleted: 2,
    reviewCompletedCount: 2,
    closeoutSaved: false,
  });
  const completed = core.buildSafeguardSequence(tasks, {
    professionalTaskId: "722",
    initialReviewRemaining: 3,
    initialReviewCompleted: 2,
    reviewCompletedCount: 3,
    closeoutSaved: true,
  });
  assert.equal(pending.some((step) => step.key === "review"), false);
  assert.equal(completed.some((step) => step.key === "review"), false);
  assert.equal(pending.find((step) => step.key === "closeout").completed, false);
  assert.equal(completed.find((step) => step.key === "closeout").completed, true);
});

test("29. daily handoff uses the user's saved tomorrow action without rewriting it", () => {
  const candidate = core.buildDailyHandoffCandidate({
    todayTasks: [
      { id: "english", category: "english", counted: true, status: "not-started" },
      { id: "844", category: "maHistory", counted: true, status: "not-started" },
    ],
    tomorrowPriority: "先闭卷重写844理论演进线",
    professionalBreakpoints: [{ subject: "722", nextStart: "核对真理与价值", updatedAt: "2026-07-29T20:00:00" }],
  });
  assert.deepEqual(plain(candidate), {
    taskId: "844",
    action: "先闭卷重写844理论演进线",
    source: "昨日收工记录",
  });
});

test("30. daily handoff falls back to the latest professional breakpoint then unfinished task", () => {
  const todayTasks = [
    { id: "722", category: "maYuan", counted: true, status: "not-started" },
    { id: "844", category: "maHistory", counted: true, status: "not-started" },
  ];
  const professional = core.buildDailyHandoffCandidate({
    todayTasks,
    professionalBreakpoints: [
      { subject: "722", nextStart: "核对真理与价值", updatedAt: "2026-07-29T18:00:00" },
      { subject: "844", nextStart: "重构人物著作命题链", updatedAt: "2026-07-29T21:00:00" },
    ],
  });
  const unfinished = core.buildDailyHandoffCandidate({
    todayTasks,
    yesterdayTasks: [{ name: "722 马克思主义基本原理", category: "maYuan", counted: true, status: "in-progress" }],
  });
  assert.equal(professional.taskId, "844");
  assert.equal(professional.action, "重构人物著作命题链");
  assert.equal(unfinished.taskId, "722");
  assert.equal(unfinished.source, "昨日未完成任务");
  assert.equal(core.buildDailyHandoffCandidate({ todayTasks }), null);
  assert.equal(core.buildDailyHandoffCandidate({ todayTasks, tomorrowPriority: "未记录" }), null);
  assert.equal(core.buildDailyHandoffCandidate({ todayTasks, tomorrowPriority: "处理生活杂事" }), null);
  assert.equal(core.buildDailyHandoffCandidate({
    todayTasks: [...todayTasks, { id: "review", category: "rollingReview", counted: true, status: "not-started" }],
    tomorrowPriority: "先处理最高优先级复盘",
    yesterdayTasks: [{ name: "滚动复盘", category: "rollingReview", counted: true, status: "in-progress" }],
  }), null);
});

test("30a. daily handoff waits until its own scheduled time window", () => {
  const options = {
    todayTasks: [
      { id: "722", category: "maYuan", time: "08:35—10:35", counted: true, status: "not-started" },
      { id: "844", category: "maHistory", time: "10:50—12:20", counted: true, status: "not-started" },
    ],
    tomorrowPriority: "先闭卷重写844理论演进线",
  };
  assert.equal(core.buildScheduledDailyHandoffCandidate(options, 8 * 60 + 40), null);
  assert.equal(core.buildScheduledDailyHandoffCandidate(options, 10 * 60 + 49), null);
  assert.equal(core.buildScheduledDailyHandoffCandidate(options, 10 * 60 + 50).taskId, "844");
  assert.equal(core.buildScheduledDailyHandoffCandidate(options, 12 * 60 + 20), null);
});

test("31. latest professional breakpoint stays subject-specific and ignores future records", () => {
  const store = {
    days: {
      "2026-07-30": {
        722: { units: [{ unitId: "old-722", nextStart: "旧 722 起点", updatedAt: "2026-07-30T20:00:00" }] },
        844: { units: [{ unitId: "only-844", nextStart: "844 起点", updatedAt: "2026-07-30T21:00:00" }] },
      },
      "2026-07-31": {
        722: { units: [
          { unitId: "early-722", nextStart: "较早 722 起点", updatedAt: "2026-07-31T18:00:00" },
          { unitId: "latest-722", nextStart: "最近 722 起点", updatedAt: "2026-07-31T22:00:00" },
        ] },
      },
      "2026-08-02": {
        722: { units: [{ unitId: "future-722", nextStart: "未来起点", updatedAt: "2026-08-02T20:00:00" }] },
      },
    },
  };
  const before = JSON.stringify(store);
  assert.deepEqual(plain(core.findLatestProfessionalBreakpoint(store, "722", "2026-08-01")), {
    subject: "722",
    nextStart: "最近 722 起点",
    date: "2026-07-31",
    unitId: "latest-722",
    updatedAt: "2026-07-31T22:00:00",
  });
  assert.equal(core.findLatestProfessionalBreakpoint(store, "844", "2026-08-01").nextStart, "844 起点");
  assert.equal(core.findLatestProfessionalBreakpoint(store, "english", "2026-08-01"), null);
  assert.equal(core.findLatestProfessionalBreakpoint({}, "722", "2026-08-01"), null);
  assert.equal(JSON.stringify(store), before);
});

test("32. latest execution breakpoint accepts named fields and ignores future or placeholder actions", () => {
  const records = [
    { recordId: "old", date: "2026-07-30", nextStart: "重做第三题", updatedAt: "2026-07-30T10:00:00" },
    { recordId: "placeholder", date: "2026-07-31", nextStart: "未记录", updatedAt: "2026-07-31T20:00:00" },
    { recordId: "earlier", date: "2026-07-31", nextAction: "先列三级提纲", updatedAt: "2026-07-31T18:00:00" },
    { recordId: "latest", date: "2026-07-31", nextAction: "先重写核心段", updatedAt: "2026-07-31T22:00:00" },
    { recordId: "future", date: "2026-08-02", nextAction: "未来动作", updatedAt: "2026-08-02T10:00:00" },
  ];
  const before = JSON.stringify(records);
  assert.deepEqual(plain(core.findLatestExecutionBreakpoint(records, ["nextStart", "nextAction"], "2026-08-01")), {
    action: "先重写核心段",
    date: "2026-07-31",
    field: "nextAction",
    recordId: "latest",
    updatedAt: "2026-07-31T22:00:00",
  });
  assert.equal(core.findLatestExecutionBreakpoint([{ date: "2026-07-31", nextStart: "无" }], "nextStart", "2026-08-01"), null);
  assert.equal(JSON.stringify(records), before);
});

test("33. output subject inference is explicit and fails closed on mixed or generic tasks", () => {
  assert.equal(core.inferPlanOutputSubject({ category: "output", description: "周三：722完整论述1道" }), "722");
  assert.equal(core.inferPlanOutputSubject({ category: "output", description: "周六：844完整论述1道" }), "844");
  assert.equal(core.inferPlanOutputSubject({ category: "output", outputSubject: "722", description: "综合训练" }), "722");
  assert.equal(core.inferPlanOutputSubject({ category: "output", description: "722与844跨章节调用" }), "");
  assert.equal(core.inferPlanOutputSubject({ category: "output", description: "周总结与错漏题重构" }), "");
  assert.equal(core.inferPlanOutputSubject(null), "");
});

test("34. detailed plan retains an explicit nextStart without turning completion criteria into it", () => {
  const day = sourceDay();
  day.tasks.english.nextStart = "先做2010年Text 2第一题定位";
  const plan = plain(core.createDetailedPlanFromSource("2026-08-01", day, [
    { module: "英语", minimumOutput: "完成阅读验收" },
  ]));
  const english = plan.tasks.find((task) => task.sourceTaskKey === "english");
  assert.equal(english.nextStart, "先做2010年Text 2第一题定位");
  assert.equal(english.completionCriteria, "完成阅读验收");
  assert.notEqual(english.nextStart, english.completionCriteria);
});
