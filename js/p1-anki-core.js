// P1 Checkpoint 3: pure Anki candidate normalization, deduplication, and export.
const ANKI_SUBJECTS = Object.freeze(["722", "844", "english", "politics"]);
const ANKI_SOURCE_TYPES = Object.freeze(["review-gap", "reading-word", "politics-error", "original-text", "essay-output"]);
const ANKI_PRIORITIES = Object.freeze(["high", "medium", "low"]);
const ANKI_STATUSES = Object.freeze(["candidate", "approved", "exported", "rejected"]);
function ankiText(value,max=1000){return String(value==null?"":value).trim().slice(0,max);}
function normalizeAnkiFront(value){return ankiText(value,500).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g," ");}
function buildAnkiDuplicateKey(subject,front){return `${subject}:${normalizeAnkiFront(front)}`;}
function ankiStableId(duplicateKey){let hash=2166136261;for(let i=0;i<duplicateKey.length;i+=1){hash^=duplicateKey.charCodeAt(i);hash=Math.imul(hash,16777619);}return `anki-${(hash>>>0).toString(36)}`;}
function normalizeAnkiCandidate(input,options={}){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Anki候选必须是对象。");
  const subject=ANKI_SUBJECTS.includes(input.subject)?input.subject:"";if(!subject)throw new Error("Anki候选科目无效。");
  const front=ankiText(input.front,500);if(!front)throw new Error("卡片正面不能为空。");
  const back=ankiText(input.back,2000);if(!back)throw new Error("卡片背面不能为空。");
  const duplicateKey=buildAnkiDuplicateKey(subject,front);const existing=options.existing&&typeof options.existing==="object"?options.existing:{};const now=ankiText(options.now||input.updatedAt||new Date().toISOString(),40);
  return {cardId:ankiText(existing.cardId||input.cardId,160)||ankiStableId(duplicateKey),date:p1Date(input.date),subject,sourceType:ANKI_SOURCE_TYPES.includes(input.sourceType)?input.sourceType:"review-gap",sourceId:ankiText(input.sourceId,160),front,back,tags:[...new Set((Array.isArray(input.tags)?input.tags:String(input.tags||"").split(/[,，\n]/)).map(item=>ankiText(item,80)).filter(Boolean))].slice(0,30),reason:ankiText(input.reason,500),priority:ANKI_PRIORITIES.includes(input.priority)?input.priority:"medium",status:ANKI_STATUSES.includes(existing.status||input.status)?existing.status||input.status:"candidate",duplicateKey,createdAt:ankiText(existing.createdAt||input.createdAt||now,40),updatedAt:now,exportedAt:ankiText(existing.exportedAt||input.exportedAt,40)};
}
function upsertAnkiCandidate(records,input,now=new Date().toISOString()){
  const source=Array.isArray(records)?records.slice():[];const key=buildAnkiDuplicateKey(input.subject,input.front);const index=source.findIndex(item=>item&&(item.duplicateKey===key||item.cardId===input.cardId));const record=normalizeAnkiCandidate(input,{existing:index>=0?source[index]:null,now});if(index>=0)source[index]=record;else source.push(record);return{records:source,record,created:index<0};
}
function escapeDelimited(value,delimiter){const text=String(value==null?"":value).replace(/\r?\n/g,"\n");return /["\n\r]/.test(text)||text.includes(delimiter)?`"${text.replace(/"/g,'""')}"`:text;}
function exportAnkiCandidates(records,format="tsv",bom=true){
  const approved=(Array.isArray(records)?records:[]).filter(item=>item&&["approved","exported"].includes(item.status));
  if(format==="json")return `${bom?"\uFEFF":""}${JSON.stringify(approved.map(({front,back,tags})=>({Front:front,Back:back,Tags:(tags||[]).join(" ")})),null,2)}`;
  const delimiter=format==="csv"?",":"\t";const rows=[["Front","Back","Tags"],...approved.map(item=>[item.front,item.back,(item.tags||[]).join(" ")])];return `${bom?"\uFEFF":""}${rows.map(row=>row.map(value=>escapeDelimited(value,delimiter)).join(delimiter)).join("\r\n")}`;
}
function generateAnkiCandidatesFromSources(input,now=new Date().toISOString()){
  let records=Array.isArray(input.records)?input.records.slice():[];const date=input.date;const add=(candidate)=>{const outcome=upsertAnkiCandidate(records,{date,status:"candidate",priority:"medium",...candidate},now);records=outcome.records;};
  (input.wordRecords||[]).filter(r=>r.date===date).forEach(r=>[...(r.errorWords||[]),...(r.familiarRareMeanings||[]),...(r.collocations||[])].forEach(word=>add({subject:"english",sourceType:"reading-word",sourceId:r.recordId,front:word,back:r.nextAction||"请补充释义或用法",tags:["english"]})));
  (input.politicsRecords||[]).filter(r=>r.date===date).forEach(r=>(r.weakPoints||[]).filter(p=>["K","M"].includes(p.reasonCode)).forEach(p=>add({subject:"politics",sourceType:"politics-error",sourceId:r.recordId,front:p.knowledgePoint,back:`错因：${p.reasonCode}`,tags:["politics",p.reasonCode],priority:"high"})));
  Object.values(input.professionalUnits||{}).flat().forEach(unit=>(unit.mainGaps||[]).slice(0,3).forEach(gap=>add({subject:unit.subject,sourceType:"review-gap",sourceId:unit.unitId,front:gap,back:unit.nextStart||"待补充",tags:[unit.subject],priority:"high"})));
  (input.outputRecords||[]).filter(r=>r.date===date).forEach(r=>(r.mainProblems||[]).slice(0,3).forEach(problem=>add({subject:r.subject,sourceType:"essay-output",sourceId:r.recordId,front:problem,back:r.nextAction||"重写时修正",tags:[r.subject,"output"]})));
  return records;
}
