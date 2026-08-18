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

test("automatic schedule refresh is read-only and waits for an active focus round", () => {
  const refreshBlock = sourceBlock(tasksSource, "function refreshScheduleBoundDashboardUi", "function getResultHandoffModel");
  assert.match(refreshBlock, /if \(isExecutionSurfaceFocusProtected\(\)\) return false/);
  assert.match(refreshBlock, /updateCompletionRate\(\)/);
  assert.match(refreshBlock, /renderFocusTaskOptions\(\)/);
  assert.match(refreshBlock, /renderP0FinalHome\(\)/);
  assert.match(refreshBlock, /syncDueReviewScheduleGateUi\(getTodayPlan\(\)\)/);
  assert.match(refreshBlock, /renderDailyCloseout\(\)/);
  assert.doesNotMatch(refreshBlock, /writeJson|localStorage\.setItem|saveTodayPlan|setTaskStatus|renderTasks\(|renderDueReviews\(/);
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
  assert.match(indexSource, /js\/app\.js\?v=schedule-boundary-refresh-v152/);
  assert.match(indexSource, /js\/tasks\.js\?v=schedule-boundary-refresh-v152/);
  assert.match(indexSource, /js\/p0-results\.js\?v=schedule-boundary-refresh-v152/);
  assert.match(serviceWorkerSource, /study-dashboard-schedule-boundary-refresh-v152/);
  assert.match(serviceWorkerSource, /js\/app\.js\?v=schedule-boundary-refresh-v152/);
  assert.match(serviceWorkerSource, /js\/tasks\.js\?v=schedule-boundary-refresh-v152/);
  assert.match(serviceWorkerSource, /js\/p0-results\.js\?v=schedule-boundary-refresh-v152/);
});
