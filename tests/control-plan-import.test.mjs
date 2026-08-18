import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const planSource = fs.readFileSync(new URL("../js/nankai-control-plan-2026-08-06.js", import.meta.url), "utf8");
const coreSource = fs.readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8");
const safetySource = fs.readFileSync(new URL("../js/data-safety.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

const planContext = vm.createContext({ console });
vm.runInContext(`${planSource}\nglobalThis.controlPlan = NANKAI_CONTROL_PLAN_20260806;`, planContext);
const plan = JSON.parse(JSON.stringify(planContext.controlPlan));

const safetyContext = vm.createContext({ console });
vm.runInContext(`${safetySource}\nglobalThis.validateControlPlan = validateNankaiControlPlanV3;`, safetyContext);

const coreContext = vm.createContext({ console, Date, Intl });
vm.runInContext(`${coreSource}\nglobalThis.previewPlan = buildPlanImportPreview; globalThis.phaseTemplates = buildPhaseTemplatesFromImportedPlan;`, coreContext);

test("built-in control plan is the exact supported DOCX-derived seven-day source", () => {
  assert.doesNotThrow(() => safetyContext.validateControlPlan(plan));
  assert.equal(plan.planType, "nankai-marxism-control-plan");
  assert.equal(plan.schemaVersion, 3);
  assert.deepEqual(Object.keys(plan.dailyPlans).sort(), [
    "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12",
  ]);
  assert.match(plan.dailyPlans["2026-08-06"].tasks["844"].description, /苏联社会主义模式的形成/);
  assert.match(plan.dailyPlans["2026-08-06"].tasks["722"].description, /资本积累三问补测/);
  assert.match(plan.dailyPlans["2026-08-08"].tasks["844"].description, /按教材确认下一标题/);
  assert.match(plan.dailyPlans["2026-08-12"].tasks["722"].description, /阶段验收/);
  assert.equal(plan.sourcesAndAssumptions.some((item) => item.includes("后续章节标题必须")), true);
  assert.equal(plan.fixedSchedule.find((item) => item.module === "英语词汇").time, "08:00—08:25");
  assert.equal(plan.fixedSchedule.find((item) => item.module === "英语").time, "15:45—17:15");
});

test("safe preview imports future detail and protects manual or executed local tasks", () => {
  const local = coreContext.previewPlan(plan, {}, "2026-08-05").result.dailyPlans["2026-08-06"];
  assert.equal(local.sourcePlanType, "nankai-marxism-control-plan");
  assert.equal(local.sourceSchemaVersion, 3);
  assert.equal(local.sourcePlanId, "nankai-control-2026-08-06");
  assert.deepEqual(Object.fromEntries(local.tasks.map((task) => [task.sourceTaskKey, task.time])), {
    englishWords: "08:00—08:25",
    english: "15:45—17:15", "722": "08:35—10:35", "844": "10:50—12:20",
    originalTextOrReview: "20:40—21:00", training: "17:30—18:30",
    politics: "14:00—15:30", outputOrMock: "19:00—20:30",
  });
  const localWords = local.tasks.find((task) => task.sourceTaskKey === "englishWords");
  const localEnglish = local.tasks.find((task) => task.sourceTaskKey === "english");
  assert.equal(localWords.name, "英语单词");
  assert.equal(localWords.description.includes("[object Object]"), false);
  assert.equal(localWords.resultTrackingVersion, undefined);
  assert.equal(localEnglish.name, "英语阅读");
  assert.equal(localEnglish.resultTrackingVersion, 1);
  assert.equal(localEnglish.subtasks.map((task) => task.subtaskId).join(","), "reading");
  const local722 = local.tasks.find((task) => task.sourceTaskKey === "722");
  local722.manualEdited = true;
  local722.description = "我的722手动安排";
  const local844 = local.tasks.find((task) => task.sourceTaskKey === "844");
  local844.status = "completed";
  const preview = JSON.parse(JSON.stringify(coreContext.previewPlan(plan, { "2026-08-06": local }, "2026-08-05")));
  assert.equal(preview.manualEditedConflicts.length, 1);
  assert.equal(preview.completedConflicts.length, 1);
  assert.equal(preview.result.dailyPlans["2026-08-06"].tasks.find((task) => task.sourceTaskKey === "722").description, "我的722手动安排");
  assert.equal(preview.result.dailyPlans["2026-08-06"].tasks.find((task) => task.sourceTaskKey === "844").status, "completed");
  assert.equal(preview.skippedHistoryDates.length, 0);
});

test("the August 12 acceptance day remains recoverable as an exact phase template", () => {
  const templates = JSON.parse(JSON.stringify(coreContext.phaseTemplates(plan)));
  const acceptance = templates.find((phase) => phase.startDate === "2026-08-12");
  assert.equal(acceptance.phaseName, "7天阶段验收");
  assert.match(acceptance.taskTemplates["722"], /复核第四章D3结果/);
  assert.equal(acceptance.chapterTasks["844"], "苏联模式封口复核＋准确停点之后实际推进范围重构。");
});

test("built-in import is visible, wired through preview, and cached", () => {
  assert.match(indexSource, /id="importControlPlanBtn"/);
  assert.match(indexSource, /nankai-control-plan-2026-08-06\.js\?v=control-plan-import-v105/);
  assert.match(indexSource, /plan-window-core\.js\?v=next-task-order-v146/);
  assert.match(indexSource, /data-safety\.js\?v=admission-joint-v114/);
  assert.match(indexSource, /app\.js\?v=safe-date-rollover-v153/);
  assert.match(appSource, /importControlPlanBtn[\s\S]*importBuiltInNankaiControlPlan/);
  assert.match(safetySource, /importNankaiPlan\(NANKAI_CONTROL_PLAN_20260806\)/);
  assert.match(safetySource, /\n\s+detailedPlanDates,/);
  assert.match(safetySource, /typeof renderAiTomorrowPlanPreview === "function"/);
  assert.match(serviceWorkerSource, /study-dashboard-safe-date-rollover-v153/);
  assert.match(serviceWorkerSource, /data-safety\.js\?v=admission-joint-v114/);
  assert.match(serviceWorkerSource, /nankai-control-plan-2026-08-06\.js\?v=control-plan-import-v105/);
  assert.match(serviceWorkerSource, /plan-window-core\.js\?v=next-task-order-v146/);
  assert.match(serviceWorkerSource, /tasks\.js\?v=safe-date-rollover-v153/);
});
