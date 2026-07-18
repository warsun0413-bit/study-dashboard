import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/focus-timer-core.js", import.meta.url), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(`${source}\nglobalThis.core = { FOCUS_HEARTBEAT_GAP_MS, createFocusTimerState, normalizeFocusTimerState, startFocusTimerSegment, finalizeFocusTimerSegment, getLiveFocusSegmentSeconds, shouldShowFocusOverrun, getFocusDateKey, applyFocusSegmentToLedger };`, context);
const core = context.core;
const at = (value) => new Date(value).getTime();

test("1. v2 state is retained but restored paused without fabricated attribution", () => {
  const state = core.normalizeFocusTimerState({ timerVersion: 2, date: "2026-07-18", mode: "free", currentFocusSeconds: 91, running: true }, { date: "2026-07-18", now: at("2026-07-18T10:00:00") });
  assert.equal(state.timerVersion, 3);
  assert.equal(state.currentFocusSeconds, 91);
  assert.equal(state.running, false);
  assert.equal(state.activeTaskId, "");
  assert.equal(state.attribution, "unassigned");
});

test("2. starting persists the selected task and fixed segment anchor", () => {
  const now = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now }), { now, activeTaskId: "task-a", activeTaskName: "英语" });
  assert.equal(state.running, true);
  assert.equal(state.activeTaskId, "task-a");
  assert.equal(state.segmentStartedAt, now);
  assert.equal(state.lastHeartbeatAt, now);
});

test("3. task A finalization never inherits task B", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A", activeTaskName: "722" });
  state.lastHeartbeatAt = start + 60_000;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 60_000, reason: "task-switched" });
  assert.equal(result.segment.taskId, "A");
  assert.equal(result.segment.taskName, "722");
  assert.equal(result.seconds, 60);
});

test("4. the same segment can only be finalized once", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 10_000;
  const first = core.finalizeFocusTimerSegment(state, { endedAt: start + 10_000 });
  const second = core.finalizeFocusTimerSegment(first.state, { endedAt: start + 20_000 });
  assert.equal(first.seconds, 10);
  assert.equal(second.seconds, 0);
  assert.equal(second.segment, null);
});

test("5. free focus records exact whole seconds", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start, mode: "free" }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 12_900;
  assert.equal(core.finalizeFocusTimerSegment(state, { endedAt: start + 12_900 }).seconds, 12);
});

test("6. pomodoro never exceeds remaining seconds", () => {
  const start = at("2026-07-18T10:00:00");
  const base = core.createFocusTimerState({ now: start, mode: "pomodoro", remainingSeconds: 3 });
  const state = core.startFocusTimerSegment(base, { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 10_000;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 10_000 });
  assert.equal(result.seconds, 3);
  assert.equal(result.state.remainingSeconds, 0);
});

test("7. a 6-second foreground event-loop delay is not treated as device sleep", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 1000;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 7000, reason: "manual-pause" });
  assert.equal(core.FOCUS_HEARTBEAT_GAP_MS, 20_000);
  assert.equal(result.seconds, 7);
  assert.equal(result.reason, "manual-pause");
});

test("8. a gap beyond the formal threshold pauses and keeps confirmed seconds", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 10_000;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 7_200_000 });
  assert.equal(result.seconds, 10);
  assert.equal(result.reason, "device-sleep");
  assert.equal(result.state.running, false);
});

test("9. page hidden settles immediately regardless of the sleep threshold", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 600_000;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 600_000, reason: "page-hidden" });
  assert.equal(result.seconds, 600);
  assert.equal(result.reason, "page-hidden");
  assert.equal(result.state.running, false);
});

test("10. reload after a long gap settles only to the saved heartbeat", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 45_000;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 600_000, reason: "page-reload" });
  assert.equal(result.seconds, 45);
  assert.equal(result.reason, "device-sleep");
});

test("11. sub-second segments do not create zero sessions", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 500;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 500 });
  assert.equal(result.seconds, 0);
  assert.equal(result.segment, null);
});

test("12. negative or reversed timestamps cannot produce invalid duration", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start - 1000 });
  assert.equal(result.seconds, 0);
  assert.equal(result.segment, null);
});

test("13. cross-midnight focus is capped at midnight and paused", () => {
  const start = at("2026-07-18T23:59:50");
  const end = at("2026-07-19T00:00:10");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start, date: "2026-07-18" }), { now: start, date: "2026-07-18", activeTaskId: "A" });
  state.lastHeartbeatAt = end;
  const result = core.finalizeFocusTimerSegment(state, { endedAt: end });
  assert.equal(result.seconds, 10);
  assert.equal(result.reason, "date-rollover");
  assert.equal(result.state.running, false);
});

test("14. overrun prompt appears at plus 30 minutes and only once", () => {
  assert.equal(core.shouldShowFocusOverrun(5400, 3600, false), true);
  assert.equal(core.shouldShowFocusOverrun(5400, 3600, true), false);
  assert.equal(core.shouldShowFocusOverrun(5399, 3600, false), false);
});

test("15. explicit unassigned focus remains unassigned", () => {
  const now = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now }), { now, activeTaskId: "", activeTaskName: "未归属" });
  assert.equal(state.attribution, "unassigned");
  assert.equal(state.activeTaskId, "");
});

