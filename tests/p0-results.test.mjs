import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const context = { console };
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8")}
globalThis.api = {
  stableKnowledgeUnitId,
  buildReviewKey,
  normalizeReviewEvidence,
  parseReviewEvidenceQuickRecord,
  validateReviewEvidence,
  buildReviewEvidenceQuickTemplate,
  ensureReviewSchedule,
  normalizeReviewQueueRecords,
  applyReviewResult,
  rescheduleReview,
  getDueReviews,
  getReviewTaskBudgetMinutes,
  getReviewExecutionState,
  getReviewWorkloadForPlan,
  validateRollingReviewCompletion,
  normalizeProfessionalResultsStore,
  validateProfessionalUnit,
  parseProfessionalQuickRecord,
  formatProfessionalTaskSummary,
  buildProfessionalSubjectQuickTemplate,
  isUntouchedProfessionalQuickTemplate,
  getProfessionalQuickDraftSubject,
  openProfessionalTaskRecord,
  hasProfessionalClosedBookProduct,
};`, context);

const unit = {
  subject: "722",
  unitId: context.api.stableKnowledgeUnitId("722", "实践与认识"),
  name: "实践与认识",
  sourceTaskId: "ma-yuan-722",
};
const now = "2026-07-18T12:00:00.000Z";
const evidence = { remembered: "闭卷写出实践决定认识的四层关系", gaps: "真理与价值边界不稳", nextAction: "重写边界部分" };
const scheduled = context.api.ensureReviewSchedule([], unit, "2026-07-18", now);
assert.equal(scheduled.length, 6);
assert.equal(new Set(scheduled.map((item) => item.reviewKey)).size, 6);
assert.equal(context.api.ensureReviewSchedule(scheduled, unit, "2026-07-18", now).length, 6);

const d1 = scheduled.find((item) => item.reviewLevel === "D1");
const missingEvidence = context.api.applyReviewResult(scheduled, d1.reviewId, "partial", "2026-07-19", "2026-07-19T12:00:00.000Z");
assert.equal(missingEvidence.changed, false);
assert.match(missingEvidence.message, /记住了/);
assert.equal(scheduled.find((item) => item.reviewId === d1.reviewId).status, "pending");
const partial = context.api.applyReviewResult(scheduled, d1.reviewId, "partial", "2026-07-19", "2026-07-19T12:00:00.000Z", evidence);
assert.equal(partial.records.find((item) => item.reviewId === d1.reviewId).status, "completed");
assert.equal(partial.records.find((item) => item.reviewId === d1.reviewId).completionEvidence.remembered, evidence.remembered);
assert.equal(partial.records.find((item) => item.reviewId === d1.reviewId).completionEvidence.savedAt, "2026-07-19T12:00:00.000Z");
assert.equal(partial.records.filter((item) => item.reviewLevel === "short-retest").length, 1);
assert.equal(partial.records.find((item) => item.reviewLevel === "short-retest").dueDate, "2026-07-20");
assert.equal(partial.records.find((item) => item.reviewLevel === "short-retest").dueAt, "2026-07-20T12:00:00.000Z");

const moved = context.api.rescheduleReview(partial.records, partial.records.find((item) => item.reviewLevel === "D7").reviewId, "2026-07-30", now);
assert.equal(moved.records.find((item) => item.reviewLevel === "D7").dueDate, "2026-07-30");
assert.equal(moved.records.length, partial.records.length);

const d3 = moved.records.find((item) => item.reviewLevel === "D3");
const failed = context.api.applyReviewResult(moved.records, d3.reviewId, "failed", "2026-07-21", "2026-07-21T12:00:00.000Z", evidence);
assert.equal(failed.records.find((item) => item.reviewLevel === "D0").status, "pending");
assert.equal(failed.records.find((item) => item.reviewLevel === "D0").dueDate, "2026-07-21");
assert.equal(failed.records.find((item) => item.reviewLevel === "D1").dueDate, "2026-07-22");
assert.equal(failed.records.filter((item) => item.reviewKey === context.api.buildReviewKey("722", unit.unitId, "D0")).length, 1);

const overdueShort = { ...failed.records.find((item) => item.reviewLevel === "short-retest"), status: "pending", dueDate: "2026-07-20" };
const due = context.api.getDueReviews([...failed.records.filter((item) => item.reviewLevel !== "short-retest"), overdueShort], "2026-07-21");
assert.equal(due[0].reviewLevel, "short-retest");
const execution = context.api.getReviewExecutionState(due, "2026-07-21");
assert.equal(execution.active.reviewLevel, "short-retest");
assert.equal(execution.remainingCount, Math.min(due.length, 6));
assert.equal(execution.backlogCount, Math.max(0, due.length - 6));
assert.equal(execution.completedCount, 0);
assert.equal(context.api.validateRollingReviewCompletion({ category: "rollingReview" }, due, "2026-07-21").valid, false);
assert.equal(context.api.validateRollingReviewCompletion({ category: "rollingReview" }, [], "2026-07-21").valid, true);
assert.equal(context.api.getReviewTaskBudgetMinutes({ category: "rollingReview", time: "20:40—21:00" }), 20);
assert.equal(context.api.getReviewTaskBudgetMinutes({ task: { category: "rollingReview", time: "20:20—20:50" } }), 30);
assert.equal(context.api.getReviewTaskBudgetMinutes({ task: { category: "rollingReview", time: "14:00—14:40" } }), 40);
assert.equal(context.api.getReviewTaskBudgetMinutes({ task: { category: "rollingReview", time: "14:00—16:00" } }), 45);

const budgetQueue = Array.from({ length: 10 }, (_, index) => ({
  reviewId: `budget-${index}`,
  reviewKey: `722:budget-${index}:D1`,
  businessKey: `722:budget-${index}:D1`,
  subject: "722",
  knowledgeUnitId: `budget-${index}`,
  knowledgeUnit: `预算单元${index}`,
  reviewLevel: "D1",
  reviewType: "spaced",
  dueDate: "2026-07-20",
  task: `复述预算单元${index}`,
  status: "pending",
}));
const budgetQueueBefore = JSON.stringify(budgetQueue);
const initialBudgetState = context.api.getReviewExecutionState(budgetQueue, "2026-07-21", { budgetMinutes: 20 });
assert.equal(initialBudgetState.budgetTaskCount, 4);
assert.equal(initialBudgetState.remainingCount, 4);
assert.equal(initialBudgetState.backlogCount, 6);
assert.equal(initialBudgetState.totalCount, 4);
assert.equal(JSON.stringify(budgetQueue), budgetQueueBefore);
const planBudgetState = context.api.getReviewWorkloadForPlan(budgetQueue, "2026-07-21", {
  tasks: [{ category: "rollingReview", time: "20:40—21:00" }],
});
assert.equal(planBudgetState.budgetMinutes, 20);
assert.equal(planBudgetState.remainingCount, 4);
assert.equal(planBudgetState.backlogCount, 6);
assert.equal(JSON.stringify(budgetQueue), budgetQueueBefore);
const partlyCompletedBudgetQueue = budgetQueue.map((record, index) => index < 2
  ? { ...record, status: "completed", completedDate: "2026-07-21" }
  : record);
const partialBudgetState = context.api.getReviewExecutionState(partlyCompletedBudgetQueue, "2026-07-21", { budgetMinutes: 20 });
assert.equal(partialBudgetState.completedCount, 2);
assert.equal(partialBudgetState.remainingCount, 2);
assert.equal(partialBudgetState.backlogCount, 6);
const completedBudgetQueue = budgetQueue.map((record, index) => index < 4
  ? { ...record, status: "completed", completedDate: "2026-07-21" }
  : record);
const completedBudgetState = context.api.getReviewExecutionState(completedBudgetQueue, "2026-07-21", { budgetMinutes: 20 });
assert.equal(completedBudgetState.remainingCount, 0);
assert.equal(completedBudgetState.backlogCount, 6);
const overCompletedBudgetQueue = budgetQueue.map((record, index) => index < 6
  ? { ...record, status: "completed", completedDate: "2026-07-21" }
  : record);
const overCompletedBudgetState = context.api.getReviewExecutionState(overCompletedBudgetQueue, "2026-07-21", { budgetMinutes: 20 });
assert.equal(overCompletedBudgetState.completedCount, 4);
assert.equal(overCompletedBudgetState.completedExtraCount, 2);
assert.equal(overCompletedBudgetState.totalCount, 4);
assert.equal(overCompletedBudgetState.remainingCount, 0);
assert.equal(overCompletedBudgetState.backlogCount, 4);
const completedBudgetValidation = context.api.validateRollingReviewCompletion(
  { category: "rollingReview", time: "20:40—21:00" }, completedBudgetQueue, "2026-07-21",
);
assert.equal(completedBudgetValidation.valid, true);
assert.match(completedBudgetValidation.message, /另有 6 条积压保留/);
const parsedEvidence = context.api.parseReviewEvidenceQuickRecord("记住了=人物—著作—命题链\n遗漏了=意义层\n下一步=闭卷补意义");
assert.deepEqual(
  JSON.parse(JSON.stringify(parsedEvidence)),
  { remembered: "人物—著作—命题链", gaps: "意义层", nextAction: "闭卷补意义", savedAt: "" },
);
assert.equal(context.api.validateReviewEvidence(parsedEvidence).valid, true);
assert.equal(context.api.validateReviewEvidence({ remembered: "主线", gaps: "", nextAction: "重写" }).valid, false);
assert.equal(context.api.buildReviewEvidenceQuickTemplate(parsedEvidence), "记住了=人物—著作—命题链\n遗漏了=意义层\n下一步=闭卷补意义");
assert.equal(context.api.normalizeReviewQueueRecords([{ reviewId: "legacy", reviewLevel: "D1", dueDate: "2026-07-21" }])[0].completionEvidence, undefined);

assert.equal(context.api.normalizeProfessionalResultsStore({}).schemaVersion, 1);
assert.equal(context.api.validateProfessionalUnit({
  subject: "722", name: "实践与认识", mastery: "L3", reviewResult: "通过",
  closedBookResult: "", mainGaps: ["概念边界"], nextStart: "重做闭卷复述",
}).valid, false);
assert.equal(context.api.validateProfessionalUnit({
  subject: "722", name: "实践与认识", mastery: "L3", reviewResult: "通过",
  closedBookResult: "可闭卷恢复核心关系", mainGaps: ["概念边界"], nextStart: "重做闭卷复述",
}).valid, true);

const quick = context.api.parseProfessionalQuickRecord([
  "722｜单元=实践与认识｜掌握=L3｜验收=通过｜闭卷=可恢复核心关系｜缺口=概念边界｜下一步=重做完整复述",
  "844｜单元=两种发展观｜掌握=L2｜验收=部分｜闭卷=只能写出主线｜缺口=人物意义｜下一步=补人物著作链",
].join("\n"));
assert.equal(quick.length, 2);
assert.equal(quick[0].subject, "722");
assert.equal(quick[0].mainGaps[0], "概念边界");
assert.equal(quick[1].reviewResult, "部分通过");
const minimalQuick = context.api.parseProfessionalQuickRecord([
  "科目=722",
  "实际推进=实践与认识第三节",
  "闭卷产物=闭卷写出实践决定认识的四层关系",
  "下一起点=核对真理与价值部分",
].join("\n"));
assert.equal(minimalQuick.length, 1);
assert.equal(minimalQuick[0].name, "实践与认识第三节");
assert.equal(minimalQuick[0].mastery, "L0");
assert.equal(minimalQuick[0].reviewResult, "未验收");
assert.equal(minimalQuick[0].mainGaps.length, 0);
assert.equal(context.api.hasProfessionalClosedBookProduct(minimalQuick[0]), true);
const inProgressQuick = context.api.parseProfessionalQuickRecord([
  "科目=844",
  "实际推进=青年马克思思想形成",
  "闭卷产物=未完成",
  "下一起点=重构人物著作命题链",
].join("\n"));
assert.equal(context.api.hasProfessionalClosedBookProduct(inProgressQuick[0]), false);
const multilineQuick = context.api.parseProfessionalQuickRecord([
  "科目=844",
  "实际推进=",
  "- 第十章第四节已完成本轮学习",
  "- 第一自然目：社会主义发展阶段与商品货币关系",
  "闭卷产物=",
  "- 可闭卷写出三个年份和理论错误",
  "下一起点=",
  "- 从第二自然目继续",
].join("\n"));
assert.match(multilineQuick[0].name, /第十章第四节已完成本轮学习/);
assert.match(multilineQuick[0].name, /社会主义发展阶段与商品货币关系/);
assert.match(multilineQuick[0].closedBookResult, /可闭卷写出三个年份和理论错误/);
assert.match(multilineQuick[0].nextStart, /从第二自然目继续/);
assert.throws(() => context.api.parseProfessionalQuickRecord("722｜单元=实践与认识｜掌握=L3｜验收=未验收｜缺口=无｜下一步=继续"), /L3—L5/);
assert.throws(() => context.api.parseProfessionalQuickRecord("随便写一段"), /没有识别到/);
assert.equal(context.api.buildProfessionalSubjectQuickTemplate("722"), "科目=722\n实际推进=\n闭卷产物=\n下一起点=");
assert.equal(context.api.buildProfessionalSubjectQuickTemplate("844"), "科目=844\n实际推进=\n闭卷产物=\n下一起点=");
assert.equal(context.api.buildProfessionalSubjectQuickTemplate("英语"), "");
assert.equal(context.api.isUntouchedProfessionalQuickTemplate(""), true);
assert.equal(context.api.isUntouchedProfessionalQuickTemplate(context.api.buildProfessionalSubjectQuickTemplate("722")), true);
assert.equal(context.api.isUntouchedProfessionalQuickTemplate(context.api.buildProfessionalSubjectQuickTemplate("844")), true);
assert.equal(context.api.isUntouchedProfessionalQuickTemplate("科目=722\n实际推进=实践与认识\n闭卷产物=\n下一起点="), false);
assert.equal(context.api.isUntouchedProfessionalQuickTemplate("尚未标注科目的手写草稿"), false);
assert.equal(context.api.getProfessionalQuickDraftSubject(""), "");
assert.equal(context.api.getProfessionalQuickDraftSubject("科目=722\n实际推进=实践与认识"), "722");
assert.equal(context.api.getProfessionalQuickDraftSubject("844｜单元=马克思主义史"), "844");
assert.equal(context.api.getProfessionalQuickDraftSubject("科目=722\n实际推进=A\n科目=844\n实际推进=B"), "mixed");
assert.equal(context.api.getProfessionalQuickDraftSubject("尚未标注科目的手写草稿"), "unknown");
const professionalPanel = { open: false, scrollIntoView() {} };
const professionalSubject = { value: "722" };
const professionalQuickRecord = { value: context.api.buildProfessionalSubjectQuickTemplate("722"), focus() {}, setSelectionRange() {} };
let professionalStatus = "";
context.document = { querySelector(selector) { return ({
  "#professionalResultsPanel": professionalPanel,
  "#professionalSubject": professionalSubject,
  "#professionalQuickRecord": professionalQuickRecord,
})[selector] || null; } };
context.setStatus = (_selector, message) => { professionalStatus = message; };
assert.equal(context.api.openProfessionalTaskRecord({ id: "plan-844", category: "maHistory", name: "844" }), true);
assert.equal(professionalQuickRecord.value, context.api.buildProfessionalSubjectQuickTemplate("844"));
assert.equal(professionalSubject.value, "844");
assert.match(professionalStatus, /已填入 844 单科模板/);
professionalQuickRecord.value = "科目=722\n实际推进=实践与认识\n闭卷产物=闭卷重构\n下一起点=核对教材";
assert.equal(context.api.openProfessionalTaskRecord({ id: "plan-844", category: "maHistory", name: "844" }), false);
assert.match(professionalQuickRecord.value, /实践与认识/);
assert.match(professionalStatus, /原文已保留/);
assert.equal(context.api.formatProfessionalTaskSummary([]), "实际：未记录");
assert.equal(context.api.formatProfessionalTaskSummary([
  { name: "实践与认识", mastery: "L2", reviewResult: "部分通过", closedBookResult: "可恢复主线", nextStart: "重测概念边界" },
  { name: "真理与价值", mastery: "L3", reviewResult: "通过", closedBookResult: "可闭卷重构", nextStart: "调用原著" },
]), "实际：今日2项｜最新：真理与价值 · L3 · 通过｜闭卷：可闭卷重构｜下一步：调用原著");
assert.equal(context.api.formatProfessionalTaskSummary([
  { name: "实践与认识第三节", mastery: "L0", reviewResult: "未验收", closedBookResult: "纸上重构四层关系", nextStart: "核对教材" },
]), "实际：实践与认识第三节 · 掌握待复盘验收｜闭卷：纸上重构四层关系｜下一步：核对教材");
const tasksSource = fs.readFileSync(new URL("../js/tasks.js", import.meta.url), "utf8");
const professionalSource = fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8");
assert.match(tasksSource, /appendProfessionalTaskSummary\(task, content, body\)/);
assert.match(tasksSource, /action\.dataset\.taskAction === "professional-result"/);
assert.match(tasksSource, /openProfessionalTaskRecord\(task\)/);
assert.match(professionalSource, /createTaskButton\("记录实际结果", "professional-result", task\.id\)/);
assert.match(professionalSource, /subject\.value = subjectCode/);
assert.match(professionalSource, /insertedTemplate = !quickRecord\.value\.trim\(\)/);
assert.match(professionalSource, /isUntouchedProfessionalQuickTemplate\(quickRecord\.value\)/);
assert.match(professionalSource, /draftSubject !== subjectCode/);
assert.match(professionalSource, /原文已保留/);
assert.match(professionalSource, /quickRecord\.focus\(\)/);
assert.match(professionalSource, /getProfessionalUnits\(dateKey, input\.subject\)\.some\(hasProfessionalClosedBookProduct\)/);
assert.match(professionalSource, /actualProgress: resultText\(input\.name, PROFESSIONAL_ACTUAL_PROGRESS_LIMIT\)/);
assert.match(professionalSource, /unit\.actualProgress \|\| unit\.name/);
assert.match(professionalSource, /closedBookResult: resultText\(input\.closedBookResult, PROFESSIONAL_CLOSED_BOOK_LIMIT\)/);
assert.match(professionalSource, /nextStart: resultText\(input\.nextStart, PROFESSIONAL_NEXT_START_LIMIT\)/);
assert.match(professionalSource, /updateProfessionalTaskAfterSave\(input\.subject, hasClosedBookProduct\)/);
assert.match(professionalSource, /setTaskStatus\(task, "completed"\)/);
assert.match(professionalSource, /setTaskStatus\(task, "in-progress"\)/);
assert.match(professionalSource, /focusTimerState\.activeTaskId === task\.id/);
assert.match(professionalSource, /clearTerminalCurrentPlanTask\(plan, task\.id\)/);
assert.match(professionalSource, /dataset\.reviewResultAction = code/);
assert.match(professionalSource, /button\.disabled = true/);
assert.match(professionalSource, /data-review-evidence/);
assert.match(professionalSource, /开始5分钟遮挡复述/);
assert.match(professionalSource, /parseReviewEvidenceQuickRecord/);
assert.match(tasksSource, /function startReviewFiveMinuteRound/);
assert.match(professionalSource, /completeRollingReviewTaskIfCleared\(outcome\.records\)/);
assert.match(professionalSource, /本次不计为完成，也不会自动完成滚动复盘任务/);
assert.doesNotMatch(professionalSource, /select\.dataset\.reviewResult/);
assert.match(tasksSource, /validateRollingReviewCompletion\(task, readJson\(reviewQueueKey, \[\]\), getDateKey\(\)\)/);
assert.match(tasksSource, /action: "unified-review"/);

console.log("P0_RESULTS_TEST_OK");
