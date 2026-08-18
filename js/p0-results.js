// P0 Checkpoint 2: formal review queue and 722/844 knowledge-unit results.
const REVIEW_LEVEL_OFFSETS = Object.freeze({ D0: 0, D1: 1, D3: 3, D7: 7, D14: 14, D30: 30 });
const REVIEW_LEVELS = Object.freeze(Object.keys(REVIEW_LEVEL_OFFSETS));
const REVIEW_RESULTS = Object.freeze({ passed: "通过", partial: "部分通过", failed: "未通过", unverified: "未验收" });
const REVIEW_STATUSES = new Set(["pending", "completed", "rescheduled", "cancelled"]);
const REVIEW_TYPES = new Set(["spaced", "short-retest", "output-rewrite", "option-trap", "politics-knowledge"]);
const MASTERY_LEVELS = new Set(["L0", "L1", "L2", "L3", "L4", "L5"]);
const PROFESSIONAL_ACTUAL_PROGRESS_LIMIT = 6000;
const PROFESSIONAL_CLOSED_BOOK_LIMIT = 4000;
const PROFESSIONAL_NEXT_START_LIMIT = 2000;
const REVIEW_ROUND_MINUTES = 5;
const DEFAULT_REVIEW_BUDGET_MINUTES = 30;
const MAX_REVIEW_BUDGET_MINUTES = 45;

