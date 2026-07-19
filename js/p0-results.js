// P0 Checkpoint 2: formal review queue and 722/844 knowledge-unit results.
const REVIEW_LEVEL_OFFSETS = Object.freeze({ D0: 0, D1: 1, D3: 3, D7: 7, D14: 14, D30: 30 });
const REVIEW_LEVELS = Object.freeze(Object.keys(REVIEW_LEVEL_OFFSETS));
const REVIEW_RESULTS = Object.freeze({ passed: "通过", partial: "部分通过", failed: "未通过", unverified: "未验收" });
const REVIEW_STATUSES = new Set(["pending", "completed", "rescheduled", "cancelled"]);
const REVIEW_TYPES = new Set(["spaced", "short-retest", "output-rewrite", "option-trap", "politics-knowledge"]);
const MASTERY_LEVELS = new Set(["L0", "L1", "L2", "L3", "L4", "L5"]);

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
  return {
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

function applyReviewResult(queue, reviewId, resultCode, today, now = new Date().toISOString()) {
  let records = normalizeReviewQueueRecords(queue);
  const current = records.find((record) => record.reviewId === reviewId);
  if (!current) return { records, changed: false, message: "未找到复盘任务。" };
  const result = REVIEW_RESULTS[resultCode];
  if (!result) return { records, changed: false, message: "复盘结果无效。" };
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

function validateProfessionalUnit(input) {
  const mainGaps = Array.isArray(input.mainGaps) ? input.mainGaps.filter(Boolean) : splitResultList(input.mainGaps);
  if (!["722", "844"].includes(input.subject)) return { valid: false, message: "请选择 722 或 844。" };
  if (!resultText(input.name, 160)) return { valid: false, message: "请填写实际完成的知识点。" };
  if (!MASTERY_LEVELS.has(input.mastery)) return { valid: false, message: "请选择掌握等级 L0—L5。" };
  if (!Object.values(REVIEW_RESULTS).includes(input.reviewResult)) return { valid: false, message: "请选择复盘结果。" };
  if (!mainGaps.length) return { valid: false, message: "请填写主要遗漏；如果没有，请明确填写“无”。" };
  if (!resultText(input.nextStart, 240)) return { valid: false, message: "请填写下一准确起点。" };
  if (Number(input.mastery.slice(1)) > 2 && (!resultText(input.closedBookResult, 500) || input.reviewResult === "未验收")) {
    return { valid: false, message: "L3—L5 必须已有闭卷验收结果；未验收内容最高只能记录为 L2。" };
  }
  return { valid: true };
}

function getProfessionalSubject(task) {
  if (!task) return "";
  if (task.category === "maYuan" || /722/.test(`${task.id || ""} ${task.name || ""}`)) return "722";
  if (task.category === "maHistory" || /844/.test(`${task.id || ""} ${task.name || ""}`)) return "844";
  return "";
}

function readProfessionalStore() {
  return normalizeProfessionalResultsStore(readJson(professionalResultsKey, {}));
}

function getProfessionalUnits(dateKey, subject) {
  const store = readProfessionalStore();
  const record = store.days[dateKey] && store.days[dateKey][subject];
  return record && Array.isArray(record.units) ? record.units : [];
}

function validateProfessionalTaskCompletion(task, dateKey = getDateKey()) {
  const subject = getProfessionalSubject(task);
  if (!subject) return { valid: true };
  const units = getProfessionalUnits(dateKey, subject);
  if (!units.length) return { valid: false, message: `${subject} 任务完成前，请先保存至少一个知识单元结果。` };
  return units.some((unit) => validateProfessionalUnit(unit).valid && unit.reviewResult !== "未验收")
    ? { valid: true }
    : { valid: false, message: `${subject} 尚无已验收知识单元；请补全掌握度、复盘结果、主要遗漏和下一起点。` };
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

function saveProfessionalUnit() {
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
    ...(existing || {}), unitId, name: resultText(input.name, 160), subject: input.subject,
    sourceTaskId: sourceTask ? sourceTask.id : "", status: input.reviewResult === "通过" ? "通过" : input.reviewResult === "部分通过" ? "部分通过" : "已学习待验收",
    mastery: input.mastery, reviewResult: input.reviewResult, closedBookResult: resultText(input.closedBookResult, 500),
    writtenReconstruction: resultText(input.writtenReconstruction, 500), originalTextUsage: resultText(input.originalTextUsage, 500),
    mainGaps: input.mainGaps, mustMemorize: input.mustMemorize, nextStart: resultText(input.nextStart, 240),
    createdAt: existing && existing.createdAt ? existing.createdAt : now, updatedAt: now,
  };
  if (existing) Object.assign(existing, unit); else units.push(unit);
  store.days[dateKey][input.subject] = { subject: input.subject, units, updatedAt: now };
  writeJson(professionalResultsKey, store);
  let queue = ensureReviewSchedule(readJson(reviewQueueKey, []), unit, dateKey, now);
  const d0 = queue.find((record) => record.reviewKey === buildReviewKey(unit.subject, unit.unitId, "D0"));
  if (d0 && !(d0.status === "completed" && d0.previousResult === unit.reviewResult)) queue = applyReviewResult(queue, d0.reviewId, resultCode, dateKey, now).records;
  writeJson(reviewQueueKey, queue);
  clearProfessionalForm();
  renderProfessionalResults();
  renderDueReviews();
  if (typeof renderP0FinalHome === "function") renderP0FinalHome();
  setStatus("#professionalResultStatus", `${input.subject} 知识单元结果已保存；复盘层级已按 reviewKey 去重。`);
}

function loadProfessionalUnit(subject, unitId) {
  const unit = getProfessionalUnits(getDateKey(), subject).find((item) => item.unitId === unitId);
  if (!unit) return;
  document.querySelector("#professionalSubject").value = subject;
  document.querySelector("#professionalUnitId").value = unit.unitId;
  document.querySelector("#professionalUnitName").value = unit.name || "";
  document.querySelector("#professionalMastery").value = unit.mastery || "L0";
  document.querySelector("#professionalReviewResult").value = Object.entries(REVIEW_RESULTS).find(([, label]) => label === unit.reviewResult)?.[0] || "unverified";
  document.querySelector("#professionalClosedBook").value = unit.closedBookResult || "";
  document.querySelector("#professionalReconstruction").value = unit.writtenReconstruction || "";
  document.querySelector("#professionalOriginalText").value = unit.originalTextUsage || "";
  document.querySelector("#professionalGaps").value = (unit.mainGaps || []).join("\n");
  document.querySelector("#professionalMustMemorize").value = (unit.mustMemorize || []).join("\n");
  document.querySelector("#professionalNextStart").value = unit.nextStart || "";
  document.querySelector("#professionalResultsPanel").open = true;
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
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button ghost task-action"; edit.textContent = "编辑";
      edit.dataset.professionalEdit = unit.unitId; edit.dataset.subject = subject;
      row.append(content, edit); section.appendChild(row);
    });
    container.appendChild(section);
  });
}

