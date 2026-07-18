// Pure focus-timer state transitions. Storage and DOM updates stay in tasks.js.
const FOCUS_TIMER_VERSION = 3;
const FOCUS_HEARTBEAT_GAP_MS = 20_000;
const FOCUS_INACTIVITY_LIMIT_MS = 3 * 60 * 60 * 1000;

function toSafeFocusInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function getFocusDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getFocusDateBoundary(dateKey) {
  const boundary = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(boundary.getTime())) return 0;
  boundary.setDate(boundary.getDate() + 1);
  return boundary.getTime();
}

function createFocusTimerState(options = {}) {
  const now = toSafeFocusInteger(options.now, Date.now());
  const mode = options.mode === "pomodoro" ? "pomodoro" : "free";
  return {
    timerVersion: FOCUS_TIMER_VERSION,
    date: options.date || getFocusDateKey(now),
    mode,
    activeTaskId: String(options.activeTaskId || ""),
    activeTaskName: String(options.activeTaskName || ""),
    attribution: options.attribution === "task" ? "task" : "unassigned",
    roundStartedAt: toSafeFocusInteger(options.roundStartedAt, 0) || null,
    segmentStartedAt: toSafeFocusInteger(options.segmentStartedAt, 0) || null,
    lastHeartbeatAt: toSafeFocusInteger(options.lastHeartbeatAt, 0) || null,
    remainingSeconds: mode === "pomodoro"
      ? toSafeFocusInteger(options.remainingSeconds, 25 * 60)
      : 25 * 60,
    currentFocusSeconds: toSafeFocusInteger(options.currentFocusSeconds, 0),
    running: Boolean(options.running),
    pausedReason: String(options.pausedReason || ""),
    overrunPromptShown: Boolean(options.overrunPromptShown),
  };
}

function normalizeFocusTimerState(rawState, options = {}) {
  const raw = rawState && typeof rawState === "object" && !Array.isArray(rawState) ? rawState : {};
  const now = toSafeFocusInteger(options.now, Date.now());
  const today = options.date || getFocusDateKey(now);
  const isToday = raw.date === today;
  const mode = raw.mode === "pomodoro" ? "pomodoro" : "free";
  const isV3 = raw.timerVersion === FOCUS_TIMER_VERSION;
  const state = createFocusTimerState({
    now,
    date: today,
    mode,
    activeTaskId: isToday && isV3 ? raw.activeTaskId : "",
    activeTaskName: isToday && isV3 ? raw.activeTaskName : "",
    attribution: isToday && isV3 ? raw.attribution : "unassigned",
    roundStartedAt: isToday ? raw.roundStartedAt : null,
    segmentStartedAt: isToday && isV3 ? raw.segmentStartedAt : null,
    lastHeartbeatAt: isToday && isV3 ? raw.lastHeartbeatAt : null,
    remainingSeconds: isToday && mode === "pomodoro" ? raw.remainingSeconds : 25 * 60,
    currentFocusSeconds: isToday ? raw.currentFocusSeconds : 0,
    running: isToday && isV3 ? raw.running : false,
    pausedReason: isToday && isV3
      ? raw.pausedReason
      : isToday && Object.keys(raw).length ? "legacy-state" : "",
    overrunPromptShown: isToday && isV3 ? raw.overrunPromptShown : false,
  });
  if (!state.segmentStartedAt || !state.lastHeartbeatAt || state.lastHeartbeatAt < state.segmentStartedAt) {
    state.running = false;
    state.segmentStartedAt = null;
    state.lastHeartbeatAt = null;
    if (isToday && isV3 && raw.running) state.pausedReason = "invalid-state";
  }
  if (state.mode === "pomodoro" && state.remainingSeconds <= 0) state.remainingSeconds = 25 * 60;
  return state;
}

function startFocusTimerSegment(state, options = {}) {
  const now = toSafeFocusInteger(options.now, Date.now());
  const next = createFocusTimerState({ ...state, now });
  if (next.running) return next;
  next.date = options.date || getFocusDateKey(now);
  next.activeTaskId = String(options.activeTaskId || "");
  next.activeTaskName = String(options.activeTaskName || "");
  next.attribution = next.activeTaskId ? "task" : "unassigned";
  next.roundStartedAt = next.roundStartedAt || now;
  next.segmentStartedAt = now;
  next.lastHeartbeatAt = now;
  next.running = true;
  next.pausedReason = "";
  if (options.resetOverrunPrompt) next.overrunPromptShown = false;
  return next;
}