function resultText(value, limit = 240) {
  return String(value ?? "").trim().slice(0, limit);
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function addDateDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createResultId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stableKnowledgeUnitId(subject, name) {
  const normalized = resultText(name, 160).toLocaleLowerCase().replace(/\s+/g, " ");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${subject}-${(hash >>> 0).toString(36)}`;
}

function buildReviewKey(subject, knowledgeUnitId, reviewLevel) {
  return `${resultText(subject, 20)}:${resultText(knowledgeUnitId, 100)}:${resultText(reviewLevel, 30)}`;
}

function normalizeReviewEvidence(input, savedAt = "") {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const evidence = {
    remembered: resultText(source.remembered, 1000),
    gaps: resultText(source.gaps, 1000),
    nextAction: resultText(source.nextAction, 500),
    savedAt: resultText(source.savedAt || savedAt, 40),
  };
  return evidence.remembered || evidence.gaps || evidence.nextAction ? evidence : null;
}

function parseReviewEvidenceQuickRecord(value) {
  const fields = {};
  String(value || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(记住了|遗漏了|下一步)\s*[=＝:：]\s*(.*)\s*$/);
    if (match) fields[match[1]] = match[2].trim();
  });
  return normalizeReviewEvidence({
    remembered: fields["记住了"],
    gaps: fields["遗漏了"],
    nextAction: fields["下一步"],
  });
}

function validateReviewEvidence(input) {
  const evidence = normalizeReviewEvidence(input);
  if (!evidence || !evidence.remembered) return { valid: false, message: "请先填写“记住了”，留下本次闭卷恢复内容。" };
  if (!evidence.gaps) return { valid: false, message: "请填写“遗漏了”；没有明显遗漏时填写“无”。" };
  if (!evidence.nextAction) return { valid: false, message: "请填写“下一步”，避免下次重新判断。" };
  return { valid: true, evidence };
}

function buildReviewEvidenceQuickTemplate(evidence) {
  const normalized = normalizeReviewEvidence(evidence) || {};
  return `记住了=${normalized.remembered || ""}\n遗漏了=${normalized.gaps || ""}\n下一步=${normalized.nextAction || ""}`;
}

function normalizeReviewRecord(record, index = 0) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const subject = ["722", "844", "english", "politics"].includes(source.subject) ? source.subject : resultText(source.subject, 20);
  const knowledgeUnitId = resultText(source.knowledgeUnitId, 100);
  const reviewLevel = REVIEW_LEVELS.includes(source.reviewLevel) || source.reviewLevel === "short-retest" ? source.reviewLevel : "D0";
  const reviewKey = resultText(source.reviewKey, 180) || buildReviewKey(subject, knowledgeUnitId, reviewLevel);
  const reviewType = REVIEW_TYPES.has(source.reviewType) ? source.reviewType : reviewLevel === "short-retest" ? "short-retest" : "spaced";
  const sourceRecordId = resultText(source.sourceRecordId, 140);
  const sourceRecordType = resultText(source.sourceRecordType, 60);
  const businessKey = resultText(source.businessKey, 240)
    || (reviewType === "spaced" || reviewType === "short-retest" ? reviewKey : `${subject}:${sourceRecordId}:${reviewType}:${knowledgeUnitId}`);
  const normalized = {
    ...source,
    reviewId: resultText(source.reviewId, 120) || `legacy-review-${index}-${reviewKey}`,
    reviewKey,
    subject,
    knowledgeUnitId,
    knowledgeUnit: resultText(source.knowledgeUnit, 160),
    reviewLevel,
    reviewType,
    sourceRecordId,
    sourceRecordType,
    businessKey,
    dueDate: isDateKey(source.dueDate) ? source.dueDate : "",
    task: resultText(source.task, 240),
    previousResult: Object.values(REVIEW_RESULTS).includes(source.previousResult) ? source.previousResult : "未验收",
    status: REVIEW_STATUSES.has(source.status) ? source.status : "pending",
    sourceTaskId: resultText(source.sourceTaskId, 120),
    createdAt: resultText(source.createdAt, 40),
    updatedAt: resultText(source.updatedAt, 40),
  };
  const completionEvidence = normalizeReviewEvidence(source.completionEvidence);
  if (completionEvidence) normalized.completionEvidence = completionEvidence;
  else delete normalized.completionEvidence;
  return normalized;
}

function normalizeReviewQueueRecords(records) {
  if (!Array.isArray(records)) return [];
  const normalized = records.map(normalizeReviewRecord);
  const groups = new Map();
  normalized.forEach((record) => {
    const key = record.businessKey || record.reviewKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const statusRank = { pending: 4, completed: 3, rescheduled: 2, cancelled: 1 };
  groups.forEach((items) => {
    if (items.length < 2) return;
    items.sort((a, b) => (statusRank[b.status] || 0) - (statusRank[a.status] || 0)
      || String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    items.slice(1).forEach((record) => {
      record.status = "cancelled";
      record.duplicateOf = items[0].reviewId;
    });
  });
  return normalized;
}

function upsertReviewRecord(queue, input, now = new Date().toISOString()) {
  const records = normalizeReviewQueueRecords(queue);
  const patch = normalizeReviewRecord({ ...input, updatedAt: now });
  let current = records.find((record) => record.businessKey === patch.businessKey && record.status !== "cancelled");
  if (!current) current = records.find((record) => record.businessKey === patch.businessKey);
  if (current) {
    const reviewId = current.reviewId;
    Object.assign(current, patch, { reviewId, duplicateOf: undefined, updatedAt: now });
    return { records, record: current, created: false };
  }
  const record = { ...patch, reviewId: patch.reviewId || createResultId("review"), createdAt: patch.createdAt || now, updatedAt: now };
  records.push(record);
  return { records, record, created: true };
}

function ensureReviewSchedule(queue, unit, studyDate, now = new Date().toISOString()) {
  let records = normalizeReviewQueueRecords(queue);
  REVIEW_LEVELS.forEach((reviewLevel) => {
    const reviewKey = buildReviewKey(unit.subject, unit.unitId, reviewLevel);
    const existing = records.find((record) => record.reviewKey === reviewKey && record.status !== "cancelled");
    if (existing) {
      existing.knowledgeUnit = unit.name;
      existing.sourceTaskId = unit.sourceTaskId || existing.sourceTaskId;
      return;
    }
    records = upsertReviewRecord(records, {
      reviewKey,
      subject: unit.subject,
      knowledgeUnitId: unit.unitId,
      knowledgeUnit: unit.name,
      reviewLevel,
      reviewType: "spaced",
      dueDate: addDateDays(studyDate, REVIEW_LEVEL_OFFSETS[reviewLevel]),
      task: `复述并验收：${unit.name}`,
      previousResult: "未验收",
      status: "pending",
      sourceTaskId: unit.sourceTaskId || "",
      createdAt: now,
    }, now).records;
  });
  return records;
}

function ensureNextReview(records, current, now) {
  if (!REVIEW_LEVELS.includes(current.reviewLevel)) return records;
  const index = REVIEW_LEVELS.indexOf(current.reviewLevel);
  if (index >= REVIEW_LEVELS.length - 1) return records;
  const nextLevel = REVIEW_LEVELS[index + 1];
  const nextKey = buildReviewKey(current.subject, current.knowledgeUnitId, nextLevel);
  if (records.some((record) => record.reviewKey === nextKey && record.status !== "cancelled")) return records;
  const gap = REVIEW_LEVEL_OFFSETS[nextLevel] - REVIEW_LEVEL_OFFSETS[current.reviewLevel];
  return upsertReviewRecord(records, {
    reviewKey: nextKey,
    subject: current.subject,
    knowledgeUnitId: current.knowledgeUnitId,
    knowledgeUnit: current.knowledgeUnit,
    reviewLevel: nextLevel,
    dueDate: addDateDays(current.dueDate, gap),
    task: current.task,
    previousResult: "未验收",
    status: "pending",
    sourceTaskId: current.sourceTaskId,
    createdAt: now,
  }, now).records;
}

function applyReviewResult(queue, reviewId, resultCode, today, now = new Date().toISOString(), evidenceInput = null) {
  let records = normalizeReviewQueueRecords(queue);
  const current = records.find((record) => record.reviewId === reviewId);
  if (!current) return { records, changed: false, message: "未找到复盘任务。" };
  const result = REVIEW_RESULTS[resultCode];
  if (!result) return { records, changed: false, message: "复盘结果无效。" };
  if (resultCode !== "unverified") {
    const evidenceValidation = validateReviewEvidence(evidenceInput);
    if (!evidenceValidation.valid) return { records, changed: false, message: evidenceValidation.message };
    current.completionEvidence = normalizeReviewEvidence(evidenceValidation.evidence, now);
  }
  current.previousResult = result;
  current.updatedAt = now;
  delete current.needsRecalculation;
  if (resultCode === "unverified") {
    current.status = "pending";
    delete current.completedAt;
    delete current.completedDate;
    return { records, changed: true, message: "已保留为待验收，不会自动进入下一层。" };
  }
  current.status = "completed";
  current.completedAt = now;
  current.completedDate = today;
  if (!["spaced", "short-retest"].includes(current.reviewType)) {
    return { records, changed: true, message: "业务复盘任务已完成，不会生成间隔复盘层级。" };
  }
  if (resultCode === "passed") {
    records = ensureNextReview(records, current, now);
    return { records, changed: true, message: "本层已通过，后续复盘任务已保留。" };
  }
  if (resultCode === "partial") {
    records = ensureNextReview(records, current, now);
    records = upsertReviewRecord(records, {
      reviewKey: buildReviewKey(current.subject, current.knowledgeUnitId, "short-retest"),
      subject: current.subject,
      knowledgeUnitId: current.knowledgeUnitId,
      knowledgeUnit: current.knowledgeUnit,
      reviewLevel: "short-retest",
      reviewType: "short-retest",
      dueDate: addDateDays(today, 1),
      dueAt: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      task: `短时重测：${current.knowledgeUnit}`,
      previousResult: "未验收",
      status: "pending",
      sourceTaskId: current.sourceTaskId,
      createdAt: now,
    }, now).records;
    return { records, changed: true, message: "已安排 24 小时内短时重测，原后续复盘保留。" };
  }
  const currentOffset = REVIEW_LEVEL_OFFSETS[current.reviewLevel] ?? -1;
  records.forEach((record) => {
    if (record.subject !== current.subject || record.knowledgeUnitId !== current.knowledgeUnitId) return;
    const offset = REVIEW_LEVEL_OFFSETS[record.reviewLevel];
    if (Number.isFinite(offset) && offset > currentOffset) {
      record.status = "rescheduled";
      record.needsRecalculation = true;
      record.updatedAt = now;
    }
  });
  records = upsertReviewRecord(records, {
    reviewKey: buildReviewKey(current.subject, current.knowledgeUnitId, "D0"), subject: current.subject,
    knowledgeUnitId: current.knowledgeUnitId, knowledgeUnit: current.knowledgeUnit, reviewLevel: "D0",
    dueDate: today, task: `重新 D0 验收：${current.knowledgeUnit}`, previousResult: "未通过",
    status: "pending", sourceTaskId: current.sourceTaskId, createdAt: now,
  }, now).records;
  records = upsertReviewRecord(records, {
    reviewKey: buildReviewKey(current.subject, current.knowledgeUnitId, "D1"), subject: current.subject,
    knowledgeUnitId: current.knowledgeUnitId, knowledgeUnit: current.knowledgeUnit, reviewLevel: "D1",
    dueDate: addDateDays(today, 1), task: `次日重新 D1：${current.knowledgeUnit}`, previousResult: "未验收",
    status: "pending", sourceTaskId: current.sourceTaskId, createdAt: now,
  }, now).records;
  return { records, changed: true, message: "该知识点已重置为 D0，后续层级等待重新计算。" };
}

function rescheduleReview(queue, reviewId, dueDate, now = new Date().toISOString()) {
  const records = normalizeReviewQueueRecords(queue);
  const current = records.find((record) => record.reviewId === reviewId);
  if (!current || !isDateKey(dueDate)) return { records, changed: false };
  current.dueDate = dueDate;
  current.status = "pending";
  current.updatedAt = now;
  delete current.needsRecalculation;
  return { records, changed: true };
}

function getDueReviews(queue, today) {
  const priority = { D30: 90, D14: 80, D7: 70, D3: 60, D1: 50, D0: 45, "short-retest": 40 };
  return normalizeReviewQueueRecords(queue)
    .filter((record) => record.status === "pending" && isDateKey(record.dueDate) && record.dueDate <= today)
    .sort((a, b) => ((b.reviewLevel === "short-retest" && b.dueDate < today) ? 100 : priority[b.reviewLevel] || 0)
      - ((a.reviewLevel === "short-retest" && a.dueDate < today) ? 100 : priority[a.reviewLevel] || 0)
      || a.dueDate.localeCompare(b.dueDate) || a.reviewKey.localeCompare(b.reviewKey));
}

function getReviewTaskBudgetMinutes(input = {}) {
  const options = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const task = options.task && typeof options.task === "object" ? options.task : options.category === "rollingReview" ? options : null;
  const explicitMinutes = Math.floor(Number(options.budgetMinutes) || 0);
  const match = String(task && task.time || "").match(/(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/);
  let minutes = explicitMinutes;
  if (!minutes && match) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) end += 24 * 60;
    minutes = end - start;
  }
  const bounded = Math.min(MAX_REVIEW_BUDGET_MINUTES, Math.max(REVIEW_ROUND_MINUTES, minutes || DEFAULT_REVIEW_BUDGET_MINUTES));
  return Math.max(REVIEW_ROUND_MINUTES, Math.floor(bounded / REVIEW_ROUND_MINUTES) * REVIEW_ROUND_MINUTES);
}

function getReviewExecutionState(queue, today, options = {}) {
  const records = normalizeReviewQueueRecords(queue);
  const due = getDueReviews(records, today);
  const completedToday = records.filter((record) => record.status === "completed"
    && record.completedDate === today
    && isDateKey(record.dueDate)
    && record.dueDate <= today);
  const budgetMinutes = getReviewTaskBudgetMinutes(options);
  const budgetTaskCount = Math.max(1, Math.floor(budgetMinutes / REVIEW_ROUND_MINUTES));
  const completedCount = Math.min(budgetTaskCount, completedToday.length);
  const remainingBudgetCount = Math.max(0, budgetTaskCount - completedCount);
  const todayBatch = due.slice(0, remainingBudgetCount);
  const backlog = due.slice(todayBatch.length);
  return {
    due,
    todayBatch,
    backlog,
    active: todayBatch[0] || null,
    upcoming: todayBatch.slice(1),
    completedToday,
    completedCount,
    completedExtraCount: Math.max(0, completedToday.length - completedCount),
    remainingCount: todayBatch.length,
    backlogCount: backlog.length,
    allDueCount: due.length,
    totalCount: completedCount + todayBatch.length,
    budgetMinutes,
    budgetTaskCount,
    budgetUsedMinutes: Math.min(budgetMinutes, completedToday.length * REVIEW_ROUND_MINUTES),
    budgetRemainingMinutes: Math.max(0, budgetMinutes - completedToday.length * REVIEW_ROUND_MINUTES),
  };
}

function getReviewWorkloadForPlan(queue, today, plan) {
  const tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
  const task = tasks.find((item) => item && item.category === "rollingReview") || null;
  return getReviewExecutionState(queue, today, { task });
}

function getReviewScheduleGate(task, options = {}) {
  const match = String(task && task.time || "").match(/(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/);
  const nowMinutes = Number(options.nowMinutes);
  const cutoffMinutes = Number(options.cutoffMinutes);
  if (!match || !Number.isFinite(nowMinutes)) {
    return {
      allowed: false,
      state: "unavailable",
      startMinutes: null,
      endMinutes: null,
      message: "今日计划中没有可核验的复盘时间块，暂不启动新的复盘专注。",
    };
  }
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);
  const startLabel = `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  if (endMinutes <= startMinutes) {
    return {
      allowed: false,
      state: "unavailable",
      startMinutes,
      endMinutes,
      message: "复盘时间块跨日或无效，暂不启动新的复盘专注。",
    };
  }
  if (Number.isFinite(cutoffMinutes) && nowMinutes >= cutoffMinutes) {
    return {
      allowed: false,
      state: "closed",
      startMinutes,
      endMinutes,
      message: "已到晚间止损时间；今天不再开启新的复盘专注。",
    };
  }
  if (nowMinutes < startMinutes) {
    return {
      allowed: false,
      state: "waiting",
      startMinutes,
      endMinutes,
      message: `复盘入口将在 ${startLabel} 开放；当前先按时间表完成正在进行的任务。`,
    };
  }
  return {
    allowed: true,
    state: nowMinutes < endMinutes ? "active" : "catch-up",
    startMinutes,
    endMinutes,
    message: nowMinutes < endMinutes
      ? "复盘时间块进行中；可以开始5分钟或直接自由专注。"
      : "复盘原时间块已结束；晚间止损前仍可补做。",
  };
}

function getCurrentReviewScheduleGate(plan, now = new Date()) {
  const tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
  const task = tasks.find((item) => item && item.category === "rollingReview") || null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const schedule = typeof getNightExecutionSchedule === "function"
    ? getNightExecutionSchedule(plan, now)
    : { cutoffMinutes: (plan && plan.template === "sunday") || now.getDay() === 0 ? 20 * 60 + 30 : 21 * 60 + 40 };
  return getReviewScheduleGate(task, { nowMinutes, cutoffMinutes: schedule.cutoffMinutes });
}

function validateRollingReviewCompletion(task, queue, today) {
  if (!task || task.category !== "rollingReview") return { valid: true, message: "" };
  const state = getReviewExecutionState(queue, today, { task });
  return state.remainingCount
    ? { valid: false, message: `今日复习预算内还有 ${state.remainingCount} 条未保存结果，请先处理当前复盘。` }
    : state.backlogCount
      ? { valid: true, message: `今日${state.budgetMinutes}分钟复习预算已完成；另有 ${state.backlogCount} 条积压保留到后续。` }
      : { valid: true, message: state.completedCount ? "今日复习批次已完成。" : "今日没有到期复盘。" };
}

function normalizeProfessionalResultsStore(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (source.schemaVersion === 1 && source.days && typeof source.days === "object" && !Array.isArray(source.days)) return { ...source, schemaVersion: 1, days: source.days };
  const days = {};
  const legacy = {};
  Object.entries(source).forEach(([key, entry]) => {
    if (isDateKey(key) && entry && typeof entry === "object" && !Array.isArray(entry)) days[key] = entry;
    else legacy[key] = entry;
  });
  return { schemaVersion: 1, days, ...(Object.keys(legacy).length ? { legacy } : {}) };
}

function splitResultList(value) {
  return String(value || "").split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

const PROFESSIONAL_QUICK_TEMPLATE = [
  "科目=722",
  "实际推进=",
  "闭卷产物=",
  "下一起点=",
  "",
  "科目=844",
  "实际推进=",
  "闭卷产物=",
  "下一起点=",
].join("\n");

function buildProfessionalSubjectQuickTemplate(subject) {
  const subjectCode = String(subject || "").trim();
  if (!["722", "844"].includes(subjectCode)) return "";
  return `科目=${subjectCode}\n实际推进=\n闭卷产物=\n下一起点=`;
}

function isUntouchedProfessionalQuickTemplate(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!text) return true;
  return text === PROFESSIONAL_QUICK_TEMPLATE.trim()
    || ["722", "844"].some((subject) => text === buildProfessionalSubjectQuickTemplate(subject));
}

function getProfessionalQuickDraftSubject(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const subjects = new Set();
  text.split(/\r?\n/).forEach((line) => {
    const normalized = line.trim();
    const blockSubject = normalized.match(/^科目\s*[=＝:：]\s*(722|844)\s*$/)?.[1];
    const inlineSubject = normalized.match(/^(722|844)\s*[｜|]/)?.[1];
    const subject = blockSubject || inlineSubject;
    if (subject) subjects.add(subject);
  });
  if (subjects.size === 1) return Array.from(subjects)[0];
  return subjects.size > 1 ? "mixed" : "unknown";
}

const PROFESSIONAL_QUICK_FIELD_ALIASES = Object.freeze({
  单元: "name", 知识单元: "name", 实际推进: "name",
  掌握: "mastery", 掌握度: "mastery",
  验收: "reviewResult", 复盘结果: "reviewResult",
  闭卷: "closedBookResult", 闭卷复述: "closedBookResult", 闭卷产物: "closedBookResult",
  重构: "writtenReconstruction", 书面重构: "writtenReconstruction",
  原著: "originalTextUsage", 原著调用: "originalTextUsage",
  缺口: "mainGaps", 主要遗漏: "mainGaps",
  必背: "mustMemorize", 必须记忆: "mustMemorize",
  下一步: "nextStart", 下一起点: "nextStart",
});

function normalizeQuickReviewResult(value) {
  const text = resultText(value, 20).replace(/\s+/g, "");
  const mapping = { 通过: "通过", 部分: "部分通过", 部分通过: "部分通过", 未通过: "未通过", 未验收: "未验收" };
  return mapping[text] || text;
}

function createMinimalProfessionalInput(subject) {
  return {
    subject, name: "", mastery: "L0", reviewResult: "未验收", closedBookResult: "",
    writtenReconstruction: "", originalTextUsage: "", mainGaps: [], mustMemorize: [], nextStart: "",
  };
}

function assignProfessionalQuickField(input, label, value) {
  const field = PROFESSIONAL_QUICK_FIELD_ALIASES[label];
  if (!field) return;
  const text = String(value || "").trim().replace(/^_+|_+$/g, "").trim();
  if (["mainGaps", "mustMemorize"].includes(field)) input[field] = splitResultList(text);
  else input[field] = field === "reviewResult" ? normalizeQuickReviewResult(text) : text;
}

function appendProfessionalQuickField(input, label, value) {
  const field = PROFESSIONAL_QUICK_FIELD_ALIASES[label];
  if (!field) return false;
  const previous = Array.isArray(input[field]) ? input[field].join("\n") : String(input[field] || "");
  assignProfessionalQuickField(input, label, [previous, String(value || "").trim()].filter(Boolean).join("\n"));
  return true;
}

function validateProfessionalQuickInputs(inputs) {
  if (!inputs.length) throw new Error("没有识别到 722 或 844 记录，请保留“科目=722”或“科目=844”。");
  inputs.forEach((input) => {
    const validation = validateProfessionalUnit(input);
    if (!validation.valid) throw new Error(`${input.subject}：${validation.message}`);
  });
  return inputs;
}

function parseProfessionalBlockQuickRecord(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim());
  const inputs = [];
  const seenSubjects = new Set();
  let current = null;
  let currentFieldLabel = "";
  lines.forEach((line) => {
    if (!line) return;
    const subject = line.match(/^科目\s*[=：:]\s*(722|844)$/)?.[1];
    if (subject) {
      if (seenSubjects.has(subject)) throw new Error(`${subject} 出现了重复记录，请合并为一个模块。`);
      seenSubjects.add(subject);
      current = createMinimalProfessionalInput(subject);
      currentFieldLabel = "";
      inputs.push(current);
      return;
    }
    if (!current) return;
    const separator = line.search(/[=：:]/);
    if (separator >= 0) {
      const label = line.slice(0, separator).trim();
      if (PROFESSIONAL_QUICK_FIELD_ALIASES[label]) {
        assignProfessionalQuickField(current, label, line.slice(separator + 1));
        currentFieldLabel = label;
        return;
      }
    }
    if (currentFieldLabel) appendProfessionalQuickField(current, currentFieldLabel, line);
  });
  return validateProfessionalQuickInputs(inputs);
}

