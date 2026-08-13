import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/admission-readiness-core.js", import.meta.url), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.core = { normalizeAdmissionMockRecord, upsertAdmissionMockRecord, validateAdmissionAssessmentConfig, buildAdmissionEvidenceAudit, buildAdmissionBatchAudit, buildAdmissionModelReliability, buildAdmissionReadinessAssessment };`, context);
const core = context.core;
const plain = (value) => JSON.parse(JSON.stringify(value));

const config = {
  targetTotal: 390,
  benchmarkYear: "2025",
  benchmarkSource: "用户核对的官方复试基本要求",
  subjectMinimums: { english: 60, politics: 60, "722": 90, "844": 90 },
};

function evidenceFields(subject, index, overrides = {}) {
  return {
    strictTimed: true,
    fullSimulation: true,
    standardScoring: true,
    attemptType: "first",
    paperSeries: `${subject}-统一卷系`,
    paperId: `paper-${index + 1}`,
    ...overrides,
  };
}

function makeRecords(count = 5) {
  const base = { english: 57, politics: 72, "722": 116, "844": 114 };
  const max = { english: 100, politics: 100, "722": 150, "844": 150 };
  return Object.keys(base).flatMap((subject) => Array.from({ length: count }, (_, index) => ({
    recordId: `2026-08-${String(index + 1).padStart(2, "0")}:${subject}`,
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    subject,
    score: base[subject] + index,
    maxScore: max[subject],
    durationMinutes: subject === "english" || subject === "politics" ? 180 : 180,
    ...evidenceFields(subject, index),
  })));
}

test("requires a user-sourced target and valid subject lines", () => {
  assert.throws(() => core.validateAdmissionAssessmentConfig({}), /目标总分/);
  assert.throws(() => core.validateAdmissionAssessmentConfig({ ...config, benchmarkSource: "" }), /来源/);
  assert.equal(core.validateAdmissionAssessmentConfig(config).targetTotal, 390);
});

test("validates subject score ranges and upserts the same date and subject", () => {
  assert.throws(() => core.normalizeAdmissionMockRecord({ date: "2026-08-08", subject: "english", score: 101, durationMinutes: 180, ...evidenceFields("english", 0) }), /0—100/);
  const first = core.upsertAdmissionMockRecord([], { date: "2026-08-08", subject: "722", score: 100, durationMinutes: 180, batchId: "2026-W32-01", ...evidenceFields("722", 0) }, "2026-08-08T10:00:00.000Z");
  const second = core.upsertAdmissionMockRecord(first.records, { date: "2026-08-08", subject: "722", score: 110, durationMinutes: 175, batchId: "2026-W32-01", ...evidenceFields("722", 0) }, "2026-08-08T11:00:00.000Z");
  assert.equal(second.records.length, 1);
  assert.equal(second.record.score, 110);
  assert.equal(second.record.paperSeries, "722-统一卷系");
  assert.equal(second.record.attemptType, "first");
  assert.equal(second.record.batchId, "2026-W32-01");
});

test("does not output probability before every subject has five comparable mocks", () => {
  const records = makeRecords(5).filter((record) => !(record.subject === "844" && record.date === "2026-08-05"));
  records.push({ date: "2026-08-05", subject: "844", score: 120, maxScore: 150, ...evidenceFields("844", 4, { strictTimed: false }) });
  const assessment = plain(core.buildAdmissionReadinessAssessment(records, config));
  assert.equal(assessment.status, "insufficient-data");
  assert.equal(assessment.subjectCounts["844"], 4);
  assert.equal(assessment.missingSubjects[0].needed, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(assessment, "probability"), false);
});

test("produces a deterministic conditional range and identifies the weakest subject", () => {
  const records = makeRecords(6);
  const first = plain(core.buildAdmissionReadinessAssessment(records, config));
  const second = plain(core.buildAdmissionReadinessAssessment(records, config));
  assert.equal(first.status, "ready");
  assert.deepEqual(first.probability, second.probability);
  assert.ok(first.probability.conservative <= first.probability.baseline);
  assert.ok(first.probability.optimistic >= first.probability.baseline);
  assert.equal(first.riskSubject, "english");
  assert.equal(first.reliability.status, "low");
  assert.match(first.caveat, /不是最终录取概率/);
});

test("walk-forward backtest distinguishes stable evidence from severe failure", () => {
  const max = { english: 100, politics: 100, "722": 150, "844": 150 };
  const stable = Object.keys(max).flatMap((subject) => [0, 1, -1, 0, 2, 1, 0, 1].map((offset, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    subject,
    score: (subject === "english" || subject === "politics" ? 70 : 110) + offset,
    maxScore: max[subject],
    ...evidenceFields(subject, index),
  })));
  const stableResult = plain(core.buildAdmissionModelReliability(stable));
  assert.equal(stableResult.status, "medium");
  assert.equal(stableResult.totalPredictions, 12);
  assert.ok(stableResult.coverageRate >= 60);
  const noisy = Object.keys(max).flatMap((subject) => [0.2, 0.8, 0.1, 0.9, 0.15, 0.85, 0.05, 0.95].map((ratio, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    subject,
    score: max[subject] * ratio,
    maxScore: max[subject],
    ...evidenceFields(subject, index),
  })));
  const noisyResult = plain(core.buildAdmissionModelReliability(noisy));
  assert.equal(noisyResult.status, "low");
  assert.equal(noisyResult.withholdProbability, true);
});

