import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const planWindowSource = fs.readFileSync(new URL("../js/plan-window-core.js", import.meta.url), "utf8");
const tomorrowSource = fs.readFileSync(new URL("../js/ai-tomorrow-plan-core.js", import.meta.url), "utf8");
const rollingSource = fs.readFileSync(new URL("../js/ai-rolling-week-plan-core.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(`${planWindowSource}\n${tomorrowSource}\n${rollingSource}\nglobalThis.core = { auditRollingCapacityRecord, buildRollingCapacityEvidenceAudit, buildRollingWeekCapacityCalibration, buildDailyExecutionTargetModel, buildAiRollingWeekPlanContext, normalizeAiRollingWeekPlan, mergeAiRollingWeekPlan, getAiTomorrowPlanSourceStatus };`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));
const formalDay = (date, totalStudySeconds, completionDone, completionTotal) => ({
  recordSchemaVersion: 2,
  manualRecordsSaved: true,
  date,
  totalStudySeconds,
  completionDone,
  completionTotal,
});

function makePhase() {
  return {
    phaseId: "phase-2",
    phaseName: "第二阶段",
    startDate: "2026-08-13",
    endDate: "2026-08-23",
    targetEffectiveStudyHours: 8,
    goal: "按准确停点继续推进",
    acceptance: "记录当天真实完成范围和下一准确起点",
    chapterTasks: {
      "722": "以8月12日验收后的最新准确停点为起点，按教材顺序推进。",
      "844": "以8月12日验收后的最新准确停点为起点，按教材顺序推进。",
    },
    taskTemplates: {
      english: "英语词汇与阅读",
      "722": "722阶段任务",
      "844": "844阶段任务",
      review: "到期闭卷复盘",
      training: "选择题训练",
      politics: "公共政治",
      output: "专业课输出",
    },
    completionCriteria: {
      english: "留下阅读结果",
      "722": "记录准确停点",
      "844": "记录准确停点",
      review: "留下闭卷证据",
      training: "记录错题",
      politics: "记录题量",
      output: "保存输出",
    },
  };
}

function makeContext(options = {}) {
  const professionalStore = options.professionalStore || { schemaVersion: 1, days: { "2026-08-08": {
    "722": { units: [{ unitId: "u1", nextStart: "第五章第一节", updatedAt: "2026-08-08T08:00:00.000Z" }] },
    "844": { units: [{ unitId: "u2", nextStart: "第十章下一标题待核对", updatedAt: "2026-08-08T08:10:00.000Z" }] },
  } } };
  return core.buildAiRollingWeekPlanContext({
    todayDate: "2026-08-08",
    importedPlan: {
      planType: "nankai-marxism-control-plan",
      schemaVersion: 3,
      planId: "nankai-control-2026-08-06",
      sourceDocumentTitle: "总控计划",
      importedAt: "2026-08-08T09:00:00.000Z",
      detailedPlanEnd: "2026-08-12",
    },
    phaseTemplates: [makePhase()],
    plans: {},
    professionalStore,
    reviewQueue: [],
    history: options.history || [],
  });
}

function makeRawPlan(source) {
  const times = ["08:00—08:25", "08:35—09:35", "09:50—10:50", "11:10—11:40", "13:30—14:30", "15:45—16:45", "19:00—20:00", "20:20—20:50"];
  return {
    schemaVersion: 1,
    startDate: source.startDate,
    endDate: source.endDate,
    summary: "按阶段范围和准确停点编排",
    days: source.days.map((day) => ({
      date: day.date,
      summary: day.phaseName,
      tasks: day.availableTasks.map((task, index) => ({
        sourceTaskKey: task.sourceTaskKey,
        basis: task.requiredBasis,
        time: times[index],
        ...task.planCandidates[0],
      })),
    })),
  };
}

test("builds the next contiguous seven days from imported detailed end", () => {
  const result = makeContext();
  assert.equal(result.startDate, "2026-08-13");
  assert.equal(result.endDate, "2026-08-19");
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "722").nextStart, "第五章第一节");
  assert.match(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "844").description, /8月12日验收后的最新准确停点/);
  assert.equal(result.capacityCalibration.status, "insufficient-data");
  assert.equal(result.capacityCalibration.recommendedMaxMinutes, 435);
  assert.deepEqual(plain(result.days[0].requiredTaskKeys), ["englishWords", "english", "722", "844", "originalTextOrReview", "politics", "outputOrMock"]);
  assert.equal(result.days[0].loadProfile.mainSubject, "722");
  assert.equal(result.days[0].loadProfile.secondarySubject, "844");
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "722").time, "08:35—10:25");
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "844").time, "10:40—11:30");
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "english").time, "15:45—17:15");
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "englishWords").time, "08:00—08:25");
});