function parseProfessionalInlineQuickRecord(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const inputs = [];
  const seenSubjects = new Set();
  lines.forEach((line) => {
    const parts = line.split(/[｜|]/).map((part) => part.trim()).filter(Boolean);
    const subject = parts[0] && parts[0].match(/^(722|844)$/)?.[1];
    if (!subject) return;
    if (seenSubjects.has(subject)) throw new Error(`${subject} 出现了重复记录，请合并为一行。`);
    seenSubjects.add(subject);
    const input = {
      subject, name: "", mastery: "", reviewResult: "", closedBookResult: "",
      writtenReconstruction: "", originalTextUsage: "", mainGaps: [], mustMemorize: [], nextStart: "",
    };
    parts.slice(1).forEach((part) => {
      const separator = part.search(/[=：:]/);
      if (separator < 0) return;
      const label = part.slice(0, separator).trim();
      assignProfessionalQuickField(input, label, part.slice(separator + 1));
    });
    inputs.push(input);
  });
  return validateProfessionalQuickInputs(inputs);
}

function parseProfessionalQuickRecord(value) {
  const text = String(value || "");
  return /^\s*科目\s*[=：:]\s*(722|844)\s*$/m.test(text)
    ? parseProfessionalBlockQuickRecord(text)
    : parseProfessionalInlineQuickRecord(text);
}

