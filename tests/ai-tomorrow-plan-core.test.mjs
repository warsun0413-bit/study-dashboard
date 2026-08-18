import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const coreSource = fs.readFileSync(new URL("../js/ai-tomorrow-plan-core.js", import.meta.url), "utf8");
const reviewSource = fs.readFileSync(new URL("../js/review.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const launcherSource = fs.readFileSync(new URL("../start-dashboard.bat", import.meta.url), "utf8");
const launcherPreflightSource = fs.readFileSync(new URL("../start-dashboard-preflight.ps1", import.meta.url), "utf8");
const context = vm.createContext({ console, Date });
vm.runInContext(`${coreSource}
globalThis.normalizePlan = normalizeAiTomorrowPlan;
globalThis.mergePlan = mergeAiTomorrowPlan;
globalThis.availableTasks = getAiTomorrowAvailableTasks;
globalThis.taskCandidates = buildAiTomorrowTaskCandidates;
globalThis.planSourceStatus = getAiTomorrowPlanSourceStatus;
globalThis.summarizeExecution = summarizeAiPlanExecution;
globalThis.recentExecution = buildRecentAiPlanExecution;
`, context);

const basePlan = {
  date: "2026-08-03",
  tasks: [
    { id: "english", sourceTaskKey: "english", name: "英语", category: "english", status: "not-started", counted: true },
    { id: "722", sourceTaskKey: "722", name: "722", category: "maYuan", status: "not-started", counted: true },
    { id: "844", sourceTaskKey: "844", name: "844", category: "maHistory", status: "not-started", counted: true },
    { id: "review", sourceTaskKey: "originalTextOrReview", name: "复盘", category: "rollingReview", status: "not-started", counted: true },
    { id: "custom", name: "自定义保留", category: "custom", status: "not-started", manualEdited: true },
  ],
};

const validPlan = {
  schemaVersion: 1,
  date: "2026-08-03",
  summary: "按准确断点推进",
  tasks: [
    { sourceTaskKey: "english", time: "08:00-09:30", description: "完成阅读", nextStart: "先读题干", completionCriteria: "保存错因", fallback: "完成证据定位" },
    { sourceTaskKey: "722", time: "10:00—12:00", description: "推进真理观", nextStart: "核对真理与价值", completionCriteria: "纸上重构", fallback: "写出一级框架" },
    { sourceTaskKey: "844", time: "14:00—16:00", description: "推进青年马克思", nextStart: "重构人物著作链", completionCriteria: "保存命题链", fallback: "写出人物著作" },
    { sourceTaskKey: "originalTextOrReview", time: "16:20—17:00", description: "完成到期复盘", nextStart: "先闭卷复述", completionCriteria: "保存闭卷证据", fallback: "完成一项" },
  ],
};

test("legacy structured task text is projected without object-string leakage", () => {
  const [task] = context.availableTasks({ tasks: [{
    id: "722",
    sourceTaskKey: "722",
    category: "maYuan",
    counted: true,
    status: "not-started",
    name: "722",
    description: { description: "推进真理观" },
    minimum: { minimumOutput: "保存闭卷框架" },
    nextStart: { action: "核对真理与价值" },
  }] });
  assert.equal(task.description, "推进真理观");
  assert.equal(task.completionCriteria, "保存闭卷框架");
  assert.equal(task.nextStart, "核对真理与价值");
  assert.doesNotMatch(JSON.stringify(task), /\[object Object\]/);
  const [placeholder] = context.availableTasks({ tasks: [{
    id: "844", sourceTaskKey: "844", category: "maHistory", counted: true,
    name: "844", description: "[object Object]", minimum: "[object Object]",
  }] });
  assert.equal(placeholder.description, "");
  assert.equal(placeholder.completionCriteria, "");
});

test("AI tomorrow plan accepts only available non-overlapping evidence tasks", () => {
  const available = context.availableTasks(basePlan).map((item) => ({ ...item }));
  const normalized = context.normalizePlan(validPlan, { expectedDate: "2026-08-03", availableTasks: available, hasDueReviews: true });
  assert.equal(normalized.tasks.length, 4);
  assert.equal(normalized.tasks[0].time, "08:00—09:30");
  assert.equal(normalized.tasks[1].nextStart, "核对真理与价值");
});

test("today unfinished work becomes the required carryover while completed work keeps the original plan", () => {
  const todayRecord = {
    tasks: [
      { sourceTaskKey: "722", status: "in-progress", description: "完成第四章D1闭卷重构", nextStart: "先默写第四章一级框架", completionCriteria: "保存闭卷重构和遗漏" },
      { sourceTaskKey: "844", status: "completed", completed: true, description: "已完成的844旧任务" },
    ],
  };
  const tomorrowPlan = structuredClone(basePlan);
  tomorrowPlan.tasks.forEach((task) => {
    if (task.sourceTaskKey) {
      task.description = `${task.name}原计划`;
      task.nextStart = `${task.name}原计划起点`;
      task.completionCriteria = `${task.name}完成证据`;
    }
  });
  const candidates = context.taskCandidates(tomorrowPlan, todayRecord);
  const task722 = candidates.find((task) => task.sourceTaskKey === "722");
  const task844 = candidates.find((task) => task.sourceTaskKey === "844");
  assert.equal(task722.requiredBasis, "today-carryover");
  assert.equal(task722.planCandidates.find((item) => item.basis === "today-carryover").nextStart, "先默写第四章一级框架");
  assert.equal(task844.requiredBasis, "original-plan");
  assert.equal(task844.planCandidates.length, 1);

  const constrainedPlan = structuredClone(validPlan);
  constrainedPlan.tasks.forEach((task) => {
    const available = candidates.find((item) => item.sourceTaskKey === task.sourceTaskKey);
    const selected = available.planCandidates.find((item) => item.basis === available.requiredBasis);
    Object.assign(task, selected);
  });
  const normalized = context.normalizePlan(constrainedPlan, {
    expectedDate: "2026-08-03",
    availableTasks: candidates,
    hasDueReviews: true,
  });
  assert.equal(normalized.tasks.find((task) => task.sourceTaskKey === "722").basis, "today-carryover");

  const rewritten = structuredClone(constrainedPlan);
  rewritten.tasks.find((task) => task.sourceTaskKey === "722").description = "AI虚构的新章节";
  assert.throws(() => context.normalizePlan(rewritten, {
    expectedDate: "2026-08-03",
    availableTasks: candidates,
    hasDueReviews: true,
  }), /改写了原计划或真实剩余内容/);
});

test("AI generation trusts only a matching imported source and preserves provenance", () => {
  const tomorrow = {
    ...structuredClone(basePlan),
    date: "2026-08-06",
    sourcePlanType: "nankai-marxism-control-plan",
    sourceSchemaVersion: 3,
    sourcePlanId: "nankai-control-2026-08-06",
    sourceDocumentTitle: "2026南开马理论考研总控学习计划_2026-08-06起.docx",
  };
  const imported = {
    planType: "nankai-marxism-control-plan",
    schemaVersion: 3,
    planId: "nankai-control-2026-08-06",
    startDate: "2026-08-06",
    endDate: "2026-12-31",
    importedAt: "2026-08-05T12:00:00.000Z",
    sourceDocumentTitle: tomorrow.sourceDocumentTitle,
    detailedPlanDates: ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"],
    detailedPlanStart: "2026-08-06",
    detailedPlanEnd: "2026-08-12",
  };
  const trusted = context.planSourceStatus(tomorrow, imported, "2026-08-06");
  assert.equal(trusted.ready, true);
  assert.equal(trusted.sourceLabel, tomorrow.sourceDocumentTitle);
  assert.equal(context.planSourceStatus(tomorrow, { ...imported, planId: "other" }, "2026-08-06").ready, false);
  assert.equal(context.planSourceStatus({ ...tomorrow, date: "2026-08-13" }, imported, "2026-08-13").ready, false);
  assert.match(context.planSourceStatus({ ...tomorrow, date: "2026-08-13" }, imported, "2026-08-13").message, /只逐日安排至 2026-08-12/);
  assert.equal(context.planSourceStatus(basePlan, imported, "2026-08-06").ready, false);

  const sourcedPlan = structuredClone(validPlan);
  sourcedPlan.tasks.forEach((task) => { task.basis = "original-plan"; });
  const sourceEvidence = { recordDate: "2026-08-05", fingerprint: "daily-evidence-v1-example" };
  const merged = context.mergePlan(tomorrow, sourcedPlan, {
    generatedAt: "2026-08-05T12:00:00.000Z",
    planSource: trusted,
    sourceEvidence,
  });
  assert.equal(merged.day.aiTomorrowPlan.planSource.ready, true);
  assert.deepEqual({ ...merged.day.aiTomorrowPlan.sourceEvidence }, sourceEvidence);
  assert.equal(merged.day.tasks.find((task) => task.sourceTaskKey === "722").aiPlanBasis, "original-plan");
});

test("AI tomorrow plan rejects invented tasks overlaps and missing due review", () => {
  const available = context.availableTasks(basePlan).map((item) => ({ ...item }));
  const invented = structuredClone(validPlan);
  invented.tasks[0].sourceTaskKey = "invented";
  assert.throws(() => context.normalizePlan(invented, { expectedDate: "2026-08-03", availableTasks: available }), /未知或未开放/);
  const overlap = structuredClone(validPlan);
  overlap.tasks[1].time = "09:00—11:00";
  assert.throws(() => context.normalizePlan(overlap, { expectedDate: "2026-08-03", availableTasks: available }), /时间重叠/);
  const noReview = structuredClone(validPlan);
  noReview.tasks = noReview.tasks.slice(0, 3);
  assert.throws(() => context.normalizePlan(noReview, { expectedDate: "2026-08-03", availableTasks: available, hasDueReviews: true }), /未安排复盘/);
});

test("AI plan merge preserves manual completed and custom tasks", () => {
  const protectedPlan = structuredClone(basePlan);
  protectedPlan.tasks[1].manualEdited = true;
  protectedPlan.tasks[1].description = "我的722安排";
  protectedPlan.tasks[2].status = "completed";
  const before = structuredClone(protectedPlan);
  const normalized = context.normalizePlan(validPlan, {
    expectedDate: "2026-08-03",
    availableTasks: context.availableTasks(protectedPlan),
    hasDueReviews: true,
  });
  const merged = context.mergePlan(protectedPlan, normalized, { generatedAt: "2026-08-02T12:00:00.000Z" });
  assert.equal(merged.updated.length, 2);
  assert.equal(merged.protectedTasks.length, 2);
  assert.equal(merged.day.tasks.find((task) => task.id === "722").description, "我的722安排");
  assert.equal(merged.day.tasks.find((task) => task.id === "844").status, "completed");
  assert.equal(merged.day.tasks.find((task) => task.id === "custom").name, "自定义保留");
  assert.deepEqual(protectedPlan, before);
});

test("frontend keeps request preview read-only then auto-imports through the guarded apply path", () => {
  assert.match(reviewSource, /fetch\("\/api\/ai-tomorrow-plan"/);
  assert.match(reviewSource, /JSON\.stringify\(currentPlans\) !== pendingAiTomorrowPlan\.baselinePlansJson/);
  assert.match(reviewSource, /writeJson\(dailyPlansKey, currentPlans\)/);
  const requestSource = reviewSource.slice(reviewSource.indexOf("async function requestAiTomorrowPlan"), reviewSource.indexOf("function applyAiTomorrowPlan"));
  assert.doesNotMatch(requestSource, /writeJson\(dailyPlansKey/);
  assert.match(requestSource, /const applied = applyAiTomorrowPlan\(\)/);
  assert.match(indexSource, /id="applyAiTomorrowPlanBtn"[^>]*hidden/);
});

test("recent AI plan execution uses only tracked facts and requires repeated days for calibration", () => {
  const makeRecord = (date, englishState, majorState, cause = "") => ({
    date,
    delayedTasks: cause,
    aiTomorrowPlan: { provider: "deepseek", generatedAt: `${date}T00:00:00.000Z` },
    tasks: [
      { id: "english", sourceTaskKey: "english", name: "英语", time: "08:00—09:30", aiPlanned: true, status: englishState, completed: englishState === "completed", focusSeconds: englishState === "in-progress" ? 1200 : 0 },
      { id: "844", sourceTaskKey: "844", name: "844", time: "14:00—16:00", aiPlanned: true, status: majorState, completed: majorState === "completed", focusSeconds: 0 },
      { id: "manual", sourceTaskKey: "722", name: "受保护任务", time: "10:00—12:00", aiPlanned: false, status: "not-started", focusSeconds: 0 },
    ],
  });
  const history = [
    makeRecord("2026-08-03", "in-progress", "not-started", "开始太晚"),
    makeRecord("2026-08-04", "completed", "not-started"),
    makeRecord("2026-08-05", "completed", "completed"),
    { date: "2026-08-06", tasks: [{ aiPlanned: true }] },
  ];
  const result = context.recentExecution(history, 3);
  assert.equal(result.evidenceDays, 3);
  assert.equal(result.days[0].date, "2026-08-05");
  assert.equal(result.days[2].startedWithoutCompletionCount, 1);
  assert.equal(result.days[2].trackedFocusSeconds, 1200);
  assert.deepEqual(JSON.parse(JSON.stringify(result.repeatedUnfinished)), [{ sourceTaskKey: "844", daysCount: 2 }]);
  assert.equal(result.days[2].userReportedCause, "开始太晚");
  assert.equal(result.days[2].tasks.some((task) => task.sourceTaskKey === "722"), false);
});

test("daily record snapshot preserves AI plan provenance for later calibration", () => {
  assert.match(reviewSource, /sourceTaskKey: task\.sourceTaskKey \|\| ""/);
  assert.match(reviewSource, /aiPlanned: task\.aiPlanned === true/);
  assert.match(reviewSource, /plan\.aiTomorrowPlan.*\{ aiTomorrowPlan: plan\.aiTomorrowPlan \}/);
  assert.match(reviewSource, /recentAiPlanExecution: buildRecentAiPlanExecution\(readHistory\(\), 3\)/);
  assert.match(reviewSource, /buildAiTomorrowTaskCandidates\(existingPlan, todayRecord\)/);
  assert.match(reviewSource, /if \(!context\.sourceStatus\.ready\) throw new Error/);
  assert.match(indexSource, /id="aiTomorrowPlanSource"/);
  assert.match(indexSource, /id="aiTomorrowImportSourceBtn"/);
  assert.match(reviewSource, /今日未完成顺延/);
  assert.match(reviewSource, /按原计划推进/);
  assert.match(reviewSource, /来源未记录/);
  assert.match(reviewSource, /\["today-carryover", "original-plan"\]\.includes\(task\.aiPlanBasis\)/);
  assert.match(reviewSource, /storedPlan\.aiTomorrowPlan/);
  assert.match(indexSource, /id="aiPlanCalibration"/);
});

test("new plan core remains loaded before review in the current cache", () => {
  const coreIndex = indexSource.indexOf("js/ai-tomorrow-plan-core.js");
  const reviewIndex = indexSource.indexOf("js/review.js");
  assert.ok(coreIndex > 0 && reviewIndex > coreIndex);
  assert.match(indexSource, /js\/ai-tomorrow-plan-core\.js\?v=focus-result-handoff-v140/);
  assert.match(serviceWorkerSource, /js\/ai-tomorrow-plan-core\.js\?v=focus-result-handoff-v140/);
  assert.match(indexSource, /js\/review\.js\?v=focus-result-handoff-v140/);
  assert.match(serviceWorkerSource, /js\/review\.js\?v=focus-result-handoff-v140/);
  assert.match(serviceWorkerSource, /study-dashboard-review-recovery-v143/);
  assert.doesNotMatch(serviceWorkerSource, /ai-tomorrow-plan-v91|deepseek-daily-review-v90/);
});

test("launcher replaces only a verified stale dashboard Python service", () => {
  assert.match(launcherSource, /start-dashboard-preflight\.ps1/);
  assert.match(launcherSource, /admission-joint-v114/);
  assert.match(launcherPreflightSource, /api\/runtime-status/);
  assert.match(launcherPreflightSource, /id="dailyCloseout"/);
  assert.match(launcherPreflightSource, /id="studyProgressRunner"/);
  assert.match(launcherPreflightSource, /process\.ProcessName -match '\^python/);
  assert.match(launcherPreflightSource, /Stop-Process -Id \$ownerPid -Force/);
  assert.match(launcherSource, /goto PORT_IN_USE/);
});
