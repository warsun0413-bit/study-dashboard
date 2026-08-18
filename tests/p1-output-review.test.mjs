import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
const context=vm.createContext({console,Date});
vm.runInContext(`${fs.readFileSync(new URL("../js/p1-results-core.js",import.meta.url),"utf8")}\n${fs.readFileSync(new URL("../js/p1-output-core.js",import.meta.url),"utf8")}\n${fs.readFileSync(new URL("../js/p0-results.js",import.meta.url),"utf8")}\nglobalThis.api={normalizeOutputRecord,upsertOutputRecord,validateOutputTaskCompletion,buildOutputRewriteReview,parseOutputQuickRecord,buildOutputQuickTemplate,getOutputQuickDraftSubject,normalizeReviewRecord,normalizeReviewQueueRecords,upsertReviewRecord,applyReviewResult};`,context);
const api=context.api; const date="2026-07-19"; const now="2026-07-19T12:00:00.000Z";
test("output templates require an explicit or task-inferred subject",()=>{
  assert.match(api.buildOutputQuickTemplate("722"),/^722｜题目=/);
  assert.match(api.buildOutputQuickTemplate("844"),/^844｜题目=/);
  assert.match(api.buildOutputQuickTemplate(""),/^｜题目=/);
  assert.match(api.buildOutputQuickTemplate("mixed"),/^｜题目=/);
  assert.equal(api.getOutputQuickDraftSubject(""),"");
  assert.equal(api.getOutputQuickDraftSubject("722｜题目=实践论"),"722");
  assert.equal(api.getOutputQuickDraftSubject("844｜题目=发展史"),"844");
  assert.equal(api.getOutputQuickDraftSubject("｜题目=综合训练"),"unknown");
});
test("full essay requires minutes and word count while outline remains distinct",()=>{
  assert.throws(()=>api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"题",outputType:"full-essay"},{now}),/用时与字数/);
  const outline=api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"题",outputType:"level1-outline"},{now});
  assert.equal(outline.actualMinutes,null); assert.equal(outline.wordCount,null); assert.equal(outline.outputType,"level1-outline");
  const legacy=api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"legacy",outputType:"level1-outline",plannedMinutes:60},{now});
  assert.equal(legacy.plannedMinutes,60);
});
test("same dated task and question updates stable output record",()=>{
  const first=api.upsertOutputRecord([],{date,taskId:"plan-output",subject:"844",question:"发展史",outputType:"core-paragraph"},now);
  const second=api.upsertOutputRecord(first.records,{...first.record,actualMinutes:20},"2026-07-19T13:00:00.000Z");
  assert.equal(second.records.length,1); assert.equal(second.record.recordId,first.record.recordId); assert.equal(second.record.actualMinutes,20);
});
test("quick output record captures a real closed-book product",()=>{
  const parsed=api.parseOutputQuickRecord("722｜题目=实践是认识的基础｜类型=完整论述｜来源=南开真题｜闭卷=是｜用时=45分钟｜字数=1100｜结构=实践决定认识的四层关系｜问题=原著调用不足；结尾不完整｜下一步=补原著后重写｜重写=是｜重写日期=2026-07-23",{date,taskId:"plan-output"});
  assert.equal(parsed.subject,"722"); assert.equal(parsed.outputType,"full-essay"); assert.equal(parsed.closedBook,true); assert.equal(parsed.plannedMinutes,null);
  assert.deepEqual(Array.from(parsed.mainProblems),["原著调用不足","结尾不完整"]); assert.equal(parsed.rewriteRequired,true);
  assert.doesNotThrow(()=>api.normalizeOutputRecord(parsed,{now}));
});
test("quick output rejects time-only and incomplete rewrite records",()=>{
  assert.throws(()=>api.parseOutputQuickRecord("844｜题目=发展史｜闭卷=是｜用时=30｜结构=",{date,taskId:"plan-output"}),/结构结果/);
  assert.throws(()=>api.parseOutputQuickRecord("844｜题目=发展史｜闭卷=否｜结构=人物著作命题｜重写=是",{date,taskId:"plan-output"}),/重写日期/);
});
test("rewrite review uses reviewType not reviewLevel and stays unique",()=>{
  const record=api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"实践论",outputType:"full-essay",actualMinutes:60,wordCount:1200,rewriteRequired:true,rewriteDueDate:"2026-07-20"},{now});
  const review=api.buildOutputRewriteReview(record,null,now); assert.equal(review.reviewType,"output-rewrite"); assert.equal(review.reviewLevel,"D0");
  const once=api.upsertReviewRecord([],review,now); const twice=api.upsertReviewRecord(once.records,review,now);
  assert.equal(twice.records.filter(item=>item.status!=="cancelled").length,1);
  const completed=api.applyReviewResult(twice.records,twice.record.reviewId,"passed",date,now,{remembered:"闭卷重写完整论述",gaps:"原著调用不足",nextAction:"补原著后再写"});
  assert.equal(completed.records.length,1); assert.equal(completed.records[0].status,"completed");
});
test("legacy reviews gain compatible reviewType without changing due date",()=>{
  const spaced=api.normalizeReviewRecord({reviewId:"old",reviewLevel:"D7",dueDate:"2026-07-25",subject:"722",knowledgeUnitId:"u"});
  const retest=api.normalizeReviewRecord({reviewId:"old2",reviewLevel:"short-retest",dueDate:"2026-07-20",subject:"722",knowledgeUnitId:"u"});
  assert.equal(spaced.reviewType,"spaced"); assert.equal(spaced.dueDate,"2026-07-25"); assert.equal(retest.reviewType,"short-retest");
});
test("pending review never mutates professional mastery fields",()=>{
  const source={schemaVersion:1,days:{[date]:{"722":{units:[{unitId:"u",mastery:"L2"}]}}}};
  api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"题",outputType:"full-essay",actualMinutes:40,wordCount:800,reviewStatus:"pending-review"},{now});
  assert.equal(source.days[date]["722"].units[0].mastery,"L2");
});

test("output task completion requires a related closed-book product with structure",()=>{
  const task={id:"plan-output",category:"output"};
  assert.equal(api.validateOutputTaskCompletion(task,[],date).valid,false);
  assert.equal(api.validateOutputTaskCompletion(task,[{date,taskId:"plan-output",question:"实践",closedBook:false,structureResult:"三层结构"}],date).valid,false);
  assert.equal(api.validateOutputTaskCompletion(task,[{date,taskId:"plan-output",question:"实践",closedBook:true,structureResult:""}],date).valid,false);
  assert.equal(api.validateOutputTaskCompletion(task,[{date,taskId:"plan-output",question:"实践",closedBook:true,structureResult:"三层结构"}],date).valid,true);
});

test("output completion never accepts another task or changes non-output tasks",()=>{
  const record={date,taskId:"other-output",question:"实践",closedBook:true,structureResult:"三层结构"};
  assert.equal(api.validateOutputTaskCompletion({id:"plan-output",category:"output"},[record],date).valid,false);
  assert.equal(api.validateOutputTaskCompletion({id:"plan-722",category:"maYuan"},[],date).valid,true);
});
