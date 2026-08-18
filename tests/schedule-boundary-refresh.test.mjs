import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const tasksSource = fs.readFileSync(new URL("../js/tasks.js", import.meta.url), "utf8");
const p0ResultsSource = fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function sourceBlock(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test("the next schedule refresh is aligned just after the minute boundary", () => {
  const functionSource = appSource.match(/function getNextScheduleBoundaryDelay\(nowMilliseconds = Date\.now\(\)\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const context = vm.createContext({ Date });
  vm.runInContext(`${functionSource}\nthis.getDelay = getNextScheduleBoundaryDelay;`, context);
  assert.equal(context.getDelay(0), 60075);
  assert.equal(context.getDelay(59999), 76);
  assert.equal(context.getDelay(60000), 60075);
});

test("the app refreshes on minute ticks and when a stale page returns to the foreground", () => {
  assert.match(appSource, /function getScheduleBoundaryMinuteKey\(now = new Date\(\)\)/);
  assert.match(appSource, /function refreshScheduleBoundary\(\{ force = false, now = new Date\(\) \} = \{\}\)/);
  assert.match(appSource, /window\.setTimeout\([\s\S]*getNextScheduleBoundaryDelay\(\)/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange"[\s\S]*document\.visibilityState === "visible"[\s\S]*refreshScheduleBoundary\(\)/);
  assert.match(appSource, /window\.addEventListener\("pageshow", \(\) => refreshScheduleBoundary\(\)\)/);
  assert.match(appSource, /renderRecentSevenDays\(\);\s*initScheduleBoundaryRefresh\(\);/);
});

test("a changed calendar date uses the full rollover before any light refresh", () => {
  assert.match(appSource, /let renderedDashboardDateKey = ""/);
  assert.match(appSource, /const nextDateKey = getDateKey\(now\)/);
  assert.match(appSource, /const dateChanged = Boolean\(renderedDashboardDateKey && renderedDashboardDateKey !== nextDateKey\)/);
  assert.match(appSource, /const refresh = dateChanged \? refreshDashboardForDateRollover : refreshScheduleBoundDashboardUi/);
  assert.match(appSource, /if \(typeof refresh !== "function" \|\| !refresh\(\)\) return false;\s*renderedDashboardDateKey = nextDateKey/);
});

test("a protected date rollover remains pending until the full refresh succeeds", () => {
  const functionSource = appSource.match(/function refreshScheduleBoundary\(\{ force = false, now = new Date\(\) \} = \{\}\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const calls = [];
  const context = vm.createContext({
    getScheduleBoundaryMinuteKey: () => "2026-08-19T00:00",
    getDateKey: () => "2026-08-19",
    refreshDashboardForDateRollover: () => {
      calls.push("rollover");
      return context.rolloverAllowed;
    },
    refreshScheduleBoundDashboardUi: () => {
      calls.push("light");
      return true;
    },
    renderedDashboardDateKey: "2026-08-18",
    lastScheduleBoundaryMinuteKey: "2026-08-18T23:59",
    rolloverAllowed: false,
  });
  vm.runInContext(`${functionSource}\nthis.refreshBoundary = refreshScheduleBoundary;`, context);
  assert.equal(context.refreshBoundary({ force: true }), false);
  assert.equal(context.renderedDashboardDateKey, "2026-08-18");
  assert.equal(context.lastScheduleBoundaryMinuteKey, "2026-08-18T23:59");
  context.rolloverAllowed = true;
  assert.equal(context.refreshBoundary({ force: true }), true);
  assert.equal(context.renderedDashboardDateKey, "2026-08-19");
  assert.equal(context.lastScheduleBoundaryMinuteKey, "2026-08-19T00:00");
  assert.deepEqual(calls, ["rollover", "rollover"]);
});

test("automatic schedule refresh is read-only and waits for an active focus round", () => {
  const refreshBlock = sourceBlock(tasksSource, "function refreshScheduleBoundDashboardUi", "function resetDateScopedExecutionUi");
  assert.match(refreshBlock, /if \(isExecutionSurfaceFocusProtected\(\)\) return false/);
  assert.match(refreshBlock, /updateCompletionRate\(\)/);
  assert.match(refreshBlock, /renderFocusTaskOptions\(\)/);
  assert.match(refreshBlock, /renderP0FinalHome\(\)/);
  assert.match(refreshBlock, /syncDueReviewScheduleGateUi\(getTodayPlan\(\)\)/);
  assert.match(refreshBlock, /renderDailyCloseout\(\)/);
  assert.doesNotMatch(refreshBlock, /writeJson|localStorage\.setItem|saveTodayPlan|setTaskStatus|renderTasks\(|renderDueReviews\(/);
});

test("date rollover rolls the formal plan first and refreshes every date-bound view", () => {
  const rolloverBlock = sourceBlock(tasksSource, "function resetDateScopedExecutionUi", "function getResultHandoffModel");
  const calls = [];
  const context = vm.createContext({
    isExecutionSurfaceFocusProtected: () => context.focusProtected,
    rollCurrentDetailedPlanWindow: () => calls.push("roll-plan"),
    updateTodayDate: () => calls.push("date"),
    renderTasks: () => calls.push("tasks"),
    loadReviewFields: () => calls.push("review-fields"),
    renderDueReviews: () => calls.push("due-reviews"),
    renderManualStudyRecords: () => calls.push("study-records"),
    renderStudyTimeSummary: () => calls.push("study-summary"),
    renderOutputRecords: () => calls.push("output-records"),
    renderP1WeeklyStats: () => calls.push("weekly"),
    renderHistory: () => calls.push("history"),
    renderRecentSevenDays: () => calls.push("recent"),
    focusProtected: true,
  });
  vm.runInContext(`${rolloverBlock}\nthis.refreshDate = refreshDashboardForDateRollover;`, context);
  assert.equal(context.refreshDate(), false);
  assert.deepEqual(calls, []);
  context.focusProtected = false;
  assert.equal(context.refreshDate(), true);
  assert.deepEqual(calls, [
    "roll-plan", "date", "tasks", "review-fields", "due-reviews", "study-records",
    "study-summary", "output-records", "weekly", "history", "recent",
  ]);
  assert.ok(calls.indexOf("roll-plan") < calls.indexOf("tasks"));
  assert.doesNotMatch(rolloverBlock, /saveTodayPlan|writeHistory|clearLearningData|location\.reload/);
  assert.match(tasksSource, /reason: "date-rollover"[\s\S]*refreshScheduleBoundary\(\{ force: true \}\)/);
});

test("review gate refresh updates controls in place without erasing evidence", () => {
  const syncBlock = sourceBlock(p0ResultsSource, "function syncDueReviewScheduleGateUi", "function validateRollingReviewCompletion");
  assert.match(syncBlock, /querySelectorAll\("\.review-schedule-gate"\)/);
  assert.match(syncBlock, /querySelectorAll\("\[data-review-start\]"\)/);
  assert.match(syncBlock, /button\.disabled = !reviewGate\.allowed/);
  assert.match(syncBlock, /button\.title = reviewGate\.allowed \? "" : reviewGate\.message/);
  assert.doesNotMatch(syncBlock, /replaceChildren|textarea|writeJson|localStorage\.setItem/);
  assert.match(p0ResultsSource, /if \(!reviewGate\.allowed\) \{\s*syncDueReviewScheduleGateUi\(plan\)/);
});

test("schedule refresh assets share one cache contract", () => {
  assert.match(indexSource, /js\/app\.js\?v=local-offline-v159/);
  assert.match(indexSource, /js\/tasks\.js\?v=weekly-improvement-v154/);
  assert.match(indexSource, /js\/p0-results\.js\?v=safe-date-rollover-v153/);
  assert.match(serviceWorkerSource, /study-dashboard-local-offline-v159/);
  assert.match(serviceWorkerSource, /js\/app\.js\?v=local-offline-v159/);
  assert.match(serviceWorkerSource, /js\/tasks\.js\?v=weekly-improvement-v154/);
  assert.match(serviceWorkerSource, /js\/p0-results\.js\?v=safe-date-rollover-v153/);
});