test("severe backtest failure pauses probability instead of showing a misleading number", () => {
  const max = { english: 100, politics: 100, "722": 150, "844": 150 };
  const records = Object.keys(max).flatMap((subject) => [0.2, 0.8, 0.1, 0.9, 0.15, 0.85, 0.05, 0.95].map((ratio, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    subject,
    score: max[subject] * ratio,
    maxScore: max[subject],
    ...evidenceFields(subject, index),
  })));
  const assessment = plain(core.buildAdmissionReadinessAssessment(records, config));
  assert.equal(assessment.probabilityWithheld, true);
  assert.equal(assessment.probability, null);
});

test("evidence audit excludes legacy retakes duplicate papers and non-comparable series without deleting them", () => {
  const records = [0, 1, 2].map((index) => ({
    date: `2026-08-0${index + 1}`,
    subject: "english",
    score: 65 + index,
    maxScore: 100,
    durationMinutes: 180,
    ...evidenceFields("english", index, { paperSeries: "英语一真题" }),
  }));
  records.push(
    { ...records[0], recordId: "duplicate", date: "2026-08-04", score: 70 },
    { ...records[1], recordId: "repeat", date: "2026-08-05", paperId: "repeat-paper", attemptType: "repeat" },
    { date: "2026-08-06", subject: "english", score: 71, maxScore: 100, durationMinutes: 180, strictTimed: true },
    { date: "2026-08-07", subject: "english", score: 72, maxScore: 100, durationMinutes: 180, ...evidenceFields("english", 6, { paperSeries: "另一模拟卷" }) },
  );
  const audit = plain(core.buildAdmissionEvidenceAudit(records));
  assert.equal(audit.totalRecords, 7);
  assert.equal(audit.eligibleRecords.length, 3);
  assert.equal(audit.activeSeriesBySubject.english.label, "英语一真题");
  assert.ok(audit.entries.some((entry) => entry.reasons.some((reason) => reason.includes("同科同卷重复"))));
  assert.ok(audit.entries.some((entry) => entry.reasons.includes("属于重做成绩")));
  assert.ok(audit.entries.some((entry) => entry.reasons.includes("未记录首次作答")));
  assert.ok(audit.entries.some((entry) => entry.reasons.some((reason) => reason.includes("当前可比组"))));
});

test("batch audit never auto-pairs unlabelled scores and reports incomplete or duplicate subjects", () => {
  const complete = ["english", "politics", "722", "844"].map((subject, index) => ({
    date: `2026-08-0${index + 1}`,
    subject,
    score: subject === "english" || subject === "politics" ? 70 : 120,
    batchId: "batch-complete",
  }));
  const records = [
    ...complete,
    { date: "2026-08-05", subject: "english", score: 70, batchId: "batch-missing" },
    ...complete.map((record) => ({ ...record, batchId: "batch-duplicate", date: "2026-08-06" })),
    { date: "2026-08-07", subject: "english", score: 71, batchId: "batch-duplicate" },
    { date: "2026-08-08", subject: "politics", score: 72, batchId: "" },
  ];
  const audit = plain(core.buildAdmissionBatchAudit(records));
  assert.equal(audit.completeBatches.length, 1);
  assert.equal(audit.incompleteBatches.length, 2);
  assert.equal(audit.unassignedEligibleCount, 1);
  assert.deepEqual(audit.incompleteBatches.find((batch) => batch.batchId === "batch-missing").missingSubjects.map((subject) => subject.id), ["politics", "722", "844"]);
  assert.deepEqual(audit.incompleteBatches.find((batch) => batch.batchId === "batch-duplicate").duplicateSubjects.map((subject) => subject.id), ["english"]);
});

test("five complete batches switch the assessment from independent approximation to joint outcomes", () => {
  const max = { english: 100, politics: 100, "722": 150, "844": 150 };
  const records = Object.keys(max).flatMap((subject) => Array.from({ length: 5 }, (_, index) => {
    const score = subject === "english" ? 58 + 3 * index : subject === "politics" ? 65 + index : 125 + 2 * index;
    return {
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      subject,
      score,
      maxScore: max[subject],
      durationMinutes: 180,
      batchId: `joint-${index + 1}`,
      ...evidenceFields(subject, index),
    };
  }));
  const assessment = plain(core.buildAdmissionReadinessAssessment(records, config));
  assert.equal(assessment.status, "ready");
  assert.equal(assessment.probabilityMode, "joint-batch");
  assert.equal(assessment.jointEstimate.count, 5);
  assert.equal(assessment.jointEstimate.successes, 2);
  assert.equal(assessment.probability.baseline, 40);
  assert.equal(assessment.predictedTotalMean, 389);
  assert.ok(assessment.probability.conservative < 40);
  assert.ok(assessment.probability.optimistic > 40);
  assert.match(assessment.caveat, /真实四科组合/);
});

test("page exposes local score entry, evidence gate, and current cache", () => {
  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../js/admission-readiness.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(index, /id="admissionReadinessPanel"/);
  assert.match(index, /id="admissionMockStrict"/);
  assert.match(index, /id="admissionMockAttemptType"/);
  assert.match(index, /id="admissionMockPaperSeries"/);
  assert.match(index, /id="admissionMockFullSimulation"/);
  assert.match(index, /id="admissionMockBatchId"/);
  assert.match(ui, /ADMISSION_MIN_COMPARABLE_SAMPLES/);
  assert.match(ui, /完整联合批次|联合批次实测达标/);
  assert.match(worker, /admission-readiness-core\.js\?v=admission-joint-v114/);
});