function validateProfessionalUnit(input) {
  const mainGaps = Array.isArray(input.mainGaps) ? input.mainGaps.filter(Boolean) : splitResultList(input.mainGaps);
  if (!["722", "844"].includes(input.subject)) return { valid: false, message: "请选择 722 或 844。" };
  if (!resultText(input.name, 160)) return { valid: false, message: "请填写实际完成的知识点。" };
  if (!MASTERY_LEVELS.has(input.mastery)) return { valid: false, message: "请选择掌握等级 L0—L5。" };
  if (!Object.values(REVIEW_RESULTS).includes(input.reviewResult)) return { valid: false, message: "请选择复盘结果。" };
  if (!mainGaps.length && !(input.mastery === "L0" && input.reviewResult === "未验收")) {
    return { valid: false, message: "请填写主要遗漏；如果没有，请明确填写“无”。" };
  }
  if (!resultText(input.nextStart, 240)) return { valid: false, message: "请填写下一准确起点。" };
  if (Number(input.mastery.slice(1)) > 2 && (!resultText(input.closedBookResult, 500) || input.reviewResult === "未验收")) {
    return { valid: false, message: "L3—L5 必须已有闭卷验收结果；未验收内容最高只能记录为 L2。" };
  }
  return { valid: true };
}

function hasProfessionalClosedBookProduct(unit) {
  const output = resultText(unit && unit.closedBookResult, 500).replace(/\s+/g, "");
  return Boolean(
    unit
    && ["722", "844"].includes(unit.subject)
    && resultText(unit.name, 160)
    && resultText(unit.nextStart, 240)
    && output
    && !/^(无|没有|未做|未完成|未记录|否)$/.test(output)
  );
}

function getProfessionalSubject(task) {
  if (!task) return "";
  if (task.category === "maYuan" || /722/.test(`${task.id || ""} ${task.name || ""}`)) return "722";
  if (task.category === "maHistory" || /844/.test(`${task.id || ""} ${task.name || ""}`)) return "844";
  return "";
}

function formatProfessionalTaskSummary(units) {
  const records = Array.isArray(units) ? units.filter((unit) => unit && typeof unit === "object") : [];
  if (!records.length) return "实际：未记录";
  const latest = records.at(-1);
  const prefix = records.length > 1 ? `实际：今日${records.length}项｜最新：` : "实际：";
  const masteryReview = latest.mastery === "L0" && latest.reviewResult === "未验收"
    ? "掌握待复盘验收"
    : `${resultText(latest.mastery, 20) || "掌握未记录"} · ${resultText(latest.reviewResult, 40) || "未验收"}`;
  return `${prefix}${resultText(latest.name, 160) || "知识单元未命名"} · ${masteryReview}`
    + `｜闭卷：${resultText(latest.closedBookResult, 180) || "未记录"}`
    + `｜下一步：${resultText(latest.nextStart, 180) || "未记录"}`;
}

function readProfessionalStore() {
  return normalizeProfessionalResultsStore(readJson(professionalResultsKey, {}));
}

function getProfessionalUnits(dateKey, subject) {
  const store = readProfessionalStore();
  const record = store.days[dateKey] && store.days[dateKey][subject];
  return record && Array.isArray(record.units) ? record.units : [];
}

