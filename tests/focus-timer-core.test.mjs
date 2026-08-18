import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/focus-timer-core.js", import.meta.url), "utf8");
const context = vm.createContext({ Date });
vm.runInContext(`${source}\nglobalThis.core = { FOCUS_HEARTBEAT_GAP_MS, createFocusTimerState, normalizeFocusTimerState, startFocusTimerSegment, refreshRunningFocusHeartbeat, finalizeFocusTimerSegment, getLiveFocusSegmentSeconds, shouldShowFocusOverrun, shouldShowFocusRecovery, getFocusDateKey, applyFocusSegmentToLedger, getFocusWrapupResultAction, normalizeFocusReason, getFocusSessionReasonLabel, groupFocusSessionsForHistory };`, context);
const core = context.core;
const at = (value) => new Date(value).getTime();

test("1. v2 state is retained but restored paused without fabricated attribution", () => {
  const state = core.normalizeFocusTimerState({ timerVersion: 2, date: "2026-07-18", mode: "free", currentFocusSeconds: 91, running: true }, { date: "2026-07-18", now: at("2026-07-18T10:00:00") });
  assert.equal(state.timerVersion, 4);
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

test("2a. v3 timer state remains recoverable while gaining an empty context", () => {
  const now = at("2026-07-18T10:00:00");
  const state = core.normalizeFocusTimerState({
    timerVersion: 3,
    date: "2026-07-18",
    mode: "pomodoro",
    activeTaskId: "rolling-review",
    activeTaskName: "滚动复盘",
    attribution: "task",
    roundStartedAt: now - 120_000,
    segmentStartedAt: now - 60_000,
    lastHeartbeatAt: now - 1_000,
    remainingSeconds: 240,
    currentFocusSeconds: 60,
    running: true,
  }, { date: "2026-07-18", now });
  assert.equal(state.timerVersion, 4);
  assert.equal(state.activeTaskId, "rolling-review");
  assert.equal(state.running, true);
  assert.equal(state.contextKind, "");
  assert.equal(state.contextId, "");
});

test("2b. due-review context survives pause and resume without entering ordinary focus", () => {
  const start = at("2026-07-18T10:00:00");
  let state = core.startFocusTimerSegment(core.createFocusTimerState({
    now: start,
    mode: "pomodoro",
    remainingSeconds: 300,
  }), {
    now: start,
    activeTaskId: "rolling-review",
    activeTaskName: "滚动复盘",
    contextKind: "due-review",
    contextId: "review-d30-1",
  });
  state.lastHeartbeatAt = start + 120_000;
  const first = core.finalizeFocusTimerSegment(state, { endedAt: start + 120_000, reason: "page-reload" });
  assert.equal(first.state.contextKind, "due-review");
  assert.equal(first.state.contextId, "review-d30-1");
  assert.equal(first.segment.contextKind, "due-review");
  assert.equal(first.segment.contextId, "review-d30-1");
  const restored = core.normalizeFocusTimerState(first.state, { date: "2026-07-18", now: start + 180_000 });
  state = core.startFocusTimerSegment(restored, {
    now: start + 180_000,
    activeTaskId: "rolling-review",
    activeTaskName: "滚动复盘",
    contextKind: "due-review",
    contextId: "review-d30-1",
  });
  assert.equal(state.contextId, "review-d30-1");
  const ordinary = core.startFocusTimerSegment(core.createFocusTimerState({
    ...first.state,
    running: false,
  }), { now: start + 180_000, activeTaskId: "plan-722", activeTaskName: "722" });
  assert.equal(ordinary.contextKind, "");
  assert.equal(ordinary.contextId, "");
});

test("2c. incomplete or old review context fails closed", () => {
  const now = at("2026-07-18T10:00:00");
  assert.equal(core.createFocusTimerState({ now, contextKind: "due-review" }).contextKind, "");
  const old = core.normalizeFocusTimerState({
    timerVersion: 3,
    date: "2026-07-18",
    activeTaskId: "rolling-review",
    contextKind: "due-review",
    contextId: "review-old",
  }, { date: "2026-07-18", now });
  assert.equal(old.contextKind, "");
  assert.equal(old.contextId, "");
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

test("20. refreshing the heartbeat keeps a hidden-tab focus segment running", () => {
  const start = at("2026-07-18T10:00:00");
  let state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start }), { now: start, activeTaskId: "A" });
  state = core.refreshRunningFocusHeartbeat(state, { now: start + 10 * 60_000 });
  assert.equal(state.running, true);
  assert.equal(core.getLiveFocusSegmentSeconds(state, start + 10 * 60_000), 600);
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 10 * 60_000 });
  assert.equal(result.seconds, 600);
});

