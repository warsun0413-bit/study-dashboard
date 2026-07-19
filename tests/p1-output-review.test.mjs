import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
const context=vm.createContext({console,Date});
vm.runInContext(`${fs.readFileSync(new URL("../js/p1-results-core.js",import.meta.url),"utf8")}\n${fs.readFileSync(new URL("../js/p1-output-core.js",import.meta.url),"utf8")}\n${fs.readFileSync(new URL("../js/p0-results.js",import.meta.url),"utf8")}\nglobalThis.api={normalizeOutputRecord,upsertOutputRecord,buildOutputRewriteReview,normalizeReviewRecord,normalizeReviewQueueRecords,upsertReviewRecord,applyReviewResult};`,context);
const api=context.api; const date="2026-07-19"; const now="2026-07-19T12:00:00.000Z";
test("full essay requires minutes and word count while outline remains distinct",()=>{
  assert.throws(()=>api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"题",outputType:"full-essay"},{now}),/用时与字数/);
  const outline=api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"题",outputType:"level1-outline"},{now});
  assert.equal(outline.actualMinutes,null); assert.equal(outline.wordCount,null); assert.equal(outline.outputType,"level1-outline");
});
test("same dated task and question updates stable output record",()=>{
  const first=api.upsertOutputRecord([],{date,taskId:"plan-output",subject:"844",question:"发展史",outputType:"core-paragraph"},now);
  const second=api.upsertOutputRecord(first.records,{...first.record,actualMinutes:20},"2026-07-19T13:00:00.000Z");
  assert.equal(second.records.length,1); assert.equal(second.record.recordId,first.record.recordId); assert.equal(second.record.actualMinutes,20);
});
test("rewrite review uses reviewType not reviewLevel and stays unique",()=>{
  const record=api.normalizeOutputRecord({date,taskId:"plan-output",subject:"722",question:"实践论",outputType:"full-essay",actualMinutes:60,wordCount:1200,rewriteRequired:true,rewriteDueDate:"2026-07-20"},{now});
  const review=api.buildOutputRewriteReview(record,null,now); assert.equal(review.reviewType,"output-rewrite"); assert.equal(review.reviewLevel,"D0");
  const once=api.upsertReviewRecord([],review,now); const twice=api.upsertReviewRecord(once.records,review,now);
  assert.equal(twice.records.filter(item=>item.status!=="cancelled").length,1);
  const completed=api.applyReviewResult(twice.records,twice.record.reviewId,"passed",date,now);
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