function openProfessionalTaskRecord(task) {
  const subjectCode = getProfessionalSubject(task);
  const panel = document.querySelector("#professionalResultsPanel");
  const subject = document.querySelector("#professionalSubject");
  const quickRecord = document.querySelector("#professionalQuickRecord");
  if (!subjectCode || !panel || !quickRecord) return false;
  panel.open = true;
  const insertedTemplate = !quickRecord.value.trim() || isUntouchedProfessionalQuickTemplate(quickRecord.value);
  const draftSubject = getProfessionalQuickDraftSubject(quickRecord.value);
  if (!insertedTemplate && draftSubject !== subjectCode) {
    const draftLabel = draftSubject === "mixed" ? "722 与 844 混合" : draftSubject === "unknown" ? "无法识别科目" : draftSubject;
    setStatus("#professionalQuickStatus", `记录框中有${draftLabel}草稿；原文已保留。请先保存或清空，再进入 ${subjectCode} 记录。`, true);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    quickRecord.focus();
    return false;
  }
  if (subject) subject.value = subjectCode;
  if (insertedTemplate) quickRecord.value = buildProfessionalSubjectQuickTemplate(subjectCode);
  setStatus(
    "#professionalQuickStatus",
    insertedTemplate
      ? `已填入 ${subjectCode} 单科模板；请按真实结果填写后保存。`
      : `已定位 ${subjectCode} 结果；记录框原有内容已保留。`,
  );
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  quickRecord.focus();
  if (insertedTemplate && typeof quickRecord.setSelectionRange === "function") {
    const unitStart = quickRecord.value.indexOf("实际推进=") + "实际推进=".length;
    quickRecord.setSelectionRange(unitStart, unitStart);
  }
  return true;
}

function appendProfessionalTaskSummary(task, content, controls) {
  const subject = getProfessionalSubject(task);
  if (!subject || !content) return;
  const summary = document.createElement("div");
  summary.className = "p1-result-summary";
  summary.textContent = formatProfessionalTaskSummary(getProfessionalUnits(getDateKey(), subject));
  content.appendChild(summary);
  if (controls && typeof createTaskButton === "function") {
    controls.appendChild(createTaskButton("记录实际结果", "professional-result", task.id));
  }
}

function validateProfessionalTaskCompletion(task, dateKey = getDateKey()) {
  const subject = getProfessionalSubject(task);
  if (!subject) return { valid: true };
  const units = getProfessionalUnits(dateKey, subject);
  if (!units.length) return { valid: false, message: `${subject} 任务完成前，请先保存至少一个知识单元结果。` };
  return units.some((unit) => validateProfessionalUnit(unit).valid && hasProfessionalClosedBookProduct(unit))
    ? { valid: true }
    : { valid: false, message: `${subject} 已保存推进记录，但尚无真实闭卷产物，任务保持进行中。` };
}

function getProfessionalProgressSnapshot(dateKey = getDateKey()) {
  return Object.fromEntries(["722", "844"].map((subject) => {
    const units = getProfessionalUnits(dateKey, subject);
    return [subject, {
      actualUnits: units.map((unit) => unit.name),
      mastery: units.map((unit) => ({ unitId: unit.unitId, name: unit.name, level: unit.mastery })),
      mainGaps: units.flatMap((unit) => Array.isArray(unit.mainGaps) ? unit.mainGaps : []),
      nextStart: units.map((unit) => unit.nextStart).filter(Boolean).at(-1) || "",
    }];
  }));
}

function getReviewSnapshot(dateKey = getDateKey()) {
  const queue = normalizeReviewQueueRecords(readJson(reviewQueueKey, []));
  return {
    completed: queue.filter((record) => record.completedDate === dateKey),
    dueNextDay: queue.filter((record) => record.status === "pending" && record.dueDate === addDateDays(dateKey, 1)),
  };
}

function clearProfessionalForm() {
  document.querySelector("#professionalUnitId").value = "";
  ["#professionalUnitName", "#professionalClosedBook", "#professionalReconstruction", "#professionalOriginalText", "#professionalGaps", "#professionalMustMemorize", "#professionalNextStart"]
    .forEach((selector) => { document.querySelector(selector).value = ""; });
  document.querySelector("#professionalMastery").value = "L0";
  document.querySelector("#professionalReviewResult").value = "unverified";
}

function fillProfessionalForm(input) {
  document.querySelector("#professionalUnitId").value = "";
  document.querySelector("#professionalSubject").value = input.subject;
  document.querySelector("#professionalUnitName").value = input.name;
  document.querySelector("#professionalMastery").value = input.mastery;
  document.querySelector("#professionalReviewResult").value = Object.entries(REVIEW_RESULTS).find(([, label]) => label === input.reviewResult)?.[0] || "unverified";
  document.querySelector("#professionalClosedBook").value = input.closedBookResult;
  document.querySelector("#professionalReconstruction").value = input.writtenReconstruction;
  document.querySelector("#professionalOriginalText").value = input.originalTextUsage;
  document.querySelector("#professionalGaps").value = input.mainGaps.join("\n");
  document.querySelector("#professionalMustMemorize").value = input.mustMemorize.join("\n");
  document.querySelector("#professionalNextStart").value = input.nextStart;
}

function copyProfessionalQuickTemplate() {
  const textarea = document.querySelector("#professionalQuickRecord");
  textarea.value = PROFESSIONAL_QUICK_TEMPLATE;
  textarea.focus();
  textarea.setSelectionRange(0, 0);
  setStatus("#professionalQuickStatus", "双科模板已生成，请填写真实结果后保存记录。");
}

function saveProfessionalQuickRecord() {
  try {
    const inputs = parseProfessionalQuickRecord(document.querySelector("#professionalQuickRecord").value);
    const outcomes = inputs.map((input) => {
      fillProfessionalForm(input);
      return saveProfessionalUnit({ deferResultHandoff: true });
    });
    const completed = inputs.filter((input, index) => outcomes[index] && outcomes[index].hasClosedBookProduct).map((input) => input.subject);
    const inProgress = inputs.filter((input, index) => outcomes[index] && !outcomes[index].hasClosedBookProduct).map((input) => input.subject);
    const parts = [
      completed.length ? `${completed.join("、")} 已保存闭卷产物并完成任务` : "",
      inProgress.length ? `${inProgress.join("、")} 已保存推进记录，因无闭卷产物保持进行中` : "",
    ].filter(Boolean);
    setStatus("#professionalQuickStatus", `${parts.join("；")}。D0/D1/D3/D7/D14/D30 仍按原规则生成。`);
    const lastSavedSubject = [...completed, ...inProgress].at(-1);
    const lastSavedTask = getTodayPlan().tasks.find((task) => getProfessionalSubject(task) === lastSavedSubject);
    if (lastSavedTask && typeof showResultHandoff === "function") {
      showResultHandoff(lastSavedTask.id, `已保存：${parts.join("；")}`);
    }
  } catch (error) {
    setStatus("#professionalQuickStatus", error.message || "记录格式有误，请检查必填字段。", true);
  }
}

function updateProfessionalTaskAfterSave(subject, hasClosedBookProduct) {
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => getProfessionalSubject(item) === subject);
  if (!task) return { taskCompleted: false, taskStatus: "", hasClosedBookProduct };
  const previousStatus = getTaskStatus(task);
  if (hasClosedBookProduct
    && typeof focusTimerState !== "undefined"
    && focusTimerState.activeTaskId === task.id
    && typeof settleBeforeFocusTaskSwitch === "function") {
    settleBeforeFocusTaskSwitch("");
  }
  if (hasClosedBookProduct) {
    setTaskStatus(task, "completed");
    if (typeof clearTerminalCurrentPlanTask === "function") clearTerminalCurrentPlanTask(plan, task.id);
  } else if (previousStatus !== "in-progress") {
    setTaskStatus(task, "in-progress");
  }
  if (getTaskStatus(task) !== previousStatus) saveTodayPlan(plan);
  return { taskCompleted: getTaskStatus(task) === "completed", taskStatus: getTaskStatus(task), hasClosedBookProduct };
}