test("21. a hidden-tab pomodoro remains capped at the round remainder", () => {
  const start = at("2026-07-18T10:00:00");
  let state = core.startFocusTimerSegment(core.createFocusTimerState({ now: start, mode: "pomodoro", remainingSeconds: 300 }), { now: start, activeTaskId: "A" });
  state = core.refreshRunningFocusHeartbeat(state, { now: start + 10 * 60_000 });
  const result = core.finalizeFocusTimerSegment(state, { endedAt: start + 10 * 60_000 });
  assert.equal(result.seconds, 300);
  assert.equal(result.state.remainingSeconds, 0);
});

test("20. page lifecycle pause with an active round offers recovery", () => {
  const state = core.createFocusTimerState({
    now: at("2026-07-18T10:00:00"),
    activeTaskId: "task-a",
    roundStartedAt: at("2026-07-18T09:55:00"),
    pausedReason: "page-hidden",
  });
  assert.equal(core.shouldShowFocusRecovery(state), true);
  assert.equal(core.shouldShowFocusRecovery({ ...state, pausedReason: "page-reload" }), true);
  assert.equal(core.shouldShowFocusRecovery({ ...state, pausedReason: "device-sleep" }), true);
});

test("21. manual pause, missing task, or missing round never forces recovery", () => {
  const state = core.createFocusTimerState({
    now: at("2026-07-18T10:00:00"),
    activeTaskId: "task-a",
    roundStartedAt: at("2026-07-18T09:55:00"),
    pausedReason: "manual-pause",
  });
  assert.equal(core.shouldShowFocusRecovery(state), false);
  assert.equal(core.shouldShowFocusRecovery({ ...state, activeTaskId: "" }), false);
  assert.equal(core.shouldShowFocusRecovery({ ...state, roundStartedAt: null, pausedReason: "page-hidden" }), false);
  assert.equal(core.shouldShowFocusRecovery({ ...state, running: true, pausedReason: "page-hidden" }), false);
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

test("23. wrap-up result action routes only exam-result tasks", () => {
  assert.deepEqual({ ...core.getFocusWrapupResultAction({ id: "ma-yuan-722", category: "maYuan" }) }, {
    kind: "professional", subject: "722", label: "保存收尾并记录722结果",
  });
  assert.equal(core.getFocusWrapupResultAction({ id: "exercise", category: "exercise" }), null);
  assert.equal(core.getFocusWrapupResultAction({ id: "rolling-review", category: "rollingReview" }), null);
});

test("24. wrap-up result action keeps English, politics, and output distinct", () => {
  assert.equal(core.getFocusWrapupResultAction({ category: "englishWords" }), null);
  assert.equal(core.getFocusWrapupResultAction({ category: "englishReading" }).kind, "reading");
  assert.equal(core.getFocusWrapupResultAction({ category: "english" }).kind, "reading");
  assert.equal(core.getFocusWrapupResultAction({ category: "politics" }).kind, "politics");
  assert.equal(core.getFocusWrapupResultAction({ category: "output" }).kind, "output");
});

test("25. browser events can never become persisted pause reasons", () => {
  assert.equal(core.normalizeFocusReason({ type: "click" }, "manual-pause"), "manual-pause");
  assert.equal(core.normalizeFocusReason("[object PointerEvent]", "manual-pause"), "manual-pause");
  assert.equal(core.normalizeFocusReason("page-hidden", "manual-pause"), "page-hidden");
  assert.equal(core.getFocusSessionReasonLabel("[object PointerEvent]"), "旧版手动暂停");
});

test("26. adjacent lifecycle fragments merge only for read-only history display", () => {
  const raw = [
    { id: "a", date: "2026-07-18", taskId: "722", mode: "free", seconds: 600, startedAt: "2026-07-18T10:00:00", endedAt: "2026-07-18T10:10:00", reason: "page-hidden" },
    { id: "b", date: "2026-07-18", taskId: "722", mode: "free", seconds: 300, startedAt: "2026-07-18T10:11:00", endedAt: "2026-07-18T10:16:00", reason: "page-hidden" },
  ];
  const before = JSON.stringify(raw);
  const groups = core.groupFocusSessionsForHistory(raw);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].seconds, 900);
  assert.equal(groups[0].interruptionCount, 1);
  assert.equal(groups[0].parts.length, 2);
  assert.equal(JSON.stringify(raw), before);
});