function finalizeFocusTimerSegment(state, options = {}) {
  const requestedEnd = toSafeFocusInteger(options.endedAt, Date.now());
  const gapThresholdMs = toSafeFocusInteger(options.gapThresholdMs, FOCUS_HEARTBEAT_GAP_MS);
  const next = createFocusTimerState({ ...state, now: requestedEnd });
  const startedAt = toSafeFocusInteger(next.segmentStartedAt, 0);
  const heartbeatAt = toSafeFocusInteger(next.lastHeartbeatAt, 0);
  let reason = String(options.reason || "paused");
  let effectiveEnd = requestedEnd;

  if (!next.running || !startedAt || !heartbeatAt || heartbeatAt < startedAt || requestedEnd < startedAt) {
    next.running = false;
    next.segmentStartedAt = null;
    next.lastHeartbeatAt = null;
    next.pausedReason = reason === "paused" ? "invalid-state" : reason;
    return { state: next, seconds: 0, segment: null, reason: next.pausedReason };
  }

  if (requestedEnd - heartbeatAt > gapThresholdMs) {
    effectiveEnd = heartbeatAt;
    reason = "device-sleep";
  }

  const boundary = getFocusDateBoundary(next.date);
  if (boundary && effectiveEnd >= boundary) {
    effectiveEnd = boundary;
    reason = "date-rollover";
  }

  let seconds = Math.max(0, Math.floor((effectiveEnd - startedAt) / 1000));
  if (next.mode === "pomodoro") seconds = Math.min(seconds, next.remainingSeconds);
  const endedAt = startedAt + seconds * 1000;
  const segment = seconds > 0 ? {
    date: next.date,
    mode: next.mode,
    seconds,
    taskId: next.activeTaskId,
    taskName: next.activeTaskName,
    attribution: next.attribution,
    startedAt,
    endedAt,
    reason,
  } : null;

  next.currentFocusSeconds += seconds;
  if (next.mode === "pomodoro") next.remainingSeconds = Math.max(0, next.remainingSeconds - seconds);
  next.running = false;
  next.segmentStartedAt = null;
  next.lastHeartbeatAt = null;
  next.pausedReason = reason;
  return { state: next, seconds, segment, reason };
}

function getLiveFocusSegmentSeconds(state, now = Date.now()) {
  if (!state || !state.running || !state.segmentStartedAt || !state.lastHeartbeatAt) return 0;
  const safeNow = toSafeFocusInteger(now, Date.now());
  if (safeNow < state.segmentStartedAt || safeNow - state.lastHeartbeatAt > FOCUS_HEARTBEAT_GAP_MS) return 0;
  let effectiveEnd = safeNow;
  const boundary = getFocusDateBoundary(state.date);
  if (boundary && effectiveEnd > boundary) effectiveEnd = boundary;
  let seconds = Math.max(0, Math.floor((effectiveEnd - state.segmentStartedAt) / 1000));
  if (state.mode === "pomodoro") seconds = Math.min(seconds, toSafeFocusInteger(state.remainingSeconds, 0));
  return seconds;
}

function shouldShowFocusOverrun(taskFocusSeconds, plannedSeconds, promptShown) {
  const taskSeconds = toSafeFocusInteger(taskFocusSeconds, 0);
  const planSeconds = toSafeFocusInteger(plannedSeconds, 0);
  return !promptShown && planSeconds > 0 && taskSeconds >= planSeconds + 30 * 60;
}

function applyFocusSegmentToLedger(focusTotals, taskTotals, segment) {
  const safeFocusTotals = focusTotals && typeof focusTotals === "object" && !Array.isArray(focusTotals) ? { ...focusTotals } : {};
  const safeTaskTotals = taskTotals && typeof taskTotals === "object" && !Array.isArray(taskTotals) ? { ...taskTotals } : {};
  const seconds = toSafeFocusInteger(segment && segment.seconds, 0);
  const date = String(segment && segment.date || "");
  if (!date || seconds <= 0) return { focusTotals: safeFocusTotals, taskTotals: safeTaskTotals, applied: false };
  safeFocusTotals[date] = toSafeFocusInteger(safeFocusTotals[date], 0) + seconds;
  const taskId = String(segment.taskId || "");
  if (taskId) {
    const existingDateTotals = safeTaskTotals[date] && typeof safeTaskTotals[date] === "object"
      ? safeTaskTotals[date]
      : {};
    safeTaskTotals[date] = { ...existingDateTotals, [taskId]: toSafeFocusInteger(existingDateTotals[taskId], 0) + seconds };
  }
  return { focusTotals: safeFocusTotals, taskTotals: safeTaskTotals, applied: true };
}