function saveProfessionalUnit(options = {}) {
  const resultCode = document.querySelector("#professionalReviewResult").value;
  const input = {
    subject: document.querySelector("#professionalSubject").value,
    name: document.querySelector("#professionalUnitName").value,
    mastery: document.querySelector("#professionalMastery").value,
    reviewResult: REVIEW_RESULTS[resultCode] || "",
    closedBookResult: document.querySelector("#professionalClosedBook").value,
    writtenReconstruction: document.querySelector("#professionalReconstruction").value,
    originalTextUsage: document.querySelector("#professionalOriginalText").value,
    mainGaps: splitResultList(document.querySelector("#professionalGaps").value),
    mustMemorize: splitResultList(document.querySelector("#professionalMustMemorize").value),
    nextStart: document.querySelector("#professionalNextStart").value,
  };
  const validation = validateProfessionalUnit(input);
  if (!validation.valid) return setStatus("#professionalResultStatus", validation.message, true);
  const now = new Date().toISOString();
  const dateKey = getDateKey();
  const sourceTask = getTodayPlan().tasks.find((task) => getProfessionalSubject(task) === input.subject);
  const unitId = document.querySelector("#professionalUnitId").value || stableKnowledgeUnitId(input.subject, input.name);
  const store = readProfessionalStore();
  if (!store.days[dateKey]) store.days[dateKey] = {};
  if (!store.days[dateKey][input.subject]) store.days[dateKey][input.subject] = { subject: input.subject, units: [] };
  const units = Array.isArray(store.days[dateKey][input.subject].units) ? store.days[dateKey][input.subject].units : [];
  const existing = units.find((unit) => unit.unitId === unitId);
  const unit = {
    ...(existing || {}), unitId, name: resultText(input.name, 160), actualProgress: resultText(input.name, PROFESSIONAL_ACTUAL_PROGRESS_LIMIT), subject: input.subject,
    sourceTaskId: sourceTask ? sourceTask.id : "", status: input.reviewResult === "通过" ? "通过" : input.reviewResult === "部分通过" ? "部分通过" : "已学习待验收",
    mastery: input.mastery, reviewResult: input.reviewResult, closedBookResult: resultText(input.closedBookResult, PROFESSIONAL_CLOSED_BOOK_LIMIT),
    writtenReconstruction: resultText(input.writtenReconstruction, 500), originalTextUsage: resultText(input.originalTextUsage, 500),
    mainGaps: input.mainGaps, mustMemorize: input.mustMemorize, nextStart: resultText(input.nextStart, PROFESSIONAL_NEXT_START_LIMIT),
    createdAt: existing && existing.createdAt ? existing.createdAt : now, updatedAt: now,
  };
  if (existing) Object.assign(existing, unit); else units.push(unit);
  store.days[dateKey][input.subject] = { subject: input.subject, units, updatedAt: now };
  writeJson(professionalResultsKey, store);
  let queue = ensureReviewSchedule(readJson(reviewQueueKey, []), unit, dateKey, now);
  const d0 = queue.find((record) => record.reviewKey === buildReviewKey(unit.subject, unit.unitId, "D0"));
  if (d0 && !(d0.status === "completed" && d0.previousResult === unit.reviewResult)) {
    const evidence = {
      remembered: unit.closedBookResult,
      gaps: unit.mainGaps.length ? unit.mainGaps.join("；") : "无",
      nextAction: unit.nextStart,
    };
    queue = applyReviewResult(queue, d0.reviewId, resultCode, dateKey, now, evidence).records;
  }
  writeJson(reviewQueueKey, queue);
  const hasClosedBookProduct = getProfessionalUnits(dateKey, input.subject).some(hasProfessionalClosedBookProduct);
  const taskUpdate = updateProfessionalTaskAfterSave(input.subject, hasClosedBookProduct);
  clearProfessionalForm();
  renderTasks();
  renderDueReviews();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  setStatus(
    "#professionalResultStatus",
    `${input.subject} 知识单元结果已保存；${taskUpdate.hasClosedBookProduct ? "已留下闭卷产物，对应任务已完成" : "未留下闭卷产物，对应任务保持进行中"}；复盘层级已按 reviewKey 去重。`,
  );
  if (!options.deferResultHandoff && sourceTask && typeof showResultHandoff === "function") {
    showResultHandoff(sourceTask.id, `已保存：${input.subject} 专业课结果`);
  }
  return {
    saved: true,
    taskCompleted: taskUpdate.taskCompleted,
    taskStatus: taskUpdate.taskStatus,
    hasClosedBookProduct: taskUpdate.hasClosedBookProduct,
  };
}

function loadProfessionalUnit(subject, unitId) {
  const unit = getProfessionalUnits(getDateKey(), subject).find((item) => item.unitId === unitId);
  if (!unit) return;
  document.querySelector("#professionalSubject").value = subject;
  document.querySelector("#professionalUnitId").value = unit.unitId;
  document.querySelector("#professionalUnitName").value = unit.actualProgress || unit.name || "";
  document.querySelector("#professionalMastery").value = unit.mastery || "L0";
  document.querySelector("#professionalReviewResult").value = Object.entries(REVIEW_RESULTS).find(([, label]) => label === unit.reviewResult)?.[0] || "unverified";
  document.querySelector("#professionalClosedBook").value = unit.closedBookResult || "";
  document.querySelector("#professionalReconstruction").value = unit.writtenReconstruction || "";
  document.querySelector("#professionalOriginalText").value = unit.originalTextUsage || "";
  document.querySelector("#professionalGaps").value = (unit.mainGaps || []).join("\n");
  document.querySelector("#professionalMustMemorize").value = (unit.mustMemorize || []).join("\n");
  document.querySelector("#professionalNextStart").value = unit.nextStart || "";
  document.querySelector("#professionalResultsPanel").open = true;
  const advanced = document.querySelector(".professional-advanced-editor");
  if (advanced) advanced.open = true;
}

function renderProfessionalResults() {
  const container = document.querySelector("#professionalResultsList");
  if (!container) return;
  container.replaceChildren();
  ["722", "844"].forEach((subject) => {
    const section = document.createElement("section");
    section.className = "professional-subject-results";
    const heading = document.createElement("h4");
    heading.textContent = `${subject} 今日知识单元`;
    section.appendChild(heading);
    const units = getProfessionalUnits(getDateKey(), subject);
    if (!units.length) {
      const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "尚未记录。"; section.appendChild(empty);
    }
    units.forEach((unit) => {
      const row = document.createElement("article"); row.className = "professional-unit-row";
      const content = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = `${unit.name} · ${unit.mastery} · ${unit.reviewResult}`;
      const meta = document.createElement("span"); meta.textContent = `主要遗漏：${(unit.mainGaps || []).join("、") || "未填写"}；下一起点：${unit.nextStart || "未填写"}`;
      content.append(title, meta);
      row.append(content); section.appendChild(row);
    });
    container.appendChild(section);
  });
}

function getReviewSourceContext(review) {
  if (!review || !["722", "844"].includes(review.subject)) return null;
  const store = readProfessionalStore();
  const dates = Object.keys(store.days || {}).sort().reverse();
  for (const date of dates) {
    const subject = store.days[date] && store.days[date][review.subject];
    const units = subject && Array.isArray(subject.units) ? subject.units : [];
    const unit = units.find((item) => item && item.unitId === review.knowledgeUnitId);
    if (unit) {
      return {
        date,
        closedBookResult: resultText(unit.closedBookResult, 500),
        mainGaps: Array.isArray(unit.mainGaps) ? unit.mainGaps.map((item) => resultText(item, 180)).filter(Boolean) : [],
        nextStart: resultText(unit.nextStart, 240),
      };
    }
  }
  return null;
}