function renderDueReviews() {
  const container = document.querySelector("#dueReviewsList");
  if (!container) return;
  const today = getDateKey();
  const due = getDueReviews(readJson(reviewQueueKey, []), today);
  container.replaceChildren();
  document.querySelector("#dueReviewsCount").textContent = `${due.length} 项`;
  if (!due.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "今天没有到期复盘。"; container.appendChild(empty); return;
  }
  due.forEach((review) => {
    const row = document.createElement("article"); row.className = `due-review-row${review.dueDate < today ? " is-overdue" : ""}`;
    const content = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = `${review.reviewLevel} · ${review.subject} · ${review.knowledgeUnit || review.task}`;
    const meta = document.createElement("span"); meta.textContent = `${review.dueDate < today ? "已逾期" : "今日到期"} · ${review.task}`; content.append(title, meta);
    const controls = document.createElement("div"); controls.className = "due-review-actions";
    const select = document.createElement("select"); select.dataset.reviewResult = review.reviewId;
    Object.entries(REVIEW_RESULTS).forEach(([value, label]) => select.add(new Option(label, value)));
    const save = document.createElement("button"); save.type = "button"; save.className = "button primary task-action"; save.textContent = "保存结果"; save.dataset.reviewComplete = review.reviewId;
    const date = document.createElement("input"); date.type = "date"; date.value = review.dueDate; date.dataset.reviewDate = review.reviewId;
    const move = document.createElement("button"); move.type = "button"; move.className = "button ghost task-action"; move.textContent = "调整日期"; move.dataset.reviewReschedule = review.reviewId;
    controls.append(select, save, date, move); row.append(content, controls); container.appendChild(row);
  });
}

function handleDueReviewClick(event) {
  const complete = event.target.closest("[data-review-complete]");
  const move = event.target.closest("[data-review-reschedule]");
  if (complete) {
    const id = complete.dataset.reviewComplete;
    const code = document.querySelector(`[data-review-result="${id}"]`).value;
    const outcome = applyReviewResult(readJson(reviewQueueKey, []), id, code, getDateKey());
    if (!outcome.changed) return setStatus("#dueReviewsStatus", outcome.message, true);
    writeJson(reviewQueueKey, outcome.records); renderDueReviews(); if (typeof renderP0FinalHome === "function") renderP0FinalHome(); setStatus("#dueReviewsStatus", outcome.message); return;
  }
  if (move) {
    const id = move.dataset.reviewReschedule;
    const dueDate = document.querySelector(`[data-review-date="${id}"]`).value;
    const outcome = rescheduleReview(readJson(reviewQueueKey, []), id, dueDate);
    if (!outcome.changed) return setStatus("#dueReviewsStatus", "请选择有效日期。", true);
    writeJson(reviewQueueKey, outcome.records); renderDueReviews(); if (typeof renderP0FinalHome === "function") renderP0FinalHome(); setStatus("#dueReviewsStatus", "已更新原复盘任务的日期，没有创建重复任务。");
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
  document.querySelector("#professionalResultsList").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-professional-edit]");
    if (edit) loadProfessionalUnit(edit.dataset.subject, edit.dataset.professionalEdit);
  });
  document.querySelector("#dueReviewsList").addEventListener("click", handleDueReviewClick);
  renderProfessionalResults();
  renderDueReviews();
}
