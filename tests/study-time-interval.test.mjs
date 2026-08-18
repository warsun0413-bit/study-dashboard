import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/study-time.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(`${source}
globalThis.intervalApi = { buildManualStudyInterval, studyIntervalsOverlap, findManualStudyIntervalOverlap, formatManualStudyRange, buildTodayStudyTimelineEntries, normalizeDailyStudyTargetSeconds };`, context);
const api = context.intervalApi;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("manual study interval derives exact same-day duration", () => {
  const interval = plain(api.buildManualStudyInterval("2026-08-05", "08:35", "09:20"));
  assert.equal(interval.valid, true);
  assert.equal(interval.durationSeconds, 45 * 60);
  assert.equal(interval.startTime, "08:35");
  assert.equal(interval.endTime, "09:20");
  assert.equal(api.formatManualStudyRange(interval), "08:35—09:20");
});

test("manual study interval rejects partial reversed and cross-midnight ranges", () => {
  assert.match(api.buildManualStudyInterval("2026-08-05", "08:35", "").error, /同时填写/);
  assert.match(api.buildManualStudyInterval("2026-08-05", "09:20", "08:35").error, /同一天/);
  assert.match(api.buildManualStudyInterval("2026-08-05", "23:50", "00:20").error, /同一天/);
  assert.equal(api.buildManualStudyInterval("2026-08-05", "", "").specified, false);
});

test("overlap detection prevents double counting but permits touching boundaries", () => {
  const candidate = api.buildManualStudyInterval("2026-08-05", "09:00", "10:00");
  const manual = api.buildManualStudyInterval("2026-08-05", "09:30", "10:30");
  const touching = api.buildManualStudyInterval("2026-08-05", "10:00", "11:00");
  assert.equal(api.studyIntervalsOverlap(candidate, manual), true);
  assert.equal(api.studyIntervalsOverlap(candidate, touching), false);
  assert.equal(plain(api.findManualStudyIntervalOverlap(candidate, [{ ...manual, id: "m" }], [])).type, "manual");
  assert.equal(plain(api.findManualStudyIntervalOverlap(candidate, [], [{ ...manual, seconds: 1800 }])).type, "focus");
});

test("today timeline combines focus and manual records in time order", () => {
  const entries = plain(api.buildTodayStudyTimelineEntries("2026-08-05", [{
    id: "manual-1", date: "2026-08-05", startedAt: "2026-08-05T10:00:00+08:00", endedAt: "2026-08-05T10:30:00+08:00", durationSeconds: 1800, taskTitle: "722",
  }], [{
    id: "focus-1", date: "2026-08-05", startedAt: "2026-08-05T08:00:00+08:00", endedAt: "2026-08-05T08:20:00+08:00", seconds: 1200, taskName: "英语", mode: "pomodoro",
  }]));
  assert.deepEqual(entries.map((entry) => entry.source), ["focus", "manual"]);
  assert.deepEqual(entries.map((entry) => entry.taskTitle), ["英语", "722"]);
  assert.deepEqual(entries.map((entry) => entry.durationSeconds), [1200, 1800]);
});

test("daily target normalization rejects over-one-day and coerced persisted values", () => {
  assert.equal(api.normalizeDailyStudyTargetSeconds(60), 60);
  assert.equal(api.normalizeDailyStudyTargetSeconds(86400), 86400);
  assert.equal(api.normalizeDailyStudyTargetSeconds(86460), 0);
  assert.equal(api.normalizeDailyStudyTargetSeconds("3600"), 0);
  assert.equal(api.normalizeDailyStudyTargetSeconds(1.5), 0);
  assert.match(source, /seconds > 24 \* 60 \* 60/);
});

test("historical target model reuses the frozen execution target and provenance", () => {
  const frozenContext = vm.createContext({
    Date,
    dailyStudyTargetsKey: "studyDailyTargetSeconds",
    readJson: () => ({ "2026-08-08": 99999 }),
    readDailyPlans: () => ({ "2026-08-08": { targetEffectiveStudyHours: 9 } }),
    getDateKey: () => "2026-08-08",
  });
  vm.runInContext(`${source}
globalThis.readFrozenTarget = () => getDailyExecutionTargetModel("2026-08-08", {
  planStudyTargetSeconds: 32400,
  executionTargetSeconds: 10800,
  executionTargetSource: "recent-capacity",
  executionTargetSourceLabel: "近7日真实承载",
  executionTargetEvidence: { evidenceDays: 3, excludedDays: 1 },
});`, frozenContext);
  const frozen = plain(frozenContext.readFrozenTarget());
  assert.equal(frozen.executionTargetSeconds, 10800);
  assert.equal(frozen.planTargetSeconds, 32400);
  assert.equal(frozen.source, "recent-capacity");
  assert.equal(frozen.sourceLabel, "近7日真实承载");
  assert.equal(frozen.capacityCalibration.evidenceDays, 3);
  assert.equal(frozen.frozen, true);
});

test("time interval UI and cache assets are current", () => {
  assert.match(indexSource, /id="manualStudyStartTime" type="time"/);
  assert.match(indexSource, /id="manualStudyEndTime" type="time"/);
  assert.match(indexSource, /class="today-study-timeline-card"/);
  assert.ok(indexSource.indexOf("today-study-timeline-card") < indexSource.indexOf("execution-settings"));
  assert.match(indexSource, /id="todayPlanStudyTarget"/);
  assert.match(indexSource, /id="todayStudyTargetSource"/);
  assert.match(indexSource, /study-time\.js\?v=weekly-improvement-v154/);
  assert.match(serviceWorkerSource, /study-dashboard-magic-link-v158/);
  assert.match(serviceWorkerSource, /study-time\.js\?v=weekly-improvement-v154/);
});