test("uses the standard ceiling until three evidence days and gates later expansion", () => {
  const insufficient = core.buildRollingWeekCapacityCalibration([
    formalDay("2026-07-20", 36000, 5, 5),
    formalDay("2026-08-07", 7200, 2, 5),
    formalDay("2026-08-08", 10800, 3, 5),
  ], "2026-08-08", 480);
  assert.equal(insufficient.status, "insufficient-data");
  assert.equal(insufficient.recommendedMaxMinutes, 435);
  const calibrated = core.buildRollingWeekCapacityCalibration([
    formalDay("2026-08-06", 7200, 2, 5),
    formalDay("2026-08-07", 10800, 3, 5),
    formalDay("2026-08-08", 14400, 4, 5),
  ], "2026-08-08", 480);
  assert.equal(calibrated.status, "calibrated");
  assert.equal(calibrated.medianStudyMinutes, 180);
  assert.equal(calibrated.weightedCompletionRate, 60);
  assert.equal(calibrated.expansionEligible, false);
  assert.equal(calibrated.recommendedMaxMinutes, 180);
  const expanded = core.buildRollingWeekCapacityCalibration([
    formalDay("2026-08-06", 7200, 4, 5),
    formalDay("2026-08-07", 10800, 5, 5),
    formalDay("2026-08-08", 14400, 5, 5),
  ], "2026-08-08", 480, { professionalStore: { days: {
    "2026-08-08": { "722": { units: [{ closedBookResult: "闭卷写出资本积累机制" }] } },
  } } });
  assert.equal(expanded.closedBookEvidenceDays, 1);
  assert.equal(expanded.expansionEligible, true);
  assert.equal(expanded.recommendedMaxMinutes, 210);
});

test("capacity calibration uses only auditable formal days and reports every exclusion without mutation", () => {
  const history = [
    formalDay("2026-08-02", 60, 1, 1),
    formalDay("2026-08-03", 120, 1, 1),
    formalDay("2026-08-04", 180, 1, 1),
    { date: "2026-08-05", totalStudySeconds: 7200, completionDone: 5, completionTotal: 5 },
    formalDay("2026-08-06", 86401, 1, 1),
    formalDay("2026-08-07", 7200, 999, 5),
    formalDay("2026-08-08", 7200, 1, 1),
    formalDay("2026-08-08", 10800, 1, 1),
  ];
  const before = JSON.stringify(history);
  const audit = plain(core.buildRollingCapacityEvidenceAudit(history, "2026-08-08"));
  assert.equal(audit.windowDays, 7);
  assert.equal(audit.evidenceDays, 3);
  assert.equal(audit.excludedDays, 4);
  assert.deepEqual(audit.exclusionReasonCounts, {
    "duplicate-date": 1,
    "invalid-completion-facts": 1,
    "invalid-study-time": 1,
    "unverified-record-schema": 1,
  });
  assert.equal(JSON.stringify(history), before);

  const calibrated = plain(core.buildRollingWeekCapacityCalibration(history, "2026-08-08", 480, {
    professionalStore: { days: {
      "2026-08-05": { "722": { units: [{ closedBookResult: "被排除日期的闭卷记录" }] } },
    } },
  }));
  assert.equal(calibrated.status, "calibrated");
  assert.equal(calibrated.medianStudyMinutes, 2);
  assert.equal(calibrated.weightedCompletionRate, 100);
  assert.equal(calibrated.excludedDays, 4);
  assert.equal(calibrated.closedBookEvidenceDays, 0);
  assert.equal(calibrated.expansionEligible, false);
  assert.match(calibrated.message, /3个正式有效日校准（排除4日）/);
});