test("16. live display is derived without mutating durable totals", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start, currentFocusSeconds: 20 }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 8_000;
  assert.equal(core.getLiveFocusSegmentSeconds(state, start + 8_000), 8);
  assert.equal(state.currentFocusSeconds, 20);
});

test("17. A 600 seconds then B 300 seconds stay separate and total 900", () => {
  const start = at("2026-07-18T10:00:00");
  let state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A", activeTaskName: "722" });
  state.lastHeartbeatAt = start + 600_000;
  const a = core.finalizeFocusTimerSegment(state, { endedAt: start + 600_000, reason: "task-switch", gapThresholdMs: 600_000 });
  let ledger = core.applyFocusSegmentToLedger({}, {}, a.segment);
  state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start + 600_000 }), { now: start + 600_000, activeTaskId: "B", activeTaskName: "844" });
  state.lastHeartbeatAt = start + 900_000;
  const b = core.finalizeFocusTimerSegment(state, { endedAt: start + 900_000, reason: "manual-pause", gapThresholdMs: 300_000 });
  ledger = core.applyFocusSegmentToLedger(ledger.focusTotals, ledger.taskTotals, b.segment);
  assert.equal(ledger.focusTotals["2026-07-18"], 900);
  assert.equal(ledger.taskTotals["2026-07-18"].A, 600);
  assert.equal(ledger.taskTotals["2026-07-18"].B, 300);
  assert.equal(a.segment.taskId, "A");
  assert.equal(b.segment.taskId, "B");
});

test("18. resetting a countdown without a segment leaves all totals unchanged", () => {
  const focusTotals = { "2026-07-18": 900 };
  const taskTotals = { "2026-07-18": { A: 600, B: 300 } };
  const result = core.applyFocusSegmentToLedger(focusTotals, taskTotals, null);
  assert.equal(result.focusTotals["2026-07-18"], focusTotals["2026-07-18"]);
  assert.equal(result.taskTotals["2026-07-18"].A, taskTotals["2026-07-18"].A);
  assert.equal(result.taskTotals["2026-07-18"].B, taskTotals["2026-07-18"].B);
  assert.equal(result.applied, false);
});

test("19. visibilitychange followed by pagehide cannot double-apply one segment", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 60_000;
  const hidden = core.finalizeFocusTimerSegment(state, { endedAt: start + 60_000, reason: "page-hidden", gapThresholdMs: 60_000 });
  const pagehide = core.finalizeFocusTimerSegment(hidden.state, { endedAt: start + 60_001, reason: "pagehide" });
  let ledger = core.applyFocusSegmentToLedger({}, {}, hidden.segment);
  ledger = core.applyFocusSegmentToLedger(ledger.focusTotals, ledger.taskTotals, pagehide.segment);
  assert.equal(ledger.focusTotals["2026-07-18"], 60);
  assert.equal(pagehide.segment, null);
});

test("20. resuming after midnight creates a separate new-date ledger entry", () => {
  const oldStart = at("2026-07-18T23:59:50");
  const midnight = at("2026-07-19T00:00:00");
  let state = core.startFocusTimerSegment(core.createFocusTimerState({ now: oldStart, date: "2026-07-18" }), { now: oldStart, date: "2026-07-18", activeTaskId: "A" });
  state.lastHeartbeatAt = midnight;
  const oldDay = core.finalizeFocusTimerSegment(state, { endedAt: midnight, gapThresholdMs: 10_000 });
  let ledger = core.applyFocusSegmentToLedger({}, {}, oldDay.segment);
  state = core.startFocusTimerSegment(core.createFocusTimerState({ now: midnight, date: "2026-07-19" }), { now: midnight, date: "2026-07-19", activeTaskId: "A" });
  state.lastHeartbeatAt = midnight + 20_000;
  const newDay = core.finalizeFocusTimerSegment(state, { endedAt: midnight + 20_000, gapThresholdMs: 20_000 });
  ledger = core.applyFocusSegmentToLedger(ledger.focusTotals, ledger.taskTotals, newDay.segment);
  assert.equal(ledger.focusTotals["2026-07-18"], 10);
  assert.equal(ledger.focusTotals["2026-07-19"], 20);
});

test("21. NaN and Infinity segments are rejected by the ledger", () => {
  assert.equal(core.applyFocusSegmentToLedger({}, {}, { date: "2026-07-18", seconds: Number.NaN }).applied, false);
  assert.equal(core.applyFocusSegmentToLedger({}, {}, { date: "2026-07-18", seconds: Number.POSITIVE_INFINITY }).applied, false);
});

test("22. completing a running task settles before completion and cannot duplicate", () => {
  const start = at("2026-07-18T10:00:00");
  const state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state.lastHeartbeatAt = start + 120_000;
  const completed = core.finalizeFocusTimerSegment(state, { endedAt: start + 120_000, reason: "task-completed", gapThresholdMs: 120_000 });
  const duplicate = core.finalizeFocusTimerSegment(completed.state, { endedAt: start + 121_000, reason: "task-completed" });
  const ledger = core.applyFocusSegmentToLedger({}, {}, completed.segment);
  assert.equal(completed.seconds, 120);
  assert.equal(completed.state.running, false);
  assert.equal(ledger.taskTotals["2026-07-18"].A, 120);
  assert.equal(duplicate.seconds, 0);
});