function updateReviewEvidenceUi(textarea) {
  if (!textarea) return;
  const reviewId = textarea.dataset.reviewEvidence;
  const validation = validateReviewEvidence(parseReviewEvidenceQuickRecord(textarea.value));
  const row = textarea.closest(".review-queue-active");
  if (!row) return;
  row.querySelectorAll(`[data-review-complete="${reviewId}"]`).forEach((button) => {
    button.disabled = !validation.valid;
  });
  const hint = row.querySelector("[data-review-evidence-status]");
  if (hint) hint.textContent = validation.valid ? "闭卷证据已填写，请核对上次缺口后判断结果。" : validation.message;
  const source = row.querySelector("[data-review-source-context]");
  if (source) source.hidden = !validation.valid;
}

function renderDueReviews() {
  const container = document.querySelector("#dueReviewsList");
  if (!container) return;
  const today = getDateKey();
  const plan = typeof getTodayPlan === "function" ? getTodayPlan() : null;
  const reviewTask = plan && Array.isArray(plan.tasks) ? plan.tasks.find((task) => task && task.category === "rollingReview") : null;
  const state = getReviewExecutionState(readJson(reviewQueueKey, []), today, { task: reviewTask });
  const reviewGate = getCurrentReviewScheduleGate(plan);
  container.replaceChildren();
  document.querySelector("#dueReviewsCount").textContent = state.totalCount
    ? `今日预算 ${state.completedCount} / ${state.totalCount} · 待做 ${state.remainingCount} · 历史积压 ${state.backlogCount}`
    : "今日无到期";
  if (!state.active) {
    const empty = document.createElement("div");
    empty.className = "review-queue-empty";
    const title = document.createElement("strong");
    title.textContent = state.backlogCount ? "今日复习预算已完成" : state.completedCount ? "今日复习批次已完成" : "今天没有到期复盘";
    const detail = document.createElement("span");
    detail.textContent = state.backlogCount
      ? `已真实保存 ${state.completedCount} 条结果；另有 ${state.backlogCount} 条积压保持原状态，后续继续。`
      : state.completedCount ? `已真实保存 ${state.completedCount} 条复盘结果。` : "不生成复盘结果，也不需要额外操作。";
    empty.append(title, detail);
    container.appendChild(empty);
    if (state.backlogCount) appendReviewBacklog(container, state, today);
    return;
  }
  const review = state.active;
  const row = document.createElement("article");
  row.className = `due-review-row review-queue-active${review.dueDate < today ? " is-overdue" : ""}`;
  row.tabIndex = -1;
  const content = document.createElement("div");
  const marker = document.createElement("span");
  marker.className = "review-queue-marker";
  marker.textContent = `当前只做这一条 · 本轮 ${state.completedCount + 1}/${state.totalCount}`;
  const title = document.createElement("strong");
  title.textContent = `${review.reviewLevel} · ${review.subject} · ${review.knowledgeUnit || review.task}`;
  const meta = document.createElement("span");
  meta.textContent = `${review.dueDate < today ? `已逾期 · 原定 ${review.dueDate}` : "今日到期"} · ${review.task}`;
  const scheduleGate = document.createElement("p");
  scheduleGate.className = `review-schedule-gate is-${reviewGate.state}`;
  scheduleGate.textContent = reviewGate.message;
  content.append(marker, title, meta, scheduleGate);
  const start = document.createElement("button");
  start.type = "button";
  start.className = "button primary review-start-button";
  start.textContent = "开始5分钟遮挡复述";
  start.dataset.reviewStart = review.reviewId;
  start.dataset.reviewFocusMode = "five-minute";
  start.disabled = !reviewGate.allowed;
  start.title = reviewGate.allowed ? "" : reviewGate.message;
  const freeFocus = document.createElement("button");
  freeFocus.type = "button";
  freeFocus.className = "button secondary review-free-focus-button";
  freeFocus.textContent = "直接自由专注";
  freeFocus.dataset.reviewStart = review.reviewId;
  freeFocus.dataset.reviewFocusMode = "free";
  freeFocus.disabled = !reviewGate.allowed;
  freeFocus.title = reviewGate.allowed ? "" : reviewGate.message;
  const startActions = document.createElement("div");
  startActions.className = "button-row review-start-actions";
  startActions.append(start, freeFocus);
  const evidenceBox = document.createElement("div");
  evidenceBox.className = "review-evidence-box";
  const evidenceLabel = document.createElement("label");
  evidenceLabel.textContent = "闭卷证据";
  const evidence = document.createElement("textarea");
  evidence.rows = 4;
  evidence.maxLength = 2600;
  evidence.dataset.reviewEvidence = review.reviewId;
  evidence.value = buildReviewEvidenceQuickTemplate(review.completionEvidence);
  evidence.setAttribute("aria-label", "本次复盘闭卷证据");
  evidenceLabel.appendChild(evidence);
  const evidenceStatus = document.createElement("small");
  evidenceStatus.dataset.reviewEvidenceStatus = review.reviewId;
  const sourceContext = getReviewSourceContext(review);
  const source = document.createElement("div");
  source.className = "review-source-context";
  source.dataset.reviewSourceContext = review.reviewId;
  source.hidden = true;
  source.textContent = sourceContext
    ? `上次核对：主要遗漏=${sourceContext.mainGaps.join("、") || "无"}｜下一起点=${sourceContext.nextStart || "未记录"}`
    : "当前记录没有可核对的专业课缺口；请仅依据本次闭卷表现判断。";
  evidenceBox.append(evidenceLabel, evidenceStatus, source);
  const controls = document.createElement("div");
  controls.className = "due-review-actions review-result-buttons";
  [["passed", "通过"], ["partial", "部分通过"], ["failed", "未通过"]].forEach(([code, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button task-action review-result-${code === "passed" ? "pass" : code}`;
    button.textContent = label;
    button.dataset.reviewComplete = review.reviewId;
    button.dataset.reviewResultAction = code;
    button.disabled = true;
    controls.appendChild(button);
  });
  const more = document.createElement("details");
  more.className = "due-review-more";
  const moreSummary = document.createElement("summary");
  moreSummary.textContent = "需要调整日期";
  const moreControls = document.createElement("div");
  const date = document.createElement("input");
  date.type = "date";
  date.value = review.dueDate;
  date.dataset.reviewDate = review.reviewId;
  const move = document.createElement("button");
  move.type = "button";
  move.className = "button ghost task-action";
  move.textContent = "调整日期";
  move.dataset.reviewReschedule = review.reviewId;
  moreControls.append(date, move);
  more.append(moreSummary, moreControls);
  row.append(content, startActions, evidenceBox, controls, more);
  container.appendChild(row);
  updateReviewEvidenceUi(evidence);

  if (state.upcoming.length) {
    const queue = document.createElement("details");
    queue.className = "review-queue-upcoming";
    const queueSummary = document.createElement("summary");
    queueSummary.textContent = `查看后续队列（${state.upcoming.length}）`;
    const list = document.createElement("div");
    state.upcoming.forEach((item, index) => {
      const line = document.createElement("p");
      line.textContent = `${index + 2}. ${item.reviewLevel} · ${item.subject} · ${item.knowledgeUnit || item.task} · ${item.dueDate < today ? "已逾期" : "今日到期"}`;
      list.appendChild(line);
    });
    queue.append(queueSummary, list);
    container.appendChild(queue);
  }
  if (state.backlogCount) appendReviewBacklog(container, state, today);
}

function appendReviewBacklog(container, state, today) {
  const queue = document.createElement("details");
  queue.className = "review-queue-backlog";
  const summary = document.createElement("summary");
  summary.textContent = `查看历史积压（${state.backlogCount}）`;
  const list = document.createElement("div");
  state.backlog.forEach((item, index) => {
    const line = document.createElement("p");
    line.textContent = `${index + 1}. ${item.reviewLevel} · ${item.subject} · ${item.knowledgeUnit || item.task} · ${item.dueDate < today ? `原定 ${item.dueDate}` : "今日到期"}`;
    list.appendChild(line);
  });
  queue.append(summary, list);
  container.appendChild(queue);
}

function completeRollingReviewTaskIfCleared(queue) {
  const plan = getTodayPlan();
  const task = plan.tasks.find((item) => item && item.category === "rollingReview");
  if (!task || getTaskStatus(task) === "completed") return false;
  if (getReviewExecutionState(queue, getDateKey(), { task }).remainingCount) return false;
  if (focusTimerState.activeTaskId === task.id) settleBeforeFocusTaskSwitch("");
  setTaskStatus(task, "completed");
  clearTerminalCurrentPlanTask(plan, task.id);
  saveTodayPlan(plan);
  return true;
}

function saveDueReviewResult(reviewId, resultCode, evidenceInput) {
  const id = String(reviewId || "");
  const queue = normalizeReviewQueueRecords(readJson(reviewQueueKey, []));
  const plan = typeof getTodayPlan === "function" ? getTodayPlan() : null;
  const task = plan && Array.isArray(plan.tasks)
    ? plan.tasks.find((item) => item && item.category === "rollingReview")
    : null;
  const currentState = getReviewExecutionState(queue, getDateKey(), { task });
  if (!id || !currentState.active || currentState.active.reviewId !== id) {
    return {
      changed: false,
      stale: true,
      message: "复盘队列已经更新，请确认当前第一条后再保存。",
      state: currentState,
    };
  }
  const outcome = applyReviewResult(queue, id, resultCode, getDateKey(), new Date().toISOString(), evidenceInput);
  if (!outcome.changed) return { ...outcome, stale: false, state: currentState };
  writeJson(reviewQueueKey, outcome.records);
  const taskCompleted = completeRollingReviewTaskIfCleared(outcome.records);
  renderDueReviews();
  if (typeof renderTasks === "function") renderTasks();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  const nextState = getReviewExecutionState(outcome.records, getDateKey(), { task });
  return {
    ...outcome,
    stale: false,
    taskCompleted,
    state: nextState,
    nextReview: nextState.active || null,
    savedReview: outcome.records.find((item) => item && item.reviewId === id) || null,
  };
}

function handleDueReviewClick(event) {
  const complete = event.target.closest("[data-review-complete]");
  const start = event.target.closest("[data-review-start]");
  const move = event.target.closest("[data-review-reschedule]");
  if (start) {
    const plan = typeof getTodayPlan === "function" ? getTodayPlan() : null;
    const reviewGate = getCurrentReviewScheduleGate(plan);
    if (!reviewGate.allowed) {
      renderDueReviews();
      return setStatus("#dueReviewsStatus", reviewGate.message, true);
    }
    const queue = normalizeReviewQueueRecords(readJson(reviewQueueKey, []));
    const review = queue.find((item) => item.reviewId === start.dataset.reviewStart);
    const directFree = start.dataset.reviewFocusMode === "free";
    const startReview = directFree
      ? (typeof startReviewFreeFocusRound === "function" ? startReviewFreeFocusRound : null)
      : (typeof startReviewFiveMinuteRound === "function" ? startReviewFiveMinuteRound : null);
    if (!review || !startReview) {
      return setStatus("#dueReviewsStatus", "当前无法启动复盘专注，请刷新页面后重试。", true);
    }
    const started = startReview(review);
    if (!started) return;
    setStatus("#dueReviewsStatus", directFree
      ? "已启动复盘自由专注；结束后填写三行闭卷证据。"
      : "已启动5分钟遮挡复述；结束后回来填写三行闭卷证据。");
    return;
  }
  if (complete) {
    const id = complete.dataset.reviewComplete;
    const code = complete.dataset.reviewResultAction;
    const textarea = document.querySelector(`[data-review-evidence="${id}"]`);
    const evidence = parseReviewEvidenceQuickRecord(textarea && textarea.value);
    const outcome = saveDueReviewResult(id, code, evidence);
    if (!outcome.changed) return setStatus("#dueReviewsStatus", outcome.message, true);
    setStatus("#dueReviewsStatus", `${outcome.message}${outcome.taskCompleted ? " 今日滚动复盘任务已完成。" : " 已进入下一条复盘。"}`);
    return;
  }
  if (move) {
    const id = move.dataset.reviewReschedule;
    const dueDate = document.querySelector(`[data-review-date="${id}"]`).value;
    const outcome = rescheduleReview(readJson(reviewQueueKey, []), id, dueDate);
    if (!outcome.changed) return setStatus("#dueReviewsStatus", "请选择有效日期。", true);
    writeJson(reviewQueueKey, outcome.records);
    renderDueReviews();
    if (typeof renderTasks === "function") renderTasks();
    if (typeof renderP0FinalHome === "function") renderP0FinalHome();
    setStatus("#dueReviewsStatus", "已调整日期；本次不计为完成，也不会自动完成滚动复盘任务。");
  }
}

function addProfessionalHistory(container, record) {
  if (!record || !record.professionalProgress) return;
  ["722", "844"].forEach((subject) => {
    const progress = record.professionalProgress[subject];
    if (!progress || !Array.isArray(progress.actualUnits) || !progress.actualUnits.length) return;
    addRecordField(container, `${subject} 实际知识单元`, progress.actualUnits);
    addRecordField(container, `${subject} 掌握度`, (progress.mastery || []).map((item) => `${item.name} ${item.level}`));
    addRecordField(container, `${subject} 主要遗漏`, progress.mainGaps || []);
    addRecordField(container, `${subject} 下一起点`, progress.nextStart);
  });
  if (Array.isArray(record.reviewsCompleted)) addRecordField(container, "当日完成复盘", record.reviewsCompleted.map((item) => `${item.reviewLevel} ${item.subject} ${item.knowledgeUnit}`));
  if (Array.isArray(record.reviewsDueNextDay)) addRecordField(container, "次日到期复盘", record.reviewsDueNextDay.map((item) => `${item.reviewLevel} ${item.subject} ${item.knowledgeUnit}`));
}

function initP0Checkpoint2() {
  const save = document.querySelector("#saveProfessionalResultBtn");
  if (!save || save.dataset.bound === "true") return;
  save.dataset.bound = "true";
  save.addEventListener("click", saveProfessionalUnit);
  document.querySelector("#clearProfessionalResultBtn").addEventListener("click", clearProfessionalForm);
  document.querySelector("#copyProfessionalTemplateBtn").addEventListener("click", copyProfessionalQuickTemplate);
  document.querySelector("#saveProfessionalQuickBtn").addEventListener("click", saveProfessionalQuickRecord);
  document.querySelector("#professionalResultsList").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-professional-edit]");
    if (edit) loadProfessionalUnit(edit.dataset.subject, edit.dataset.professionalEdit);
  });
  document.querySelector("#dueReviewsList").addEventListener("click", handleDueReviewClick);
  document.querySelector("#dueReviewsList").addEventListener("input", (event) => {
    if (event.target.matches("[data-review-evidence]")) updateReviewEvidenceUi(event.target);
  });
  renderProfessionalResults();
  renderDueReviews();
}