test("capacity record audit rejects coerced numeric fields and impossible completion facts", () => {
  assert.equal(core.auditRollingCapacityRecord(formalDay("2026-08-08", 1, 0, 1)).valid, true);
  assert.deepEqual(plain(core.auditRollingCapacityRecord({
    ...formalDay("2026-08-08", 60, 1, 1), totalStudySeconds: "60",
  })), { valid: false, reason: "invalid-study-time" });
  assert.deepEqual(plain(core.auditRollingCapacityRecord({
    ...formalDay("2026-08-08", 60, 1, 1), completionDone: 1.5,
  })), { valid: false, reason: "invalid-completion-facts" });
  assert.deepEqual(plain(core.auditRollingCapacityRecord({
    ...formalDay("2026-08-08", 60, 1, 1), completionTotal: 0,
  })), { valid: false, reason: "invalid-completion-facts" });
});

test("daily execution target follows manual then confirmed-load then recent-capacity evidence", () => {
  const history = [
    formalDay("2026-08-06", 7200, 2, 5),
    formalDay("2026-08-07", 10800, 3, 5),
    formalDay("2026-08-08", 14400, 4, 5),
  ];
  const manual = plain(core.buildDailyExecutionTargetModel({
    planTargetMinutes: 540, hasManualTarget: true, manualTargetMinutes: 600,
    loadProfile: { plannedCoreMinutes: 435 }, history, throughDate: "2026-08-08",
  }));
  assert.equal(manual.source, "manual");
  assert.equal(manual.executionTargetMinutes, 600);
  assert.equal(manual.planTargetMinutes, 540);
  const confirmed = plain(core.buildDailyExecutionTargetModel({
    planTargetMinutes: 540, loadProfile: { plannedCoreMinutes: 435 }, history, throughDate: "2026-08-08",
  }));
  assert.equal(confirmed.source, "confirmed-load");
  assert.equal(confirmed.executionTargetMinutes, 435);
  const calibrated = plain(core.buildDailyExecutionTargetModel({
    planTargetMinutes: 480, history, throughDate: "2026-08-08",
  }));
  assert.equal(calibrated.source, "recent-capacity");
  assert.equal(calibrated.executionTargetMinutes, 180);
  assert.equal(calibrated.capacityCalibration.evidenceDays, 3);
});

test("daily execution target keeps a standard load until evidence is sufficient", () => {
  const model = plain(core.buildDailyExecutionTargetModel({
    planTargetMinutes: 540,
    history: [formalDay("2026-08-08", 7200, 2, 5)],
    throughDate: "2026-08-08",
  }));
  assert.equal(model.source, "standard-load");
  assert.equal(model.executionTargetMinutes, 435);
  assert.equal(model.planTargetMinutes, 540);
});

test("formal weakness evidence chooses the first main subject, then alternates", () => {
  const result = makeContext({ professionalStore: { schemaVersion: 1, days: { "2026-08-08": {
    "722": { units: [{ unitId: "u1", nextStart: "第五章第一节", mastery: "L4", reviewResult: "通过", closedBookResult: "可闭卷恢复", updatedAt: "2026-08-08T08:00:00.000Z" }] },
    "844": { units: [{ unitId: "u2", nextStart: "第十章下一标题待核对", mastery: "L2", reviewResult: "部分通过", closedBookResult: "主线不稳", updatedAt: "2026-08-08T08:10:00.000Z" }] },
  } } } });
  assert.equal(result.days[0].loadProfile.mainSubject, "844");
  assert.equal(result.days[1].loadProfile.mainSubject, "722");
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "844").studyRole, "main-professional");
  assert.match(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "722").description, /闭卷提取与纠错，不开启新范围/);
  assert.equal(result.days[0].availableTasks.find((task) => task.sourceTaskKey === "outputOrMock").outputSubject, "844");
});

