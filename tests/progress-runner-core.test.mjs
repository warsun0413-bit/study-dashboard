import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const coreSource = fs.readFileSync(new URL("../js/progress-runner-core.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(`${coreSource}
globalThis.runnerModel = buildProgressRunnerModel;
globalThis.runnerDay = progressRunnerDayFacts;
globalThis.runnerRange = progressRunnerPeriodRange;
globalThis.runnerPhaseTasks = buildProgressRunnerPhaseTasks;
globalThis.updatePhaseTasks = updateProgressRunnerPhaseChapterTasks;`, context);

const plain = (value) => JSON.parse(JSON.stringify(value));
const completedPlan = () => ({ tasks: [{ counted: true, time: "08:00—10:00", status: "completed" }] });
const baselineDays = {
  "2026-07-30": { plan: completedPlan(), effectiveSeconds: 9 * 3600, targetSeconds: 9 * 3600, historySaved: true, formalCount: 1 },
  "2026-07-31": { plan: completedPlan(), effectiveSeconds: 9 * 3600, targetSeconds: 9 * 3600, historySaved: true, formalCount: 1 },
  "2026-08-01": { plan: completedPlan(), effectiveSeconds: 9 * 3600, targetSeconds: 9 * 3600, historySaved: true, formalCount: 1 },
};

test("daily model uses task, time and due-review facts without counting life tasks", () => {
  const day = plain(context.runnerDay({
    plan: { tasks: [
      { counted: true, time: "08:00—10:00", status: "completed" },
      { counted: true, time: "10:00—12:00", status: "in-progress" },
      { counted: false, time: "12:00—13:00", status: "completed" },
      { counted: true, exercise: true, status: "completed" },
    ] },
    effectiveSeconds: 3 * 3600,
    targetSeconds: 9 * 3600,
    reviewDue: 2,
    reviewCompleted: 1,
  }, { nowMinutes: 12 * 60 }));
  assert.equal(day.taskPlanned, 2);
  assert.equal(day.taskCompleted, 1.25);
  assert.equal(day.reviewRate, 0.5);
  assert.ok(day.actual > 0 && day.actual < 1);
});

test("daily review progress uses the bounded budget and waits for its scheduled block", () => {
  const input = {
    plan: { tasks: [{ category: "rollingReview", time: "20:40—21:00", counted: true, status: "not-started" }] },
    targetSeconds: 9 * 3600,
    reviewDue: 20,
    reviewCompleted: 0,
    reviewBudgetDue: 4,
    reviewBudgetCompleted: 1,
    reviewBacklog: 16,
  };
  const beforeBlock = plain(context.runnerDay(input, { nowMinutes: 10 * 60, useReviewBudget: true }));
  assert.equal(beforeBlock.reviewDue, 4);
  assert.equal(beforeBlock.reviewCompleted, 1);
  assert.equal(beforeBlock.reviewBacklog, 16);
  assert.equal(beforeBlock.reviewMode, "daily-budget");
  assert.equal(beforeBlock.reviewExpected, 0);
  assert.equal(beforeBlock.taskPlanned, 0);
  const duringBlock = plain(context.runnerDay(input, { nowMinutes: 20 * 60 + 50, useReviewBudget: true }));
  assert.equal(duringBlock.reviewExpected, 0.5);
});

test("daily view uses review budget while weekly view preserves raw due facts", () => {
  const input = {
    dateKey: "2026-08-05", nowMinutes: 21 * 60, firstDataDate: "2026-08-05",
    days: {
      "2026-08-05": {
        plan: { tasks: [{ category: "rollingReview", time: "20:40—21:00", counted: true, status: "not-started" }] },
        targetSeconds: 9 * 3600,
        reviewDue: 20, reviewCompleted: 0,
        reviewBudgetDue: 4, reviewBudgetCompleted: 0, reviewBacklog: 16,
      },
    },
  };
  const daily = plain(context.runnerModel(input, "daily"));
  const weekly = plain(context.runnerModel(input, "weekly"));
  assert.equal(daily.reviewDue, 4);
  assert.equal(daily.reviewBacklog, 16);
  assert.equal(daily.reviewMode, "daily-budget");
  assert.equal(weekly.reviewDue, 20);
  assert.equal(weekly.reviewBacklog, 0);
  assert.equal(weekly.reviewMode, "raw-due");
});

test("daily view uses the execution target while weekly view preserves the plan target", () => {
  const days = Object.fromEntries([
    "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09",
  ].map((date) => [date, { plan: completedPlan(), effectiveSeconds: 0, targetSeconds: 9 * 3600 }]));
  days["2026-08-05"] = {
    plan: completedPlan(), effectiveSeconds: 3 * 3600,
    targetSeconds: 9 * 3600, executionTargetSeconds: 3 * 3600,
  };
  const input = {
    dateKey: "2026-08-05", nowMinutes: 12 * 60, firstDataDate: "2026-08-03", days,
  };
  const daily = plain(context.runnerModel(input, "daily"));
  const weekly = plain(context.runnerModel(input, "weekly"));
  assert.equal(daily.targetSeconds, 3 * 3600);
  assert.equal(daily.targetMode, "execution");
  assert.equal(daily.timeActual, 1);
  assert.equal(weekly.targetSeconds, 7 * 9 * 3600);
  assert.equal(weekly.targetMode, "plan");
  assert.equal(weekly.timeActual, 1 / 21);
});

test("pace is behind only after at least three personal evidence days", () => {
  const model = plain(context.runnerModel({
    dateKey: "2026-08-02", nowMinutes: 12 * 60, firstDataDate: "2026-07-30",
    days: {
      ...baselineDays,
      "2026-08-02": {
        plan: { tasks: [
          { counted: true, time: "08:00—10:00", status: "completed" },
          { counted: true, time: "10:00—12:00", status: "not-started" },
        ] },
        effectiveSeconds: 4.5 * 3600, targetSeconds: 9 * 3600,
      },
    },
  }, "daily"));
  assert.equal(model.baselineDays, 4);
  assert.equal(model.status, "behind");
  assert.match(model.reason, /正式任务推进偏少/);
});

test("fewer than three evidence days reports data accumulation instead of judging speed", () => {
  const model = plain(context.runnerModel({
    dateKey: "2026-08-02", nowMinutes: 18 * 60, firstDataDate: "2026-08-02",
    days: { "2026-08-02": { plan: completedPlan(), effectiveSeconds: 3600, targetSeconds: 9 * 3600 } },
  }, "daily"));
  assert.equal(model.status, "insufficient");
  assert.match(model.reason, /再积累2个有效学习日/);
});

test("weekly and monthly tracks use calendar ranges and cumulative expected position", () => {
  const days = { ...baselineDays };
  ["2026-08-03", "2026-08-04", "2026-08-05"].forEach((date) => {
    days[date] = { plan: completedPlan(), effectiveSeconds: 9 * 3600, targetSeconds: 9 * 3600, historySaved: true, formalCount: 1 };
  });
  const input = { dateKey: "2026-08-05", nowMinutes: 12 * 60, firstDataDate: "2026-07-30", days };
  const weekly = plain(context.runnerModel(input, "weekly"));
  const monthly = plain(context.runnerModel(input, "monthly"));
  assert.deepEqual(weekly.range, { start: "2026-08-03", end: "2026-08-09" });
  assert.deepEqual(monthly.range, { start: "2026-08-01", end: "2026-08-31" });
  assert.equal(monthly.gapPercent, monthly.actualPercent - monthly.expectedPercent);
  assert.ok(weekly.expectedPercent > monthly.expectedPercent);
  assert.ok(weekly.actualPercent > monthly.actualPercent);
});

test("runner assets are loaded in the page and current cache", () => {
  assert.match(indexSource, /id="studyProgressRunner"/);
  assert.match(indexSource, /id="progressRunnerPhaseTasks"/);
  assert.match(indexSource, /id="progressRunnerPhaseEditor"/);
  assert.match(indexSource, /正式任务（等效完成）/);
  assert.match(indexSource, /progress-runner-core\.js\?v=execution-target-v126/);
  assert.match(indexSource, /progress-runner\.js\?v=execution-target-v126/);
  assert.match(serviceWorkerSource, /study-dashboard-execution-brief-v141/);
  assert.match(serviceWorkerSource, /progress-runner-core\.js\?v=execution-target-v126/);
});

test("chapter editor updates only the active phase without mutating existing templates", () => {
  const templates = [
    { phaseId: "past", startDate: "2026-07-01", endDate: "2026-07-31", chapterTasks: { "722": "第一章" } },
    { phaseId: "current", startDate: "2026-08-01", endDate: "2026-08-31", taskTemplates: { english: "阅读1篇" }, chapterTasks: { politics: "旧政治范围" } },
  ];
  const before = JSON.stringify(templates);
  const updated = plain(context.updatePhaseTasks(templates, "2026-08-04", { "722": " 第二章 真理与价值 ", "844": "第三章 青年马克思", politics: "" }));
  assert.equal(updated.changed, true);
  assert.equal(updated.templates[0].chapterTasks["722"], "第一章");
  assert.deepEqual(updated.templates[1].chapterTasks, { politics: "旧政治范围", "722": "第二章 真理与价值", "844": "第三章 青年马克思" });
  assert.equal(updated.templates[1].taskTemplates.english, "阅读1篇");
  assert.equal(JSON.stringify(templates), before);
  assert.match(plain(context.updatePhaseTasks(templates, "2026-08-04", {})).error, /至少填写一项/);
  assert.match(plain(context.updatePhaseTasks(templates, "2027-01-01", { "722": "第一章" })).error, /没有可编辑/);
});

test("stage chapter tasks preserve exact plan text and expose unspecified chapters", () => {
  const configured = plain(context.runnerPhaseTasks({
    current: {
      phaseName: "强化阶段", startDate: "2026-08-01", endDate: "2026-08-31",
      chapterTasks: { "722": "第二章 真理与价值", "844": "第三章 青年马克思" },
      taskTemplates: { politics: "强化25分钟＋选择题", english: "真题阅读1篇" },
      completionCriteria: { "722": "闭卷写出三级框架" },
    },
  }));
  assert.equal(configured.tasks[0].text, "第二章 真理与价值");
  assert.equal(configured.tasks[0].criterion, "闭卷写出三级框架");
  assert.equal(configured.tasks[0].concrete, true);
  assert.equal(configured.tasks[2].concrete, false);
  assert.match(configured.meta, /强化阶段.*2026-08-01 至 2026-08-31/);
  const missing = plain(context.runnerPhaseTasks({ current: { phaseName: "未写章节", taskTemplates: { "722": "第一轮正式背诵" } } }));
  assert.equal(missing.configured, false);
  assert.equal(missing.tasks[0].text, "第一轮正式背诵");
  assert.equal(missing.tasks[0].concrete, false);
  assert.deepEqual(plain(context.runnerPhaseTasks({})), { configured: false, meta: "当前日期没有对应的阶段计划。", tasks: [] });
});