test("27. task mode time and formal-boundary differences prevent history merging", () => {
  const base = { date: "2026-07-18", taskId: "722", mode: "free", seconds: 60, reason: "page-hidden" };
  const cases = [
    [base, { ...base, taskId: "844", startedAt: "2026-07-18T10:01:30", endedAt: "2026-07-18T10:02:30" }],
    [base, { ...base, mode: "pomodoro", startedAt: "2026-07-18T10:01:30", endedAt: "2026-07-18T10:02:30" }],
    [base, { ...base, startedAt: "2026-07-18T10:04:00", endedAt: "2026-07-18T10:05:00" }],
    [base, { ...base, reason: "free-focus-ended", startedAt: "2026-07-18T10:01:30", endedAt: "2026-07-18T10:02:30" }],
    [base, { ...base, wrapupSaved: true, startedAt: "2026-07-18T10:01:30", endedAt: "2026-07-18T10:02:30" }],
    [{ ...base, contextKind: "due-review", contextId: "review-a" }, { ...base, contextKind: "due-review", contextId: "review-b", startedAt: "2026-07-18T10:01:30", endedAt: "2026-07-18T10:02:30" }],
  ];
  cases.forEach(([first, second]) => {
    const sessions = [
      { ...first, startedAt: first.startedAt || "2026-07-18T10:00:00", endedAt: first.endedAt || "2026-07-18T10:01:00" },
      second,
    ];
    assert.equal(core.groupFocusSessionsForHistory(sessions).length, 2);
  });
});

test("28. a five-minute startup pause and resume totals exactly 300 seconds", () => {
  const start = at("2026-07-18T10:00:00");
  let state = core.startFocusTimerSegment(core.createFocusTimerState({
    now: start,
    mode: "pomodoro",
    remainingSeconds: 300,
  }), { now: start, activeTaskId: "722", activeTaskName: "722" });
  state.lastHeartbeatAt = start + 120_000;
  const first = core.finalizeFocusTimerSegment(state, {
    endedAt: start + 120_000,
    reason: "page-hidden",
  });
  assert.equal(first.seconds, 120);
  assert.equal(first.state.remainingSeconds, 180);
  state = core.startFocusTimerSegment(first.state, {
    now: start + 180_000,
    activeTaskId: "722",
    activeTaskName: "722",
  });
  state.lastHeartbeatAt = start + 360_000;
  const second = core.finalizeFocusTimerSegment(state, {
    endedAt: start + 360_000,
    reason: "startup-completed",
  });
  assert.equal(second.seconds, 180);
  assert.equal(second.state.remainingSeconds, 0);
  assert.equal(second.state.currentFocusSeconds, 300);
  assert.equal(core.getFocusSessionReasonLabel("startup-completed"), "5分钟启动完成");
});