test("evidence below the five-hour floor compresses every core block without exceeding capacity", () => {
  const source = makeContext({ history: [
    formalDay("2026-08-06", 7200, 2, 5),
    formalDay("2026-08-07", 10800, 3, 5),
    formalDay("2026-08-08", 14400, 4, 5),
  ] });
  assert.equal(source.capacityCalibration.recommendedMaxMinutes, 180);
  assert.equal(source.days[0].loadProfile.profileId, "evidence-reduced");
  assert.equal(source.days[0].loadProfile.plannedCoreMinutes, 180);
  const normalized = core.normalizeAiRollingWeekPlan(makeRawPlan(source), source);
  const representedMinutes = normalized.days[0].tasks.reduce((sum, task) => {
    const match = task.time.match(/(\d{2}):(\d{2})—(\d{2}):(\d{2})/);
    return sum + (Number(match[3]) * 60 + Number(match[4]) - Number(match[1]) * 60 - Number(match[2]));
  }, 0);
  assert.equal(representedMinutes, 180);
  assert.ok(representedMinutes <= source.days[0].maxPlannedMinutes);
});

test("rejects rewritten chapter content", () => {
  const source = makeContext();
  const raw = makeRawPlan(source);
  raw.days[0].tasks[1].description = "AI虚构的第六章";
  assert.throws(() => core.normalizeAiRollingWeekPlan(raw, source), /改写了原计划或真实剩余内容/);
});

test("rejects a generated day above the calibrated execution ceiling", () => {
  const source = makeContext();
  source.days[0].maxPlannedMinutes = 180;
  assert.throws(() => core.normalizeAiRollingWeekPlan(makeRawPlan(source), source), /个人承载上限180分钟/);
});

test("merges seven days while preserving protected and custom tasks", () => {
  const source = makeContext();
  const plan = core.normalizeAiRollingWeekPlan(makeRawPlan(source), source);
  const existing = plain(source.days[0].baseDay);
  const existingEnglish = existing.tasks.find((task) => task.sourceTaskKey === "english");
  existingEnglish.manualEdited = true;
  existingEnglish.description = "我的人工英语任务";
  existing.tasks.push({ id: "custom", name: "自定义任务", description: "保留我", manualEdited: true, status: "not-started" });
  const merged = core.mergeAiRollingWeekPlan({ [source.startDate]: existing }, plan, source, { generatedAt: "2026-08-08T10:00:00.000Z" });
  assert.equal(merged.dailyPlans[source.startDate].tasks.find((task) => task.sourceTaskKey === "english").description, "我的人工英语任务");
  assert.equal(merged.dailyPlans[source.startDate].tasks.at(-1).id, "custom");
  assert.equal(merged.protectedTasks.length, 1);
  assert.equal(merged.dailyPlans[source.startDate].targetEffectiveStudyHours, 7.25);
  assert.equal(merged.dailyPlans[source.startDate].studyLoadProfile.mainSubject, "722");
  assert.equal(merged.dailyPlans[source.startDate].tasks.find((task) => task.sourceTaskKey === "722").studyRole, "main-professional");
  assert.equal(merged.dailyPlans[source.startDate].tasks.find((task) => task.sourceTaskKey === "outputOrMock").outputSubject, "722");
  assert.deepEqual(plain(merged.metadata.detailedPlanDates), plain(source.days.map((day) => day.date)));
});

test("confirmed rolling metadata is trusted only for its exact dates", () => {
  const source = makeContext();
  const plan = core.normalizeAiRollingWeekPlan(makeRawPlan(source), source);
  const merged = core.mergeAiRollingWeekPlan({}, plan, source, { generatedAt: "2026-08-08T10:00:00.000Z" });
  const day = merged.dailyPlans["2026-08-13"];
  assert.equal(core.getAiTomorrowPlanSourceStatus(day, merged.metadata, "2026-08-13").ready, true);
  assert.equal(core.getAiTomorrowPlanSourceStatus(day, merged.metadata, "2026-08-20").ready, false);
});

test("page and cache expose the manual-confirm rolling workflow", () => {
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const review = fs.readFileSync(new URL("../js/review.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(index, /id="generateAiRollingWeekBtn"/);
  assert.match(index, /id="applyAiRollingWeekBtn"/);
  assert.match(index, /id="aiRollingWeekCalibration"/);
  assert.match(review, /fetch\("\/api\/ai-week-plan"/);
  assert.match(review, /ai-rolling-week-import-v1/);
  assert.match(worker, /study-dashboard-schedule-transition-v149/);
  assert.match(worker, /ai-rolling-week-plan-core\.js\?v=english-split-v145/);
});
