import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/p0-final.js", import.meta.url), "utf8");
const reviewSource = fs.readFileSync(new URL("../js/review.js", import.meta.url), "utf8");
const tasksSource = fs.readFileSync(new URL("../js/tasks.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
const examStatsSource = fs.readFileSync(new URL("../js/exam-stats.js", import.meta.url), "utf8");
const p0ResultsSource = fs.readFileSync(new URL("../js/p0-results.js", import.meta.url), "utf8");
const p1ResultsSource = fs.readFileSync(new URL("../js/p1-results.js", import.meta.url), "utf8");
const p1OutputSource = fs.readFileSync(new URL("../js/p1-output.js", import.meta.url), "utf8");
const executionStateSource = fs.readFileSync(new URL("../js/execution-state-core.js", import.meta.url), "utf8");
const progressRunnerSource = fs.readFileSync(new URL("../js/progress-runner.js", import.meta.url), "utf8");

test("homepage starts with one execution cockpit and keeps low-frequency information collapsed", () => {
  assert.match(indexSource, /id="execution" class="panel home-order-1"/);
  assert.match(indexSource, /<details id="todayPlanPanel" class="panel home-order-2 today-plan-panel" aria-labelledby="planTitle">/);
  assert.match(indexSource, /id="todayPlanSummary"/);
  assert.doesNotMatch(indexSource, /<details id="todayPlanPanel"[^>]*\sopen(?:\s|>)/);
  assert.match(indexSource, /class="panel home-order-3" aria-labelledby="dueReviewsTitle"/);
  assert.match(indexSource, /class="panel home-order-4" aria-labelledby="reviewTitle"/);
  assert.match(indexSource, /<details class="panel phase-overview-panel home-order-5 low-frequency-panel"/);
  assert.match(indexSource, /<details id="todayDetailsPanel" class="panel home-order-6 low-frequency-panel"/);
  assert.match(indexSource, /<details class="execution-settings low-frequency-panel">/);
  assert.doesNotMatch(indexSource, /aria-labelledby="topPriorityTitle"/);
  assert.doesNotMatch(indexSource, /<details class="panel phase-overview-panel[^>]* open/);
});

test("one pure execution-state arbiter owns every cockpit takeover", () => {
  assert.match(executionStateSource, /function deriveExecutionSurfaceMode\(input = \{\}\)/);
  assert.match(executionStateSource, /function createExecutionSurfaceView\(input = \{\}\)/);
  assert.match(executionStateSource, /function createExecutionSurfaceCommand\(view\)/);
  assert.match(executionStateSource, /function executionSurfaceCommandsMatch\(left, right\)/);
  assert.match(executionStateSource, /function selectDailyGuidanceItem\(items, options = \{\}\)/);
  assert.match(executionStateSource, /taskMismatch[\s\S]*任务状态需要刷新[\s\S]*disabled: true/);
  assert.match(executionStateSource, /focusProtected[\s\S]*safeguardActive[\s\S]*dailyHandoffActive[\s\S]*nightCloseoutActive[\s\S]*executionGapActive/);
  assert.match(indexSource, /execution-state-core\.js[^>]*><\/script>[\s\S]*tasks\.js[^>]*><\/script>/);
  assert.match(tasksSource, /function renderTasks\(\)[\s\S]*renderExecutionSurface\(\);\s*renderResultHandoff\(\);/);
  assert.match(tasksSource, /function getExecutionSurfaceSnapshot\(\)[\s\S]*deriveExecutionSurfaceMode\(/);
  assert.match(tasksSource, /function renderExecutionSurface\(\)[\s\S]*getExecutionSurfaceSnapshot\(\)/);
  assert.match(tasksSource, /function resetExecutionSurfaceLayers\(plan\)/);
  assert.match(tasksSource, /function applyExecutionSurfaceView\(view\)/);
  assert.match(tasksSource, /applyExecutionSurfaceDecorations\(snapshot\.mode, snapshot\)[\s\S]*applyExecutionSurfaceView\(snapshot\.view\)/);
  assert.equal((tasksSource.match(/document\.querySelector\("#executionTitle"\)/g) || []).length, 1);
  assert.equal((tasksSource.match(/document\.querySelector\("#cockpitTaskMeta"\)/g) || []).length, 1);
  assert.equal((tasksSource.match(/document\.querySelector\("#cockpitTaskDescription"\)/g) || []).length, 1);
  const renderTasksBlock = tasksSource.slice(tasksSource.indexOf("function renderTasks"), tasksSource.indexOf("function renderResultHandoff"));
  assert.doesNotMatch(renderTasksBlock, /renderSafeguardMode\(\)|renderDailyHandoffMode\(\)|renderDailyExecutionGapGuard\(\)/);
});

test("the full timetable is a compact overview until the user needs it", () => {
  assert.match(indexSource, /<summary class="today-plan-summary">[\s\S]*id="todayPlanSummary"[\s\S]*<div class="today-plan-body">[\s\S]*id="taskList"/);
  assert.match(tasksSource, /planSummary\.textContent = `已完成 \$\{done\}\/\$\{total\} · \$\{currentLabel\} · 剩余 \$\{Math\.max\(0, total - done\)\}`/);
  assert.match(tasksSource, /const currentTask = findNextExecutablePlanTask\(plan\.tasks, plan\.currentTaskId/);
  assert.match(tasksSource, /if \(action\.kind === "professional"\) \{\s*const planPanel = document\.querySelector\("#todayPlanPanel"\);\s*if \(planPanel\) planPanel\.open = true;/);
  assert.match(styleSource, /\.today-plan-panel > summary \{/);
  assert.match(styleSource, /\.today-plan-panel:not\(\[open\]\) > \.today-plan-body \{ display: none; \}/);
  assert.match(styleSource, /\.today-plan-body \{/);
});

test("redundant cumulative statistics are removed without removing data safety tools", () => {
  assert.doesNotMatch(indexSource, /exam-stats-panel|examStatsTotal|examSubjectBars/);
  assert.doesNotMatch(indexSource, /examStatsStartDate|saveExamStatsStartDateBtn/);
  assert.match(indexSource, /id="recentSevenDays"/);
  assert.match(indexSource, /id="exportJsonBtn"/);
  assert.match(indexSource, /id="importJsonBtn"/);
  const context = vm.createContext({ console, document: { querySelector: () => null } });
  vm.runInContext(`${examStatsSource}\ninitExamStats();`, context);
});

test("the primary immersive entry starts a five-minute round in one click", () => {
  assert.match(indexSource, /id="enterFocusModeBtn"[^>]*>先做5分钟<\/button>/);
  assert.match(indexSource, /id="startFreeFocusBtn"[^>]*>直接自由专注<\/button>/);
  assert.match(tasksSource, /const FIVE_MINUTE_START_SECONDS = 5 \* 60/);
  assert.match(tasksSource, /prepareFiveMinuteStartup\(task\)/);
  assert.match(tasksSource, /startImmersiveFocus\(task\)/);
  assert.match(tasksSource, /function handleCockpitPrimaryAction\(\)/);
  assert.match(tasksSource, /function executeExecutionSurfaceCommand\(snapshot\)/);
  assert.match(tasksSource, /performUnifiedTaskAction\(task, command\.taskAction, command\.contextId\)/);
  assert.match(tasksSource, /executionSurfaceCommandsMatch\(activeExecutionSurfaceSnapshot\?\.command, freshSnapshot\.command\)/);
  const handlerBlock = tasksSource.slice(tasksSource.indexOf("function handleCockpitPrimaryAction"), tasksSource.indexOf("function syncFocusRoundGoal"));
  assert.doesNotMatch(handlerBlock, /dataset\./);
  assert.match(tasksSource, /#enterFocusModeBtn"\)\.addEventListener\("click", handleCockpitPrimaryAction\)/);
});

test("a not-started cockpit task can bypass the five-minute startup only through the explicit free-focus entry", () => {
  assert.match(tasksSource, /function canStartCockpitFreeFocus\(snapshot\)[\s\S]*getTaskStatus\(task\) === "not-started"[\s\S]*isCountedLearningTask\(task\)/);
  assert.match(tasksSource, /function syncCockpitFreeFocusButton\(snapshot\)[\s\S]*button\.hidden = !available[\s\S]*button\.disabled = !available/);
  assert.match(tasksSource, /function handleCockpitFreeFocusAction\(\)[\s\S]*executionSurfaceCommandsMatch\(activeExecutionSurfaceSnapshot\?\.command, freshSnapshot\.command\)[\s\S]*startImmersiveFocus\(task, \{ directFree: true \}\)/);
  assert.match(tasksSource, /function startImmersiveFocus\(task, options = \{\}\)[\s\S]*options\.directFree === true[\s\S]*setFocusTimingMode\(FREE_FOCUS_MODE\)[\s\S]*else if[\s\S]*prepareFiveMinuteStartup\(task\)/);
  assert.match(tasksSource, /#startFreeFocusBtn"\)\.addEventListener\("click", handleCockpitFreeFocusAction\)/);
});

test("the rendered execution snapshot is the only cockpit action source", () => {
  assert.match(tasksSource, /let activeExecutionSurfaceSnapshot = null/);
  assert.match(tasksSource, /command: createExecutionSurfaceCommand\(view\)/);
  assert.match(tasksSource, /activeExecutionSurfaceSnapshot = snapshot/);
  assert.match(tasksSource, /if \(!executionSurfaceCommandsMatch\([\s\S]*renderExecutionSurface\(\);[\s\S]*任务状态已更新，请确认后再点击/);
  assert.match(tasksSource, /command\.kind === "handoff"[\s\S]*command\.kind === "closeout"[\s\S]*command\.kind === "safeguard-exit"[\s\S]*command\.kind === "task"/);
  assert.match(tasksSource, /function startDailyHandoff\(model\)[\s\S]*task\.id !== model\.selectedTaskId[\s\S]*syncFocusRoundGoal\(model\.action\)/);
  assert.match(tasksSource, /getResultHandoffModel\(executionSnapshot = activeExecutionSurfaceSnapshot \|\| getExecutionSurfaceSnapshot\(\)\)/);
});

test("task-row primary actions use the same stale-command protection as the cockpit", () => {
  assert.match(tasksSource, /const taskPrimaryCommandByButton = new WeakMap\(\)/);
  assert.match(tasksSource, /function getTaskRowPrimaryCommand\(task, status = getTaskStatus\(task\), config = getUnifiedTaskPrimary\(task, status\)\)/);
  assert.match(tasksSource, /taskPrimaryCommandByButton\.set\(button, getTaskRowPrimaryCommand\(task, status, config\)\)/);
  assert.match(tasksSource, /const renderedPrimaryCommand = taskPrimaryCommandByButton\.get\(action\) \|\| null/);
  assert.match(tasksSource, /const taskId = renderedPrimaryCommand\?\.taskId \|\| renderedFreeFocusCommand\?\.taskId \|\| action\.dataset\.taskId/);
  assert.match(tasksSource, /const freshCommand = getTaskRowPrimaryCommand\(task\);[\s\S]*executionSurfaceCommandsMatch\(renderedPrimaryCommand, freshCommand\)[\s\S]*performUnifiedTaskAction\(task, freshCommand\.taskAction, freshCommand\.contextId\)/);
});

test("not-started formal task rows expose a guarded free-focus shortcut without affecting review or active rounds", () => {
  assert.match(tasksSource, /const taskFreeFocusCommandByButton = new WeakMap\(\)/);
  assert.match(tasksSource, /function canTaskRowStartFreeFocus\(task, status = getTaskStatus\(task\)\)[\s\S]*status === "not-started"[\s\S]*task\.category !== "rollingReview"[\s\S]*isCountedLearningTask\(task\)[\s\S]*!hasPendingRound/);
  assert.match(tasksSource, /function createTaskRowFreeFocusButton\(task, status\)[\s\S]*label: "自由专注"[\s\S]*taskFreeFocusCommandByButton\.set\(button, getTaskRowPrimaryCommand\(task, status, config\)\)/);
  assert.match(tasksSource, /const freeFocusButton = createTaskRowFreeFocusButton\(task, status\)[\s\S]*if \(freeFocusButton\) controls\.append\(freeFocusButton\)/);
  assert.match(tasksSource, /const renderedFreeFocusCommand = taskFreeFocusCommandByButton\.get\(action\) \|\| null[\s\S]*freshFreeFocusCommand[\s\S]*executionSurfaceCommandsMatch\(renderedFreeFocusCommand, freshFreeFocusCommand\)[\s\S]*startImmersiveFocus\(task, \{ directFree: true \}\)/);
});

test("the cockpit takes over one overdue formal-result gap without new stored state", () => {
  assert.match(tasksSource, /function getExecutionGapSurfaceView\(takeover\)/);
  assert.match(tasksSource, /关键缺口 1\/\$\{gap\.remainingCount\}/);
  assert.match(tasksSource, /先补5分钟/);
  assert.match(tasksSource, /execution-gap-action/);
  assert.match(tasksSource, /renderTasks\(\)[\s\S]*renderExecutionSurface\(\);\s*renderResultHandoff\(\);/);
  assert.match(tasksSource, /syncFiveMinuteStartupUi\(\);\s*renderExecutionSurface\(\);/);
  assert.match(tasksSource, /const validation = validateProfessionalTaskCompletion\(task\);\s*if \(!validation\.valid\)/);
  assert.match(tasksSource, /validateP1EnglishTaskCompletion\(english\)\.valid/);
  assert.match(tasksSource, /hasP1PoliticsExecution\(politicsRecord\)/);
  assert.match(indexSource, /id="closeoutClosedBookStatus">尚未保存/);
  assert.match(reviewSource, /closedBookProductSaved/);
  assert.doesNotMatch(tasksSource, /studyDailyExecutionGap|localStorage\.setItem\([^)]*Gap/);
});

test("the fixed timetable keeps vocabulary in the morning and formal English reading in the afternoon", () => {
  assert.match(tasksSource, /makeTask\("english-words", "08:00—08:25"/);
  assert.match(tasksSource, /makeTask\("english-reading", "15:45—17:15"/);
  assert.match(tasksSource, /makeTask\("sunday-reading", "15:45—17:15"/);
  assert.match(tasksSource, /makeTask\(isSunday \? "sunday-english-main" : "english-main", "15:45—17:15"/);
  const gaps = tasksSource.slice(tasksSource.indexOf("function buildDailyExecutionGapItems"), tasksSource.indexOf("function prefillNightCloseoutTomorrow"));
  assert.match(gaps, /const englishDeadline = getPlanTaskBoundaryMinutes\(english, "end", 17 \* 60 \+ 15\)/);
  assert.match(gaps, /const task722Deadline = getPlanTaskBoundaryMinutes\(task722, "end", 10 \* 60 \+ 35\)/);
  assert.match(gaps, /const task844Deadline = getPlanTaskBoundaryMinutes\(task844, "end", 12 \* 60 \+ 20\)/);
  assert.match(gaps, /下午英语阅读时间块已经结束/);
  assert.doesNotMatch(gaps, /middayDeadline|上午时间块已经结束，但英语阅读/);
});

test("the English reading anchor protects its preparation and exam-practice window without stored replanning", () => {
  const gaps = tasksSource.slice(tasksSource.indexOf("function buildDailyExecutionGapItems"), tasksSource.indexOf("function prefillNightCloseoutTomorrow"));
  const takeover = tasksSource.slice(tasksSource.indexOf("function getDailyExecutionTakeover"), tasksSource.indexOf("function resetExecutionSurfaceLayers"));
  assert.match(gaps, /isProtectedAnchor: true/);
  assert.match(gaps, /transitionMinutes: 15, minimumBlockMinutes: 5/);
  assert.match(gaps, /anchorDescription: "保护下午英语阅读锚点/);
  assert.match(takeover, /getAnchorAwareDailyExecutionGap/);
  assert.match(takeover, /锚点准备/);
  assert.match(takeover, /锚点进行中/);
  assert.match(takeover, /开始英语5分钟/);
  assert.doesNotMatch(takeover, /writeJson|localStorage\.setItem|setTaskStatus|saveTodayPlan/);
  assert.match(indexSource, /js\/p1-integration-core\.js\?v=anchor-aware-v127/);
  assert.match(indexSource, /js\/tasks\.js\?v=review-focus-loop-v142/);
  assert.match(indexSource, /js\/p0-final\.js\?v=execution-brief-v141/);
  assert.match(serviceWorkerSource, /js\/p1-integration-core\.js\?v=anchor-aware-v127/);
  assert.match(serviceWorkerSource, /js\/tasks\.js\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /js\/p0-final\.js\?v=execution-brief-v141/);
});

test("all takeover builders return views instead of writing cockpit fields", () => {
  [
    ["function getSafeguardExecutionSurfaceModel", "function getDailyHandoffDismissKey"],
    ["function getDailyHandoffExecutionSurfaceModel", "function getPlanTaskBoundaryMinutes"],
    ["function getNightCloseoutExecutionSurfaceView", "function isExecutionSurfaceFocusProtected"],
    ["function getExecutionGapSurfaceView", "function resetExecutionSurfaceLayers"],
  ].forEach(([start, end]) => {
    const block = tasksSource.slice(tasksSource.indexOf(start), tasksSource.indexOf(end));
    assert.match(block, /createExecutionSurfaceView\(/);
    assert.doesNotMatch(block, /#executionTitle|#cockpitTaskMeta|#cockpitTaskDescription|#enterFocusModeBtn/);
  });
});

test("execution-gap takeover keeps the same exact start action as focus and closeout", () => {
  assert.match(tasksSource, /function getDailyExecutionGapStartAction\(task\)[\s\S]*getFiveMinuteStartAction\(task\)/);
  assert.match(tasksSource, /function getDailyExecutionGapTomorrowAction\(task, fallback\)[\s\S]*getTaskExactStartAction\(task\)/);
  assert.match(tasksSource, /function prefillNightCloseoutTomorrow\(items\)[\s\S]*selectDailyGuidanceItem\(items, \{ actionField: "tomorrowAction" \}\)/);
  assert.match(tasksSource, /startAction: getDailyExecutionGapStartAction\(task722\)/);
  assert.match(tasksSource, /tomorrowAction: getDailyExecutionGapTomorrowAction\(task722,/);
  assert.match(tasksSource, /startAction: getDailyExecutionGapStartAction\(task844\)/);
  assert.match(tasksSource, /function getDailyExecutionGapStartDescription\(task\)[\s\S]*formatTaskStartContext\(context\)/);
  assert.match(tasksSource, /const startDescription = getDailyExecutionGapStartDescription\(task\)/);
  assert.match(tasksSource, /`\$\{gap\.description\}\$\{startAction\}`/);
});

test("night stop protects sleep, reuses the closeout draft, and never auto-completes gaps", () => {
  assert.match(tasksSource, /function getNightExecutionSchedule/);
  assert.match(tasksSource, /21 \* 60 \+ 40/);
  assert.match(tasksSource, /22 \* 60 \+ 30/);
  assert.match(tasksSource, /20 \* 60 \+ 30/);
  assert.match(tasksSource, /21 \* 60 \+ 30/);
  assert.match(tasksSource, /晚间止损 1\/\$\{gap\.remainingCount\} · 最多完成两项/);
  assert.match(tasksSource, /现在收工，不再开启新任务/);
  assert.match(tasksSource, /primary: \{ label: "两句话收工", action: "night-closeout", className: "primary" \}/);
  assert.match(tasksSource, /saveDailyCloseoutDraft\(\)/);
  assert.doesNotMatch(tasksSource, /studyNightStop|setTaskStatus\([^,]+,\s*"skipped"\)/);
});

test("five-minute completion offers only continue or blocker pause", () => {
  assert.match(indexSource, /id="focusStartupChoiceCard"/);
  assert.match(indexSource, />继续25分钟</);
  assert.match(indexSource, />记录卡点并暂停</);
  assert.match(tasksSource, /showFiveMinuteStartupChoice\(session\)/);
  assert.match(tasksSource, /if \(typeof renderTasks === "function"\) renderTasks\(\)/);
  assert.match(tasksSource, /updateFocusSessionWrapup\(pendingStartupSession\.id, "完成5分钟启动", "继续25分钟"\)/);
  assert.match(tasksSource, /请写下具体卡点，避免下次重新判断/);
  assert.match(tasksSource, /isFiveMinuteStartupRound\(\) \? "startup-completed" : "pomodoro-completed"/);
  assert.match(styleSource, /\.focus-overlay-selector\[hidden\] \{ display: none; \}/);
});

test("formal tasks carry the settled focus session into one direct result handoff", () => {
  assert.match(tasksSource, /function canOpenFocusWrapupResult\(action\)/);
  assert.match(tasksSource, /if \(canOpenFocusWrapupResult\(resultAction\)\) \{\s*pendingFocusWrapup = null;\s*pendingFocusResultSession = \{[\s\S]*sessionId: String\(session\.id \|\| ""\)[\s\S]*taskId: String\(task && task\.id \|\| ""\)[\s\S]*exitFocusMode\(\);\s*openFocusWrapupResult\(task, resultAction\);/);
  assert.match(tasksSource, /\["words", "reading", "english", "politics"\]\.includes\(action\.kind\)/);
  assert.match(tasksSource, /action\.kind === "output"/);
  assert.match(tasksSource, /action\.kind === "professional"/);
  assert.doesNotMatch(tasksSource, /finishFocusWrapupAndRecord|syncFocusWrapupResultButton/);
  assert.doesNotMatch(indexSource, /id="saveWrapupRecordBtn"/);
  assert.match(indexSource, /id="saveWrapupExitBtn"/);
  assert.match(indexSource, /id="saveWrapupContinueBtn"/);
});

test("returning from an interrupted focus round offers one-click recovery", () => {
  assert.match(indexSource, /id="focusRecoveryCard"/);
  assert.match(indexSource, />继续当前任务</);
  assert.match(indexSource, />任务太难，缩小到一个动作</);
  assert.match(indexSource, /切换标签页时继续学习计时/);
  assert.match(tasksSource, /function showFocusRecoveryIfNeeded\(\)/);
  assert.match(tasksSource, /shouldShowFocusRecovery\(focusTimerState\)/);
  assert.match(tasksSource, /syncFocusRoundGoal\(getFiveMinuteStartAction\(task\)\)/);
  assert.match(tasksSource, /focusTimerState\.pausedReason = "manual-pause"/);
  assert.match(tasksSource, /if \(document\.visibilityState === "hidden"\) continueFocusWhilePageHidden\(\)/);
  assert.match(tasksSource, /else resumeFocusAfterHiddenPage\(\)/);
  assert.doesNotMatch(tasksSource, /pauseFocusForPageExit\("page-hidden"\)/);
  assert.match(tasksSource, /reason === "pagehide" && focusTimerContinuedWhileHidden/);
  assert.match(tasksSource, /window\.addEventListener\("pagehide", \(\) => pauseFocusForPageExit\("pagehide"\)\)/);
  assert.match(indexSource, /js\/focus-timer-core\.js\?v=background-focus-v118/);
  assert.match(indexSource, /js\/tasks\.js\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /js\/focus-timer-core\.js\?v=background-focus-v118/);
  assert.match(serviceWorkerSource, /js\/tasks\.js\?v=review-focus-loop-v142/);
  assert.match(indexSource, /js\/p0-results\.js\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /js\/p0-results\.js\?v=review-focus-loop-v142/);
  assert.match(styleSource, /\.focus-recovery-card\[hidden\] \{ display: none; \}/);
});

test("low-state safeguard exposes one formal execution chain without a second result system", () => {
  assert.match(indexSource, /id="enterSafeguardModeBtn"/);
  assert.match(indexSource, /状态很差？进入今日保底执行/);
  assert.match(indexSource, /id="safeguardModeBanner"/);
  assert.match(tasksSource, /buildSafeguardSequence\(plan\.tasks/);
  assert.match(tasksSource, /一个真实闭卷产物/);
  assert.match(tasksSource, /单词继续在 App 中完成，不重复登记/);
  assert.doesNotMatch(tasksSource, /完成最高优先级滚动复盘/);
  assert.doesNotMatch(tasksSource, /button\.dataset\.taskAction = "safeguard-review"/);
  assert.match(tasksSource, /用两句话结束今天/);
  assert.match(tasksSource, /sessionStorage\.setItem\(SAFEGUARD_MODE_SESSION_KEY/);
  assert.doesNotMatch(tasksSource, /localStorage\.setItem\(["']studySafeguardMode/);
  assert.match(styleSource, /body\.safeguard-mode \.dashboard > \*/);
});

test("daily handoff starts from yesterday's exact saved breakpoint without changing the plan", () => {
  assert.match(indexSource, /id="dailyHandoffBanner"/);
  assert.match(indexSource, /id="dismissDailyHandoffBtn"/);
  assert.match(tasksSource, /function getDailyHandoffCandidateForToday\(plan = getTodayPlan\(\), nowMinutes/);
  assert.match(tasksSource, /buildScheduledDailyHandoffCandidate\(/);
  assert.match(tasksSource, /getDailyHandoffCandidateForToday\(plan, schedule\.nowMinutes\)/);
  assert.match(tasksSource, /yesterdayRecord && yesterdayRecord\.tomorrowPriority/);
  assert.match(tasksSource, /yesterdayRecord && Array\.isArray\(yesterdayRecord\.tasks\)/);
  assert.doesNotMatch(tasksSource, /yesterdayPlan && Array\.isArray\(yesterdayPlan\.tasks\)/);
  assert.match(tasksSource, /getProfessionalUnits\(yesterday, subject\)/);
  assert.match(tasksSource, /function getDailyHandoffExecutionSurfaceModel\(candidate, plan = getTodayPlan\(\)\)/);
  assert.match(tasksSource, /mode: EXECUTION_SURFACE_MODES\.DAILY_HANDOFF,[\s\S]*taskId: task\.id,[\s\S]*description: candidate\.action,[\s\S]*label: "直接开始5分钟", action: "daily-handoff-start", taskId: task\.id/);
  assert.match(tasksSource, /function applyExecutionTaskPreview\(task, description = ""\)/);
  assert.match(tasksSource, /applyExecutionTaskPreview\(model\.task, model\.action\)/);
  assert.match(tasksSource, /function previewFocusTask\(task, statusMessage = ""\)/);
  assert.match(tasksSource, /select\.value = task\.id;\s*syncFocusModeContent\(\);\s*if \(statusMessage\) setStatus\("#executionStatus", statusMessage\)/);
  assert.match(tasksSource, /syncFocusRoundGoal\(model\.action\)/);
  assert.match(tasksSource, /sessionStorage\.setItem\(getDailyHandoffDismissKey\(\), "1"\)/);
  assert.match(styleSource, /body\.daily-handoff-mode \.dashboard > \*/);
});

test("professional cockpit and five-minute startup share the latest saved exact breakpoint", () => {
  assert.match(tasksSource, /function getSavedProfessionalStartAction\(task\)/);
  assert.match(tasksSource, /task\.category === "maYuan" \? "722" : task\.category === "maHistory" \? "844"/);
  assert.match(tasksSource, /findLatestProfessionalBreakpoint\(readProfessionalStore\(\), subject, getDateKey\(\)\)/);
  assert.match(tasksSource, /return getTaskStartContext\(task\)\?\.action \|\| ""/);
  assert.match(tasksSource, /function getDefaultExecutionSurfaceView\(task, plan = getTodayPlan\(\), now = new Date\(\)\)[\s\S]*description: getTaskExecutionDescription\(task\)/);
  assert.match(tasksSource, /function applyExecutionSurfaceView\(view\)[\s\S]*description\.textContent = view\.description/);
  assert.match(tasksSource, /#focusOutput"\)\.value = task \? getTaskExecutionDescription\(task\) : ""/);
  assert.match(tasksSource, /#focusModeOutput"\)\.textContent = task \? getTaskExecutionDescription\(task\) : ""/);
  assert.match(tasksSource, /syncFocusRoundGoal\(getFiveMinuteStartAction\(task\)\)/);
  assert.match(tasksSource, /if \(focusOutput\) focusOutput\.value = text/);
  assert.match(tasksSource, /if \(focusModeOutput\) focusModeOutput\.textContent = text/);
});

test("today's explicit plan action and manual edit outrank historical breakpoints", () => {
  assert.match(tasksSource, /function normalizeTaskStartAction\(value\)/);
  assert.match(tasksSource, /!\/\^\(\?:未记录\|未填写\|暂无\|无\)\$\/i\.test\(action\)/);
  assert.match(tasksSource, /function getPlannedTaskStartAction\(task\)/);
  assert.match(tasksSource, /function getPlannedTaskStartContext\(task\)[\s\S]*normalizeTaskStartAction\(task\.nextStart\)[\s\S]*normalizeTaskStartAction\(task\.minimum\)[\s\S]*task\.manualEdited === true \? normalizeTaskStartAction\(task\.description\)/);
  const plannedSource = tasksSource.slice(tasksSource.indexOf("function getPlannedTaskStartContext"), tasksSource.indexOf("function getTaskExactStartAction"));
  assert.doesNotMatch(plannedSource, /completionCriteria/);
});

test("historical breakpoints keep provenance in display but not in the raw action", () => {
  assert.match(tasksSource, /function getTaskStartContext\(task\)/);
  assert.match(tasksSource, /source: "formal-record", date: breakpoint\.date/);
  assert.match(tasksSource, /source: "manual-edit", date: getDateKey\(\)/);
  assert.match(tasksSource, /function formatTaskStartDate\(dateKey\)/);
  assert.match(tasksSource, /承接 \$\{date\} 正式记录/);
  assert.match(tasksSource, /if \(context\.source === "manual-edit"\) return `人工调整：\$\{action\}`/);
  assert.match(tasksSource, /function getTaskExactStartAction\(task\)[\s\S]*getTaskStartContext\(task\)\?\.action/);
});

test("English politics and output reuse their latest formally saved breakpoint", () => {
  assert.match(tasksSource, /function getSavedRecordedStartAction\(task\)/);
  assert.match(tasksSource, /\["english", "englishReading"\]\.includes\(task\.category\)[\s\S]*readP1Records\(englishReadingRecordsKey\)[\s\S]*fields = \["nextStart"\]/);
  assert.match(tasksSource, /task\.category === "politics"[\s\S]*readP1Records\(politicsRecordsKey\)[\s\S]*fields = \["nextStart"\]/);
  assert.match(tasksSource, /task\.category === "output"[\s\S]*inferPlanOutputSubject\(task\)[\s\S]*readOutputRecords\(\)\.filter\([\s\S]*record\.subject[\s\S]*fields = \["nextAction"\]/);
  assert.match(tasksSource, /findLatestExecutionBreakpoint\(records, fields, getDateKey\(\)\)/);
});

test("output breakpoints fail closed instead of crossing 722 and 844", () => {
  assert.match(tasksSource, /if \(subject\) \{[\s\S]*String\(record && record\.subject \|\| ""\) === subject[\s\S]*fields = \["nextAction"\]/);
  assert.doesNotMatch(tasksSource, /task\.category === "output"[^}]*records = readOutputRecords\(\);/);
});

test("timetable and next-task preview reuse the shared execution brief", () => {
  assert.match(tasksSource, /function renderTasks\(\)[\s\S]*renderTaskExecutionBrief\(brief, getTaskExecutionBrief\(task\), \{ compact: true \}\)/);
  assert.match(tasksSource, /function getTaskExecutionBrief\(task\)[\s\S]*getTaskStartContext\(task\)[\s\S]*createTaskExecutionBrief\(/);
  assert.match(source, /const priorityTask = priority\.type === "task"[\s\S]*getTaskExecutionBrief\(priorityTask\)[\s\S]*executionBrief\.startAction[\s\S]*executionBrief\.completionCriteria/);
  assert.match(source, /meta\.textContent = \[priority\.meta, executionDescription\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.doesNotMatch(source, /getTaskExecutionBrief\(priorityTask\)[\s\S]*writeJson|saveTodayPlan|startPomodoro/);
});

test("successful formal results return one transient receipt and prepare the next task without auto-start", () => {
  assert.match(indexSource, /id="resultHandoffReceipt" class="result-handoff-receipt" hidden/);
  assert.match(indexSource, /id="resultHandoffTitle"/);
  assert.match(indexSource, /id="resultHandoffNext"/);
  assert.match(indexSource, /id="startResultHandoffNextBtn"[^>]*>先做下一项5分钟<\/button>/);
  assert.match(indexSource, /id="startResultHandoffFreeBtn"[^>]*hidden>下一项自由专注<\/button>/);
  assert.match(indexSource, /id="dismissResultHandoffBtn"[^>]*>稍后再做<\/button>/);
  assert.match(styleSource, /\.result-handoff-receipt\[hidden\] \{ display: none; \}/);
  assert.match(styleSource, /\.result-handoff-receipt \.result-handoff-actions/);
  assert.match(tasksSource, /let resultHandoffReceipt = null/);
  assert.match(tasksSource, /let activeResultHandoffModel = null/);
  assert.match(tasksSource, /function getResultHandoffModel\(executionSnapshot = activeExecutionSurfaceSnapshot \|\| getExecutionSurfaceSnapshot\(\)\)/);
  assert.match(executionStateSource, /function createResultHandoffModel\(input = \{\}\)/);
  assert.match(executionStateSource, /receiptKey: `\$\{receiptTaskId\}\\n\$\{savedLabel\}`/);
  assert.match(executionStateSource, /const command = taskId \? \{ \.\.\.executionCommand, taskId \} : emptyCommand\(\)/);
  assert.match(executionStateSource, /buttonLabel: taskId \? executionLabel : ""/);
  assert.match(executionStateSource, /function resultHandoffModelsMatch\(left, right\)/);
  assert.match(executionStateSource, /left\.taskKey === right\.taskKey/);
  assert.match(executionStateSource, /left\.displayKey === right\.displayKey/);
  assert.match(executionStateSource, /left\.freeFocusAvailable === right\.freeFocusAvailable/);
  assert.match(executionStateSource, /displayKey: \[model\.title, model\.nextText, model\.buttonLabel, model\.freeFocusAvailable \? "free-focus" : "no-free-focus"\]\.join\("\\n"\)/);
  assert.match(tasksSource, /createResultHandoffModel\(\{[\s\S]*receipt: resultHandoffReceipt,[\s\S]*executionCommand,[\s\S]*executionLabel: executionSnapshot\?\.view\?\.primary\?\.label,[\s\S]*description: getTaskExecutionDescription\(task\),[\s\S]*status: getTaskStatus\(task\)/);
  const resultModelSource = tasksSource.slice(tasksSource.indexOf("function getResultHandoffModel"), tasksSource.indexOf("function renderResultHandoff"));
  assert.match(resultModelSource, /executionSnapshot\?\.command \|\| createExecutionSurfaceCommand\(null\)/);
  assert.doesNotMatch(resultModelSource, /#focusTask|view\?\.primary\?\.taskId/);
  assert.match(executionStateSource, /suppliedTaskId === commandTaskId/);
  assert.match(tasksSource, /activeResultHandoffModel = model/);
  assert.match(tasksSource, /function showResultHandoff\(taskId, savedLabel\)/);
  assert.match(tasksSource, /\[task\.id, task\.taskId\]\.some\(\(candidate\) => String\(candidate \|\| ""\) === savedTaskId\)/);
  assert.match(tasksSource, /renderResultHandoff\(\);\s*if \(completePendingFocusResultSession\(activeResultHandoffModel\)\)/);
  assert.match(tasksSource, /#execution"\)\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(tasksSource, /#enterFocusModeBtn"\)\?\.focus\(\{ preventScroll: true \}\)/);
  const handoffSource = tasksSource.slice(tasksSource.indexOf("function showResultHandoff"), tasksSource.indexOf("function dismissResultHandoff"));
  assert.doesNotMatch(handoffSource, /localStorage|sessionStorage|writeJson|saveTodayPlan|startPomodoro/);
  assert.match(tasksSource, /function startResultHandoffNext\(\)[\s\S]*getResultHandoffModel\(getExecutionSurfaceSnapshot\(\)\)[\s\S]*resultHandoffModelsMatch\(activeResultHandoffModel, freshModel\)[\s\S]*setResultHandoffStaleStatus\(\)[\s\S]*dismissResultHandoff\(\)[\s\S]*executeExecutionSurfaceCommand\(freshModel\.executionSnapshot\)/);
  const startHandoffSource = tasksSource.slice(tasksSource.indexOf("function startResultHandoffNext"), tasksSource.indexOf("function setTaskStatus"));
  assert.doesNotMatch(startHandoffSource, /dataset\./);
  assert.doesNotMatch(startHandoffSource, /performUnifiedTaskAction/);
  assert.match(resultModelSource, /task,[\s\S]*executionSnapshot/);
  assert.match(tasksSource, /startButton\.hidden = !model\.command\.valid[\s\S]*startButton\.disabled = !model\.command\.valid/);
  assert.doesNotMatch(executionStateSource, /taskStatus === "not-started" \? "先做下一项5分钟" : "继续下一项"/);
  assert.doesNotMatch(handoffSource, /startResultHandoffNext|performUnifiedTaskAction/);
  assert.match(p0ResultsSource, /saveProfessionalUnit\(\{ deferResultHandoff: true \}\)/);
  assert.match(p0ResultsSource, /showResultHandoff\(lastSavedTask\.id, `已保存：\$\{parts\.join\("；"\)\}`\)/);
  assert.match(p1ResultsSource, /showResultHandoff\(context\.taskId, "已保存：英语阅读结果"\)/);
  assert.match(p1ResultsSource, /showResultHandoff\(taskId, "已保存：政治学习结果"\)/);
  assert.match(p1OutputSource, /showResultHandoff\(taskId, `已保存：\$\{input\.subject\} 闭卷输出`\)/);
});

test("focus result handoff closes the formal loop and keeps both next-task start modes guarded", () => {
  assert.match(indexSource, /id="focusResultHandoffCard"[^>]*hidden/);
  assert.match(indexSource, /id="focusResultHandoffStartBtn"/);
  assert.match(indexSource, /id="focusResultHandoffFreeBtn"[^>]*hidden/);
  assert.match(indexSource, /id="focusResultHandoffLaterBtn"/);
  assert.match(styleSource, /\.focus-result-handoff-card\[hidden\] \{ display: none; \}/);
  assert.match(tasksSource, /let pendingFocusResultSession = null/);
  assert.match(tasksSource, /function showFocusWrapup\(session\)[\s\S]*pendingFocusResultSession = \{[\s\S]*sessionId: String\(session\.id \|\| ""\)[\s\S]*taskId: String\(task && task\.id \|\| ""\)[\s\S]*openFocusWrapupResult\(task, resultAction\)/);
  assert.match(tasksSource, /function completePendingFocusResultSession\(model\)[\s\S]*updateFocusSessionWrapup\(pending\.sessionId, completed, nextStep\)[\s\S]*pendingFocusResultSession = null[\s\S]*renderTodayFocusOutputs\(\)[\s\S]*renderHistory\(\)/);
  assert.match(tasksSource, /function showResultHandoff\(taskId, savedLabel\)[\s\S]*completePendingFocusResultSession\(activeResultHandoffModel\)[\s\S]*showFocusResultHandoffCard\(activeResultHandoffModel\)/);
  assert.match(tasksSource, /function startResultHandoffFreeFocus\(\)[\s\S]*resultHandoffModelsMatch\(activeResultHandoffModel, freshModel\)[\s\S]*freshModel\.freeFocusAvailable[\s\S]*startImmersiveFocus\(task, \{ directFree: true \}\)/);
  assert.match(executionStateSource, /freeFocusAvailable: Boolean\(taskId[\s\S]*taskStatus === "not-started"[\s\S]*executionCommand\.taskAction === "unified-start"\)/);
  assert.match(tasksSource, /#focusResultHandoffStartBtn"\)\.addEventListener\("click", startResultHandoffNext\)/);
  assert.match(tasksSource, /#focusResultHandoffFreeBtn"\)\.addEventListener\("click", startResultHandoffFreeFocus\)/);
  assert.match(tasksSource, /#focusResultHandoffLaterBtn"\)\.addEventListener\("click", dismissResultHandoff\)/);
});

test("legacy structured task text stays readable across execution and review snapshots", () => {
  assert.match(tasksSource, /function getTaskStudyRoleLabel\(task\)[\s\S]*typeof rawRole === "string"[\s\S]*\["key", "role", "id", "value", "type"\][\s\S]*typeof rawRole\.label === "string"/);
  assert.match(tasksSource, /function readTaskText\(value, preferredFields = \[\]\)/);
  assert.match(tasksSource, /\^\\\[object\\s\+\[\^\\\]\]\+\\\]\$\/i\.test\(text\) \? "" : text/);
  assert.match(tasksSource, /function normalizeTaskStartAction\(value\) \{\s*const action = readTaskText\(value/);
  assert.match(tasksSource, /function getTaskStartContext\(task\)[\s\S]*normalizeTaskStartAction\(context && context\.action\)[\s\S]*return \{ \.\.\.context, action \}/);
  assert.match(tasksSource, /function formatTaskStartContext\(context\) \{\s*const action = normalizeTaskStartAction\(context && context\.action\)/);
  assert.match(tasksSource, /function getTaskExecutionDescription\(task\)[\s\S]*readTaskText\(task\.description[\s\S]*readTaskText\(task\.minimum/);
  assert.match(reviewSource, /function readReviewTaskText\(value, preferredFields = \[\]\)/);
  assert.match(reviewSource, /description: readReviewTaskText\(task\.description \|\| task\.minimum/);
  assert.doesNotMatch(tasksSource.slice(tasksSource.indexOf("function getTaskExecutionDescription"), tasksSource.indexOf("function getFiveMinuteStartAction")), /String\(task\.(?:description|minimum)/);
});

test("one read-only execution brief supplies the cockpit timetable focus and result handoff", () => {
  assert.match(executionStateSource, /function createTaskExecutionBrief\(input = \{\}\)/);
  assert.match(tasksSource, /function getTaskExecutionBrief\(task\)[\s\S]*getTaskPhaseExecutionContext\(task\)[\s\S]*createTaskExecutionBrief\(/);
  assert.match(tasksSource, /completionCandidates:[\s\S]*phase\.completionCriteria[\s\S]*保存真实完成内容、未完成点和下一准确起点/);
  assert.match(tasksSource, /fallbackCandidates:[\s\S]*时间不足时保留真实未完成状态/);
  assert.match(indexSource, /id="cockpitExecutionBrief"/);
  assert.match(indexSource, /id="resultHandoffBrief"/);
  assert.match(indexSource, /id="focusModeExecutionBrief"/);
  assert.match(indexSource, /id="focusResultHandoffBrief"/);
  assert.match(indexSource, /style\.css\?v=review-focus-loop-v142/);
  assert.match(indexSource, /js\/execution-state-core\.js\?v=review-focus-loop-v142/);
  assert.match(indexSource, /js\/tasks\.js\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /study-dashboard-review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /style\.css\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /js\/execution-state-core\.js\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /js\/tasks\.js\?v=review-focus-loop-v142/);
  assert.match(tasksSource, /#cockpitExecutionBrief"\), displayedTask \? getTaskExecutionBrief\(displayedTask\) : null/);
  assert.match(tasksSource, /#focusModeExecutionBrief"\), task \? getTaskExecutionBrief\(task\) : null/);
  assert.match(tasksSource, /#focusResultHandoffBrief"\),[\s\S]*model\.task \? getTaskExecutionBrief\(model\.task\) : null/);
  const briefSource = tasksSource.slice(tasksSource.indexOf("function getTaskExecutionBrief"), tasksSource.indexOf("function getFiveMinuteStartAction"));
  assert.doesNotMatch(briefSource, /writeJson|saveTodayPlan|localStorage\.setItem|sessionStorage\.setItem/);
});

test("focus completion cannot bypass tracked English or politics results", () => {
  assert.match(p1ResultsSource, /function validateP1TrackedTaskCompletion\(task, date = getDateKey\(\)\)/);
  assert.match(p1ResultsSource, /kind === "english-main"[\s\S]*validateP1EnglishTaskCompletion\(task\)/);
  assert.match(p1ResultsSource, /kind !== "politics"[\s\S]*findP1Record\(politicsRecordsKey, date, taskId\)[\s\S]*hasP1PoliticsExecution\(record\)/);
  const completionSource = tasksSource.slice(tasksSource.indexOf("function completeCurrentTask"), tasksSource.indexOf("function enterFocusMode"));
  assert.match(completionSource, /validateP1TrackedTaskCompletion\(task\)/);
  assert.match(completionSource, /finalizeFocusSegment\(\{ reason: "p1-result-required" \}\)/);
  assert.match(completionSource, /getP1TaskKind\(task\) === "politics" \? "politics" : "reading"/);
  assert.match(completionSource, /return;[\s\S]*validateRollingReviewCompletion/);
});

test("professional completion settles focus once and opens the formal result flow", () => {
  const completionSource = tasksSource.slice(tasksSource.indexOf("function completeCurrentTask"), tasksSource.indexOf("function enterFocusMode"));
  const professionalBlock = completionSource.slice(
    completionSource.indexOf('if (typeof validateProfessionalTaskCompletion === "function")'),
    completionSource.indexOf('if (typeof validateP1OutputTaskCompletion === "function")'),
  );
  assert.match(professionalBlock, /finalizeFocusSegment\(\{ reason: "professional-result-required" \}\)/);
  assert.equal((professionalBlock.match(/finalizeFocusSegment\(/g) || []).length, 1);
  assert.match(professionalBlock, /resetFocusRound\(\);[\s\S]*updatePomodoroDisplay\(\)/);
  assert.match(professionalBlock, /if \(result\.session\) showFocusWrapup\(result\.session\)/);
  assert.match(professionalBlock, /exitFocusMode\(\)[\s\S]*openProfessionalTaskRecord\(task\)/);
  assert.match(professionalBlock, /return;/);
});

test("every professional completion gap uses the task-bound result entry", () => {
  const taskChangeSource = tasksSource.slice(tasksSource.indexOf("function handleTaskListChange"), tasksSource.indexOf("function handleTaskListClick"));
  const professionalBlock = taskChangeSource.slice(
    taskChangeSource.indexOf('if (select.value === "completed" && typeof validateProfessionalTaskCompletion === "function")'),
    taskChangeSource.indexOf('if (select.value === "completed" && typeof validateP1OutputTaskCompletion === "function")'),
  );
  assert.match(professionalBlock, /openProfessionalTaskRecord\(task\)/);
  assert.doesNotMatch(professionalBlock, /professionalResultsPanel/);
});

test("manual pause buttons pass stable reasons instead of browser event objects", () => {
  assert.match(tasksSource, /#pausePomodoroBtn"\)\.addEventListener\("click", \(\) => pausePomodoro\("manual-pause"\)\)/);
  assert.match(tasksSource, /#focusModePauseBtn"\)\.addEventListener\("click", \(\) => pausePomodoro\("manual-pause"\)\)/);
  assert.doesNotMatch(tasksSource, /addEventListener\("click", pausePomodoro\)/);
});

test("rolling review uses one direct-result queue and cannot bypass due work", () => {
  assert.match(p0ResultsSource, /当前只做这一条/);
  assert.match(p0ResultsSource, /\[\["passed", "通过"\], \["partial", "部分通过"\], \["failed", "未通过"\]\]/);
  assert.match(p0ResultsSource, /查看后续队列/);
  assert.doesNotMatch(p0ResultsSource, /select\.dataset\.reviewResult/);
  assert.match(tasksSource, /处理下一条（今日剩\$\{reviewState\.remainingCount\}）/);
  assert.match(p0ResultsSource, /今日预算 \$\{state\.completedCount\} \/ \$\{state\.totalCount\} · 待做 \$\{state\.remainingCount\} · 历史积压 \$\{state\.backlogCount\}/);
  assert.match(p0ResultsSource, /appendReviewBacklog\(container, state, today\)/);
  assert.match(p0ResultsSource, /function getReviewWorkloadForPlan\(queue, today, plan\)/);
  assert.match(p0ResultsSource, /getReviewExecutionState\(queue, getDateKey\(\), \{ task \}\)/);
  assert.match(tasksSource, /validateRollingReviewCompletion/);
});

test("one daily review workload drives cockpit progress and the scheduled execution gap", () => {
  assert.match(indexSource, /今日复盘待做/);
  assert.match(indexSource, /id="cockpitDueReviewsMeta"/);
  assert.match(source, /getReviewWorkloadForPlan\(reviewQueue, date, plan\)/);
  assert.match(source, /cockpitCount\.textContent = String\(actionableCount\)/);
  assert.match(source, /历史积压 \$\{reviewState\.backlogCount\}/);
  assert.match(tasksSource, /key: "review", taskId: rollingReview\.id, priority: 40/);
  assert.match(tasksSource, /deadlineMinutes: getPlanTaskBoundaryMinutes\(rollingReview, "end", 21 \* 60\)/);
  assert.match(tasksSource, /今日\$\{reviewState\.budgetMinutes\}分钟复盘预算还有\$\{reviewState\.remainingCount\}条/);
  assert.match(tasksSource, /config\.action === "unified-review" \? config\.label/);
  assert.match(progressRunnerSource, /reviewBudgetDue: reviewState \? reviewState\.totalCount/);
  assert.match(progressRunnerSource, /reviewBudgetCompleted: reviewState \? reviewState\.completedCount/);
  assert.match(progressRunnerSource, /reviewBacklog: reviewState \? reviewState\.backlogCount/);
  assert.match(progressRunnerSource, /model\.reviewMode === "daily-budget"/);
});

test("rolling review requires closed-book evidence before a result can be saved", () => {
  assert.match(p0ResultsSource, /记住了=\$\{normalized\.remembered/);
  assert.match(p0ResultsSource, /请先填写“记住了”/);
  assert.match(p0ResultsSource, /button\.disabled = !validation\.valid/);
  assert.match(p0ResultsSource, /source\.hidden = !validation\.valid/);
  assert.match(p0ResultsSource, /开始5分钟遮挡复述/);
  assert.match(tasksSource, /function startReviewFiveMinuteRound/);
  assert.match(tasksSource, /已有未结束的专注轮，请先继续或结束当前专注/);
  assert.match(styleSource, /\.review-evidence-box/);
  assert.doesNotMatch(p0ResultsSource, /localStorage\.setItem\([^)]*reviewEvidence/);
});

test("review focus closes directly into evidence result and the next review handoff", () => {
  assert.match(indexSource, /id="focusReviewResultCard"[^>]*hidden/);
  assert.match(indexSource, /id="focusReviewEvidence"/);
  assert.match(indexSource, /data-focus-review-result="passed"[^>]*disabled/);
  assert.match(indexSource, /data-focus-review-result="partial"[^>]*disabled/);
  assert.match(indexSource, /data-focus-review-result="failed"[^>]*disabled/);
  assert.match(indexSource, /id="focusReviewLaterBtn"/);
  assert.match(indexSource, /id="focusReviewNextBtn"[^>]*hidden/);
  assert.match(styleSource, /\.focus-review-result-card\[hidden\] \{ display: none; \}/);
  assert.match(tasksSource, /contextId: String\(reviewState\.active && reviewState\.active\.reviewId \|\| ""\)/);
  assert.match(tasksSource, /function startCurrentReviewFromExecution\(expectedReviewId\)[\s\S]*state\.active\.reviewId !== reviewId[\s\S]*startReviewFiveMinuteRound\(state\.active\)/);
  assert.match(tasksSource, /function startReviewFiveMinuteRound\(review\)[\s\S]*state\.active\.reviewId !== reviewId[\s\S]*pendingFocusReview = \{[\s\S]*reviewId,[\s\S]*sessionId: ""/);
  assert.match(tasksSource, /function finishPomodoroIfNeeded[\s\S]*reviewCompleted[\s\S]*showFocusReviewResultCard\(session\)/);
  assert.match(tasksSource, /function updateFocusReviewEvidenceUi\(\)[\s\S]*validateReviewEvidence\(parseReviewEvidenceQuickRecord\(textarea\.value\)\)[\s\S]*button\.disabled = !validation\.valid/);
  assert.match(p0ResultsSource, /function saveDueReviewResult\(reviewId, resultCode, evidenceInput\)[\s\S]*currentState\.active\.reviewId !== id[\s\S]*applyReviewResult\(queue, id, resultCode[\s\S]*writeJson\(reviewQueueKey, outcome\.records\)/);
  assert.match(tasksSource, /function saveFocusReviewResult\(resultCode\)[\s\S]*saveDueReviewResult\(pendingFocusReview\.reviewId, resultCode, validation\.evidence\)[\s\S]*focusReviewNextReviewId = String\(outcome\.nextReview/);
  const saveBlock = tasksSource.slice(tasksSource.indexOf("function saveFocusReviewResult"), tasksSource.indexOf("function startNextFocusReview"));
  assert.doesNotMatch(saveBlock, /startReviewFiveMinuteRound|startPomodoro/);
  const deferBlock = tasksSource.slice(tasksSource.indexOf("function deferFocusReviewEvidence"), tasksSource.indexOf("function exitFocusMode"));
  assert.doesNotMatch(deferBlock, /saveDueReviewResult|applyReviewResult|writeJson/);
  assert.match(executionStateSource, /const contextMismatch = Boolean\(contextId && primaryContextId && contextId !== primaryContextId\)/);
  assert.match(executionStateSource, /\["mode", "kind", "action", "taskId", "contextId", "taskAction"\]/);
  assert.match(indexSource, /js\/p0-results\.js\?v=review-focus-loop-v142/);
  assert.match(serviceWorkerSource, /js\/p0-results\.js\?v=review-focus-loop-v142/);
});

test("cockpit exposes only execution facts while retaining detailed controls", () => {
  assert.match(indexSource, /id="cockpitTaskMeta"/);
  assert.match(indexSource, /id="cockpitTaskDescription"/);
  assert.match(indexSource, /id="todayStudyTotal"/);
  assert.match(indexSource, /id="completionRate"/);
  assert.match(indexSource, /id="cockpitDueReviewsCount"/);
  assert.match(tasksSource, /function startReviewFiveMinuteRound/);
  assert.doesNotMatch(tasksSource, /renderReviewPriorityCockpit|priority-review-start|review-priority-mode/);
  assert.match(indexSource, /id="topPriorityList"/);
  assert.match(indexSource, /下一项学习任务/);
  assert.match(source, /selectDailyGuidanceItem\(buildDailyExecutionGapItems\(plan \|\| \{ tasks: \[\] \}\), \{/);
  assert.match(source, /actionField: "startAction"[\s\S]*excludeTaskId: selectedTaskId[\s\S]*excludeKeys: \["review"\]/);
  assert.match(source, /link\.href = "#planTitle"/);
  assert.doesNotMatch(source, /priority\.type === "review" \? "#dueReviewsTitle"/);
  assert.match(indexSource, /<section class="today-study-timeline-card"[\s\S]*id="manualStudyStartTime"[\s\S]*id="manualStudyHours"[\s\S]*<details class="execution-settings low-frequency-panel">/);
  assert.match(indexSource, /<details class="execution-settings low-frequency-panel">[\s\S]*id="focusTask"/);
  assert.match(indexSource, /<details id="todayDetailsPanel"[\s\S]*id="summaryDueToday"[\s\S]*id="exportTodaySnapshotBtn"[\s\S]*id="historyList"/);
});

test("external rolling review stays visible but cannot lower execution completion or take over the cockpit", () => {
  assert.match(tasksSource, /function isDashboardExecutionTask\(task\)/);
  assert.match(tasksSource, /String\(task && task\.category \|\| ""\) !== "rollingReview"/);
  assert.match(tasksSource, /const tasks = plan\.tasks\.filter\(isDashboardExecutionTask\)/);
  assert.match(reviewSource, /function isDashboardCloseoutTask\(task\)/);
  assert.match(reviewSource, /String\(task\.category \|\| ""\) === "rollingReview"/);
  assert.doesNotMatch(tasksSource, /key: "review", taskId: review\.id/);
  assert.doesNotMatch(tasksSource, /gap\.key === "review"/);
  assert.match(indexSource, /id="cockpitDueReviewsCount"/);
  assert.match(indexSource, /id="dueReviewsPanel"/);
  assert.match(p0ResultsSource, /function validateRollingReviewCompletion/);
});

function parseQuickReview(value) {
  const context = vm.createContext({ console });
  vm.runInContext(`${reviewSource}\nglobalThis.parseQuickReview = parseDailyReviewQuickRecord;`, context);
  return context.parseQuickReview(value);
}

function buildQuickReviewTemplate(tasks) {
  const context = vm.createContext({
    console,
    isCountedLearningTask: (task) => task.counted === true || (!Object.prototype.hasOwnProperty.call(task, "counted") && !task.exercise),
    taskWasCompleted: (task) => Boolean(task) && (task.status === "completed" || task.completed === true),
  });
  vm.runInContext(`${reviewSource}\nglobalThis.buildQuickReviewTemplate = buildDailyReviewQuickTemplate;`, context);
  return context.buildQuickReviewTemplate(tasks);
}

test("daily review template derives only explicit formal learning task status", () => {
  const template = buildQuickReviewTemplate([
    { name: "英语", counted: true, status: "completed" },
    { name: "722 马克思主义基本原理", counted: true, status: "not-started", focusSeconds: 3600 },
    { name: "专业课输出", counted: true, status: "skipped" },
    { name: "滚动复盘", counted: true, category: "rollingReview", status: "not-started" },
    { name: "午饭、午休", counted: false, status: "completed" },
    { name: "锻炼", counted: false, exercise: true, status: "completed" },
  ]);
  assert.equal(template, "完成=英语\n未完成=722 马克思主义基本原理、专业课输出\n原因=\n收获=\n明日第一优先=");
});

test("record actions use simple user-facing wording", () => {
  assert.doesNotMatch(indexSource, /解析并保存|填写后粘贴|复制模板/);
  assert.match(indexSource, />生成双科模板<\/button>/);
  assert.doesNotMatch(indexSource, /生成今日复盘/);
  assert.match(indexSource, /id="reviewOutcomeNote"/);
  assert.match(indexSource, /id="reviewTomorrowAction"/);
  assert.match(indexSource, />一键收工<\/button>/);
  assert.match(reviewSource, /function buildDailyCloseoutSummary/);
  assert.match(reviewSource, /sessionStorage\.setItem\(getDailyCloseoutDraftKey\(\)/);
  assert.match(reviewSource, /有未保存修改；点击“一键收工”后才会写入今日记录/);
  assert.match(tasksSource, /label: reviewSaved \? "查看今日闭环" : "一键收工",[\s\S]*action: "daily-closeout"/);
  assert.match(tasksSource, /button\.dataset\.taskAction = view\.primary\.action/);
  assert.match(p1ResultsSource, /copyButton\.hidden = true/);
  assert.match(p1ResultsSource, /saveButton\.textContent = "保存记录"/);
  assert.match(p1OutputSource, /copyOutputTemplateBtn"\)\.hidden = true/);
  assert.match(p1OutputSource, /saveOutputQuickBtn"\)\.textContent = "保存记录"/);
  assert.match(p1ResultsSource, /createTaskButton\("记录阅读结果"/);
  assert.match(p1ResultsSource, /createTaskButton\("记录政治结果"/);
  assert.match(p1OutputSource, /createTaskButton\("记录闭卷输出"/);
  assert.doesNotMatch(`${p1ResultsSource}\n${p1OutputSource}`, /编辑阅读结果|编辑政治结果|编辑输出结果/);
});

test("completing the English main task opens reading result instead of word result", () => {
  assert.match(tasksSource, /getP1TaskKind\(task\) === "politics" \? "politics" : "reading"/);
  assert.match(tasksSource, /openP1ResultDialog\(resultType, String\(task\.taskId \|\| task\.id\)\)/);
  assert.doesNotMatch(tasksSource, /openP1ResultDialog\("words", String\(task\.taskId \|\| task\.id\)\)/);
});

test("English summary separates saved execution from unfinished review", () => {
  assert.match(p1ResultsSource, /阅读记录：\$\{hasP1EnglishReadingAttempt/);
  assert.match(p1ResultsSource, /当次复盘：\$\{P1_READING_REVIEW_LABELS/);
  assert.match(p1ResultsSource, /英语任务：\$\{state\.derivedStatus === "completed" \? "已完成"/);
  assert.doesNotMatch(p1ResultsSource, /items\.push\(`阅读：\$\{P1_STATUS_LABELS/);
});

test("a valid closed-book output automatically completes only its output task", () => {
  assert.match(p1OutputSource, /completeOutputTaskAfterValidSave\(outcome\.record, outcome\.records\)/);
  assert.match(p1OutputSource, /validateOutputTaskCompletion\(task, records, record\.date\)\.valid/);
  assert.match(p1OutputSource, /item\.category === "output" \|\| item\.sourceTaskKey === "outputOrMock"/);
  assert.match(p1OutputSource, /setTaskStatus\(task, "completed"\)/);
  assert.match(p1OutputSource, /focusTimerState\.activeTaskId === task\.id/);
});

test("politics summary separates a saved execution from result quality", () => {
  assert.match(p1ResultsSource, /政治记录：\$\{hasP1PoliticsExecution/);
  assert.match(p1ResultsSource, /政治任务：\$\{hasP1PoliticsExecution/);
  assert.doesNotMatch(p1ResultsSource, /summary\.textContent = `政治：\$\{P1_STATUS_LABELS/);
});

test("task result actions prefill templates without an extra generate click", () => {
  assert.match(p1ResultsSource, /if \(type === "words"\) copyEnglishWordQuickTemplate\(\)/);
  assert.match(p1ResultsSource, /else if \(type === "reading"\) copyEnglishReadingQuickTemplate\(\)/);
  assert.match(p1ResultsSource, /else copyPoliticsQuickTemplate\(\)/);
  assert.match(p1OutputSource, /inferPlanOutputSubject\(task\)/);
  assert.match(p1OutputSource, /getOutputQuickDraftSubject\(quickRecord\.value\)/);
  assert.match(p1OutputSource, /if \(draftSubject && targetSubject && draftSubject !== targetSubject\)/);
  assert.match(p1OutputSource, /else if \(!draftSubject\) \{\s*copyOutputQuickTemplate\(targetSubject\)/);
  assert.match(p1OutputSource, /原文已保留/);
});

test("template generation stays in the form without clipboard access", () => {
  const templateSources = [p0ResultsSource, reviewSource, p1ResultsSource, p1OutputSource].join("\n");
  assert.doesNotMatch(templateSources, /navigator\.clipboard|document\.execCommand/);
  assert.match(p0ResultsSource, /textarea\.setSelectionRange\(0, 0\)/);
  assert.doesNotMatch(reviewSource, /copyDailyReviewQuickTemplate|textarea\.setSelectionRange\(reasonStart/);
});

test("advanced editors stay hidden as compatibility-only forms", () => {
  assert.match(indexSource, /<details class="professional-advanced-editor" hidden>/);
  assert.match(indexSource, /<details class="professional-advanced-editor review-advanced-editor" hidden>/);
  assert.match(p1ResultsSource, /advancedEditor\.hidden = true/);
  assert.match(p1OutputSource, /professional-advanced-editor"\)\.hidden = true/);
  assert.doesNotMatch(p0ResultsSource, /edit\.textContent = "编辑"/);
  assert.doesNotMatch(p1OutputSource, /button\.textContent\s*=\s*"编辑"/);
});

test("professional task recording uses only three execution fields and folds saved detail", () => {
  assert.match(indexSource, /只填实际推进、闭卷产物、下一起点/);
  assert.match(indexSource, />三项记录</);
  assert.match(indexSource, />保存并更新任务</);
  assert.match(indexSource, /<details class="professional-saved-details">/);
  assert.match(indexSource, />查看今日已保存详细记录</);
  assert.match(p0ResultsSource, /科目=\$\{subjectCode\}\\n实际推进=\\n闭卷产物=\\n下一起点=/);
  assert.match(p0ResultsSource, /未留下闭卷产物，对应任务保持进行中/);
});

test("daily review quick record maps the five existing history fields", () => {
  const parsed = parseQuickReview("完成=722闭卷重构\n未完成=英语二刷\n原因=下午启动较慢\n收获=能复述实践与认识关系\n明日第一优先=先完成英语二刷");
  assert.deepEqual({ ...parsed }, {
    completedToday: "722闭卷重构", unfinishedToday: "英语二刷", delayedTasks: "下午启动较慢",
    learnedToday: "能复述实践与认识关系", tomorrowPriority: "先完成英语二刷",
  });
});

test("daily review quick record accepts multiline content and rejects empty formal records", () => {
  const parsed = parseQuickReview("完成=722第一章\n补做纸上重构\n未完成=\n原因=\n收获=\n明日第一优先=");
  assert.equal(parsed.completedToday, "722第一章\n补做纸上重构");
  assert.throws(() => parseQuickReview("完成=\n未完成=英语\n原因=困倦\n收获=\n明日第一优先="), /至少填写/);
  assert.throws(() => parseQuickReview("完成=722\n完成=844"), /字段重复/);
  assert.throws(() => parseQuickReview("完成=722\n评分=优秀"), /无法识别字段/);
});

test("daily closeout counts only formally saved results and keeps task facts explicit", () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${reviewSource}\nglobalThis.buildCloseout = buildDailyCloseoutSummary;`, context);
  const summary = context.buildCloseout({
    effectiveStudySeconds: 7200,
    tasks: {
      completed: [{ title: "722 教材" }, { title: "英语阅读" }],
      partial: [{ title: "844 时间线" }],
      inProgress: [],
      unfinished: [{ title: "政治" }],
    },
    professionalProgress: {
      "722": { actualUnits: [{ name: "第一章" }] },
      "844": { actualUnits: [] },
    },
    english: { reading: [{ id: "reading-1" }], words: [{ id: "ignored-app-record" }] },
    politics: [],
    outputs: [{ id: "output-1" }],
    reviews: { completedToday: [{ reviewId: "D1-1" }] },
  }, { date: "2026-07-29" }, [
    { name: "722 教材", counted: true, status: "completed" },
    { name: "英语阅读", counted: true, status: "completed" },
    { name: "844 时间线", counted: true, status: "partial" },
    { name: "政治", counted: true, status: "not-started" },
    { name: "滚动复盘", counted: true, category: "rollingReview", status: "not-started" },
    { name: "锻炼", counted: false, exercise: true, status: "not-started" },
  ]);
  assert.deepEqual([...summary.completedNames], ["722 教材", "英语阅读"]);
  assert.deepEqual([...summary.unfinishedNames], ["844 时间线", "政治"]);
  assert.equal(summary.formalResultCount, 3);
  assert.equal(summary.reviewsCompleted, 1);
  assert.equal(summary.saved, true);
});

test("daily closeout suggestion reuses only saved facts and the next exact action", () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${reviewSource}\nglobalThis.buildSuggestion = buildDailyCloseoutSuggestion;`, context);
  const tasks = [
    { id: "english", name: "英语", counted: true, status: "completed", completed: true },
    { id: "722", name: "722", counted: true, category: "maYuan", status: "in-progress" },
    { id: "review", name: "滚动复盘", counted: true, category: "rollingReview", status: "not-started" },
  ];
  const before = JSON.stringify(tasks);
  const suggestion = context.buildSuggestion({
    professionalCount: 1,
    englishReadingCount: 1,
    politicsCount: 0,
    outputCount: 0,
    closedBookProductSaved: true,
    unfinishedNames: ["722"],
  }, tasks, { currentTaskId: "722", getStartAction: () => "核对真理与价值部分" });
  assert.deepEqual({ ...suggestion }, {
    outcome: "今日已保存：专业课验收1项、英语阅读1项、今日闭卷产物已保存",
    tomorrow: "核对真理与价值部分",
    taskId: "722",
  });
  assert.equal(JSON.stringify(tasks), before);
  const fallback = context.buildSuggestion({ unfinishedNames: ["政治"] }, [
    { id: "politics", name: "政治", counted: true, status: "not-started" },
  ]);
  assert.deepEqual({ ...fallback }, { outcome: "今日卡点：政治尚未完成", tomorrow: "继续政治", taskId: "politics" });
  const aligned = context.buildSuggestion({ unfinishedNames: ["英语", "722"] }, [
    { id: "english", name: "英语", counted: true, status: "not-started" },
    { id: "722", name: "722", counted: true, status: "not-started" },
  ], { currentTaskId: "722", getStartAction: () => "核对真理与价值部分" });
  assert.deepEqual({ ...aligned }, { outcome: "今日卡点：722尚未完成", tomorrow: "核对真理与价值部分", taskId: "722" });
  const unified = context.buildSuggestion({ unfinishedNames: ["英语", "722"] }, [
    { id: "english", name: "英语", counted: true, status: "not-started" },
    { id: "722", name: "722", counted: true, status: "not-started" },
  ], {
    currentTaskId: "english",
    guidance: { taskId: "722", label: "722", action: "核对真理与价值部分" },
    getStartAction: (task) => task.id === "english" ? "先做英语阅读" : "核对真理与价值部分",
  });
  assert.deepEqual({ ...unified }, { outcome: "今日卡点：722尚未完成", tomorrow: "核对真理与价值部分", taskId: "722" });
  const reviewGuidance = context.buildSuggestion({ unfinishedNames: ["英语"] }, [
    { id: "english", name: "英语", counted: true, status: "not-started" },
  ], { guidance: { taskId: "review", label: "今日复盘预算", action: "先完成明日复盘预算内的第一条" } });
  assert.deepEqual({ ...reviewGuidance }, {
    outcome: "今日卡点：今日复盘预算尚未完成",
    tomorrow: "先完成明日复盘预算内的第一条",
    taskId: "review",
  });
});

test("daily AI review sends only curated facts to the existing DeepSeek proxy", () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${reviewSource}\nglobalThis.buildAiReviewData = buildDailyAiReviewData;`, context);
  const payload = context.buildAiReviewData({
    date: "2026-08-02",
    completionRate: 60,
    completionDone: 3,
    completionTotal: 5,
    completedToday: "英语阅读",
    unfinishedToday: "专业课",
    delayedTasks: "启动过晚",
    learnedToday: "完成错题归因",
    tomorrowPriority: "先闭卷复述",
    totalStudySeconds: 7200,
    totalFocusSeconds: 5400,
    dailyStudyTargetSeconds: 10800,
    tasks: [
      { name: "英语", counted: true, status: "completed", completed: true, focusSeconds: 1800, description: "不应发送" },
      { name: "滚动复盘", counted: true, category: "rollingReview", status: "completed" },
    ],
    professionalProgress: { "722": { actualUnits: ["第一章"] } },
    reviewsCompleted: ["真理观"],
    reviewsDueNextDay: ["剩余价值"],
    aiReview: { content: "旧评价不应回传" },
    manualTimeRecords: [{ note: "不应发送完整补录记录" }],
  });
  assert.equal(payload.date, "2026-08-02");
  assert.equal(payload.tasks.length, 1);
  assert.deepEqual({ ...payload.tasks[0] }, { name: "英语", status: "completed", completed: true, focusSeconds: 1800 });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "aiReview"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "manualTimeRecords"), false);
  assert.match(reviewSource, /fetch\("\/api\/ai-review"/);
  assert.match(reviewSource, /body: JSON\.stringify\(\{ mode: "concise", reviewData: buildDailyAiReviewData\(record\) \}\)/);
});

test("daily AI review uses the frozen execution target and keeps its plan provenance", () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${reviewSource}\nglobalThis.buildAiReviewData = buildDailyAiReviewData;`, context);
  const current = context.buildAiReviewData({
    date: "2026-08-08",
    dailyStudyTargetSeconds: 32400,
    planStudyTargetSeconds: 32400,
    executionTargetSeconds: 10800,
    executionTargetSource: "recent-capacity",
    executionTargetSourceLabel: "近7日真实承载",
    executionTargetEvidence: { status: "calibrated", evidenceDays: 3, excludedDays: 1 },
    tasks: [],
  });
  assert.equal(current.studyTime.targetSeconds, 10800);
  assert.equal(current.studyTime.planTargetSeconds, 32400);
  assert.equal(current.studyTime.targetSource, "recent-capacity");
  assert.equal(current.studyTime.targetEvidence.evidenceDays, 3);
  const legacy = context.buildAiReviewData({ date: "2026-08-07", dailyStudyTargetSeconds: 18000, tasks: [] });
  assert.equal(legacy.studyTime.targetSeconds, 18000);
  assert.equal(legacy.studyTime.planTargetSeconds, 18000);
  assert.equal(legacy.studyTime.targetSource, "legacy");
});

test("daily evidence fingerprint is stable and makes old or changed reviews explicit", () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${reviewSource}
globalThis.fingerprintRecord = buildDailyRecordEvidenceFingerprint;
globalThis.matchesRecordEvidence = matchesDailyRecordEvidence;
globalThis.reviewEvidenceState = getDailyAiReviewEvidenceState;`, context);
  const first = {
    date: "2026-08-02",
    learnedToday: "完成错题归因",
    tasks: [{ name: "英语", counted: true, status: "completed", completed: true, focusSeconds: 1800 }],
    professionalProgress: { "844": { actualUnits: [] }, "722": { actualUnits: ["第一章"] } },
  };
  const sameFactsDifferentKeyOrder = {
    professionalProgress: { "722": { actualUnits: ["第一章"] }, "844": { actualUnits: [] } },
    tasks: [{ focusSeconds: 1800, completed: true, status: "completed", counted: true, name: "英语" }],
    learnedToday: "完成错题归因",
    date: "2026-08-02",
  };
  const fingerprint = context.fingerprintRecord(first);
  assert.equal(context.fingerprintRecord(sameFactsDifferentKeyOrder), fingerprint);
  assert.notEqual(context.fingerprintRecord({ ...first, learnedToday: "新增闭卷遗漏" }), fingerprint);
  assert.equal(context.matchesRecordEvidence(first, fingerprint), true);
  assert.equal(context.matchesRecordEvidence({ ...first, learnedToday: "事实已变化" }, fingerprint), false);
  assert.equal(context.matchesRecordEvidence(null, fingerprint), false);
  assert.equal(context.reviewEvidenceState({ ...first, aiReview: { content: "旧评价" } }), "unknown");
  assert.equal(context.reviewEvidenceState({ ...first, aiReview: { content: "当前评价", sourceEvidenceFingerprint: fingerprint } }), "current");
  assert.equal(context.reviewEvidenceState({ ...first, learnedToday: "事实已变化", aiReview: { content: "旧评价", sourceEvidenceFingerprint: fingerprint } }), "stale");
});

test("successful DeepSeek review is saved on the same daily record and API failure keeps the record", async () => {
  const initialRecord = { date: "2026-08-02", learnedToday: "完成错题归因", tasks: [] };
  let storedHistory = [initialRecord];
  const statuses = [];
  const elements = {
    "#regenerateDailyAiReviewBtn": { disabled: false },
    "#dailyAiReview": { hidden: true },
  };
  const context = vm.createContext({
    console,
    historyKey: "review-history",
    getDateKey: () => "2026-08-02",
    readJson: () => storedHistory,
    writeJson: (_key, value) => { storedHistory = JSON.parse(JSON.stringify(value)); },
    setStatus: (...args) => statuses.push(args),
    document: { querySelector: (selector) => elements[selector] || null },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, content: "先保留完成质量，明早先闭卷复述。", mode: "concise" }) }),
  });
  vm.runInContext(`${reviewSource}\nrenderHistory = () => {};`, context);
  assert.equal(await context.requestDailyAiReview(), true);
  assert.equal(storedHistory.length, 1);
  assert.equal(storedHistory[0].aiReview.provider, "deepseek");
  assert.match(storedHistory[0].aiReview.content, /明早先闭卷复述/);
  assert.match(storedHistory[0].aiReview.sourceEvidenceFingerprint, /^daily-evidence-v1-/);
  assert.equal(elements["#regenerateDailyAiReviewBtn"].disabled, false);

  context.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      storedHistory = [{ ...storedHistory[0], learnedToday: "请求期间新增了正式事实" }];
      return { ok: true, content: "这条评价依据已经过期", mode: "concise" };
    },
  });
  assert.equal(await context.requestDailyAiReview(), false);
  assert.equal(storedHistory[0].learnedToday, "请求期间新增了正式事实");
  assert.doesNotMatch(storedHistory[0].aiReview.content, /依据已经过期/);
  assert.match(statuses.at(-1)[1], /记录已发生变化/);

  const savedSnapshot = JSON.stringify(storedHistory);
  context.fetch = async () => ({ ok: false, status: 502, json: async () => ({ ok: false, error: "暂时无法连接" }) });
  assert.equal(await context.requestDailyAiReview(), false);
  assert.equal(JSON.stringify(storedHistory), savedSnapshot);
  assert.equal(statuses.at(-1)[2], true);
});

test("tomorrow plan applies only while both the plan and source record stay unchanged", () => {
  assert.match(reviewSource, /todayEvidenceFingerprint: buildDailyRecordEvidenceFingerprint\(todayRecord\)/);
  assert.match(reviewSource, /matchesDailyRecordEvidence\(latestTodayRecord, expectedEvidenceFingerprint\)/);
  assert.match(reviewSource, /生成期间今日记录已发生变化。为确保计划依据最新/);
  assert.match(reviewSource, /sourceEvidence: pendingAiTomorrowPlan\.sourceEvidence/);
  const saveSource = reviewSource.slice(reviewSource.indexOf("function saveTodayReview"), reviewSource.indexOf("function addRecordField"));
  assert.match(saveSource, /writeHistory\(history\);\s*renderHistory\(\);\s*renderDailyAiReview\(\)/);
  assert.match(saveSource, /planStudyTargetSeconds: studyTime\.planStudyTargetSeconds/);
  assert.match(saveSource, /executionTargetSeconds: studyTime\.executionTargetSeconds/);
  assert.match(saveSource, /executionTargetSource: String\(studyTime\.targetModel\.source/);
  assert.match(reviewSource, /addRecordField\(body, "实际执行目标"/);
  assert.match(reviewSource, /addRecordField\(body, "目标依据"/);
  assert.match(reviewSource, /addRecordField\(body, "原计划目标"/);
});

test("automatic closeout draft is preview-only and never overrides manual or saved content", () => {
  assert.match(reviewSource, /function applyDailyCloseoutSuggestion\(\)/);
  assert.match(reviewSource, /if \(outcomeInput\.value\.trim\(\) \|\| tomorrowInput\.value\.trim\(\)\) return false/);
  assert.match(reviewSource, /if \(readDailyCloseoutDraft\(\) \|\| hasTodayReview\(\)\) return false/);
  assert.match(reviewSource, /getTaskExactStartAction\(task\)/);
  assert.match(reviewSource, /const selectedTaskId = plan\.currentTaskId \|\| document\.querySelector\("#focusTask"\)\?\.value \|\| ""/);
  assert.match(reviewSource, /buildDailyCloseoutGuidanceContext\(plan, selectedTaskId\)/);
  const suggestionSource = reviewSource.slice(reviewSource.indexOf("function applyDailyCloseoutSuggestion"), reviewSource.indexOf("function saveEditedDailyCloseoutDraft"));
  assert.doesNotMatch(suggestionSource, /writeHistory|writeJson|localStorage|sessionStorage\.setItem|saveTodayReview/);
  assert.match(reviewSource, /#dailyCloseout"\)\.addEventListener\("focusin", applyDailyCloseoutSuggestion\)/);
  assert.match(reviewSource, /openDailyCloseout\(\) \{\s*applyDailyCloseoutSuggestion\(\)/);
});

test("closeout guidance ignores a preview selection but preserves real in-progress continuity", () => {
  const calls = [];
  const context = vm.createContext({
    console,
    getTaskStatus: (task) => task.status,
    buildDailyExecutionGapItems: (plan) => plan.items,
    selectDailyGuidanceItem: (_items, options) => {
      calls.push({ ...options });
      return { taskId: options.excludeTaskId ? "722" : "english", action: "继续准确起点" };
    },
  });
  vm.runInContext(`${reviewSource}\nglobalThis.buildGuidanceContext = buildDailyCloseoutGuidanceContext;`, context);
  const preview = context.buildGuidanceContext({
    tasks: [{ id: "english", status: "not-started" }], items: [],
  }, "english");
  assert.equal(preview.currentTaskId, "");
  assert.equal(preview.guidance.taskId, "722");
  assert.equal(calls.at(-1).excludeTaskId, "english");
  const active = context.buildGuidanceContext({
    tasks: [{ id: "english", status: "in-progress" }], items: [],
  }, "english");
  assert.equal(active.currentTaskId, "english");
  assert.equal(active.guidance.taskId, "english");
  assert.equal(calls.at(-1).excludeTaskId, "");
});

function createContext() {
  const actions = { downloads: [], clipboard: [], statuses: [], storageWrites: 0 };
  const stored = new Map([["studyFocusSeconds", '{"2026-07-19":60}'], ["review-history", "[]"]]);
  const snapshot = { schemaVersion: 1, type: "study-dashboard-today-snapshot", date: "2026-07-19" };
  const context = vm.createContext({
    console,
    getDateKey: () => snapshot.date,
    readDailyPlans: () => ({ [snapshot.date]: { tasks: [] } }),
    getStudyTimeSnapshot: () => ({ totalStudySeconds: 0 }),
    readTaskFocusTotals: () => ({}),
    readJson: () => ({}),
    readHistory: () => [],
    buildP0TodaySnapshot: () => snapshot,
    buildP0ControlMarkdown: () => "日期：2026-07-19\n今日已完成：未记录",
    planPhaseTemplatesKey: "studyPlanPhaseTemplates",
    professionalResultsKey: "studyProfessionalResults",
    reviewQueueKey: "reviewQueue",
    downloadFile: (...args) => actions.downloads.push(args),
    setStatus: (...args) => actions.statuses.push(args),
    navigator: { clipboard: { writeText: async (value) => actions.clipboard.push(value) } },
    document: { querySelector: () => ({ addEventListener() {} }) },
    localStorage: {
      get length() { return stored.size; },
      key: (index) => [...stored.keys()][index] ?? null,
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => { actions.storageWrites += 1; stored.set(key, String(value)); },
      removeItem: (key) => { actions.storageWrites += 1; stored.delete(key); },
    },
  });
  vm.runInContext(source, context);
  return { actions, context, storageSnapshot: () => Object.fromEntries([...stored.entries()].sort()) };
}

test("snapshot download is read-only for business storage", () => {
  const { actions, context, storageSnapshot } = createContext();
  const before = storageSnapshot();
  context.downloadP0TodaySnapshot();
  assert.equal(actions.storageWrites, 0);
  assert.equal(actions.downloads.length, 1);
  assert.match(actions.downloads[0][0], /2026-07-19\.json$/);
  assert.equal(JSON.parse(actions.downloads[0][1]).type, "study-dashboard-today-snapshot");
  assert.deepEqual(storageSnapshot(), before);
});

test("Markdown copy is read-only for business storage", async () => {
  const { actions, context, storageSnapshot } = createContext();
  const before = storageSnapshot();
  await context.copyP0ControlMarkdown();
  assert.equal(actions.storageWrites, 0);
  assert.deepEqual(actions.clipboard, ["日期：2026-07-19\n今日已完成：未记录"]);
  assert.match(actions.statuses.at(-1)[1], /未写入 localStorage/);
  assert.deepEqual(storageSnapshot(), before);
});

test("system tool preferences collapse low-frequency details", () => {
  const panels = [{ open: true }, { open: true }];
  const systemTools = panels[1];
  const sourceContext = vm.createContext({
    ...createContext().context,
    readJson: (key) => key === "studyUiPreferences" ? { hideLowFrequencyModules: true, autoCollapseSystemTools: true } : {},
    uiPreferencesKey: "studyUiPreferences",
    document: {
      querySelector: (selector) => selector === "#systemToolsPanel" ? systemTools : { addEventListener() {} },
      querySelectorAll: (selector) => selector === "details.low-frequency-panel" ? panels : [],
    },
  });
  vm.runInContext(source, sourceContext);
  sourceContext.renderP0FinalHome = () => {};
  sourceContext.initP0Final();
  assert.deepEqual(panels.map((panel) => panel.open), [false, false]);
});
