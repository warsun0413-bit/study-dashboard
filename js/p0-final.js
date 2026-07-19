// P0 final home rendering and read-only snapshot actions.
function getCurrentP0Snapshot() {
  const date = getDateKey();
  const plans = readDailyPlans();
  const studyTime = getStudyTimeSnapshot(date);
  const taskTotals = readTaskFocusTotals();
  return buildP0TodaySnapshot({
    date,
    phaseTemplates: readJson(planPhaseTemplatesKey, []),
    dailyPlan: plans[date],
    effectiveStudySeconds: studyTime.totalStudySeconds,
    taskFocusSeconds: taskTotals[date] || {},
    professionalStore: readJson(professionalResultsKey, {}),
    reviewQueue: readJson(reviewQueueKey, []),
    history: readHistory(),
    dailyPlans: plans,
  });
}

function renderP0PhaseOverview() {
  const overview = getP0PhaseOverview(readJson(planPhaseTemplatesKey, []), getDateKey());
  document.querySelector("#currentPhaseName").textContent = overview.currentName;
  document.querySelector("#currentPhaseDates").textContent = overview.current
    ? `${overview.current.startDate} 至 ${overview.current.endDate}` : overview.status === "transition" ? "当前日期不在任何阶段模板内" : "阶段模板未配置";
  document.querySelector("#currentPhaseRemaining").textContent = overview.current
    ? `距阶段结束还有 ${overview.remainingDays} 天` : "不显示虚构倒计时";
  document.querySelector("#nextPhaseName").textContent = overview.next ? overview.next.phaseName : "未配置";
  const milestone = overview.nextMilestone;
  document.querySelector("#nextMilestone").textContent = milestone
    ? `${milestone.milestone.name || milestone.milestone.phaseName || "关键里程碑"}${milestone.date ? ` · ${milestone.date}` : milestone.milestone.deadlineOrPeriod ? ` · ${milestone.milestone.deadlineOrPeriod}` : ""}`
    : "未配置";
}

function renderP0Priorities() {
  const date = getDateKey();
  const plan = readDailyPlans()[date];
  const priorities = buildP0TopPriorities(plan, readJson(reviewQueueKey, []), date);
  const container = document.querySelector("#topPriorityList");
  container.replaceChildren();
  if (!priorities.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "暂无待处理核心任务。"; container.appendChild(empty); return;
  }
  priorities.forEach((priority, index) => {
    const link = document.createElement("a");
    link.className = "priority-item";
    link.href = priority.type === "review" ? "#dueReviewsTitle" : "#planTitle";
    const rank = document.createElement("strong"); rank.textContent = String(index + 1).padStart(2, "0");
    const content = document.createElement("span");
    const title = document.createElement("b"); title.textContent = priority.title;
    const meta = document.createElement("small"); meta.textContent = priority.meta;
    content.append(title, meta); link.append(rank, content); container.appendChild(link);
  });
}

function renderP0FactSummary() {
  const now = new Date();
  const date = getDateKey(now);
  const summary = getP0FactSummary(readDailyPlans()[date], readJson(reviewQueueKey, []), date, now.getHours() * 60 + now.getMinutes());
  document.querySelector("#summaryDueToday").textContent = String(summary.dueTodayCount);
  document.querySelector("#summaryOverdueReviews").textContent = String(summary.overdueReviewCount);
  document.querySelector("#summaryUnfinishedTasks").textContent = String(summary.unfinishedTaskCount);
  document.querySelector("#summaryInProgress").textContent = summary.inProgress.length ? summary.inProgress.map((task) => task.name || task.title).join("、") : "无";
  document.querySelector("#summaryScheduleOverdue").textContent = summary.overdueBySchedule.length ? summary.overdueBySchedule.map((task) => task.name || task.title).join("、") : "无";
}

function renderP0FinalHome() {
  renderP0PhaseOverview();
  renderP0Priorities();
  renderP0FactSummary();
}

function downloadP0TodaySnapshot() {
  const snapshot = typeof getCurrentP1Snapshot === "function" ? getCurrentP1Snapshot() : getCurrentP0Snapshot();
  downloadFile(`学习面板今日快照-${snapshot.date}.json`, JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8");
  setStatus("#todaySnapshotStatus", "今日快照已导出；未修改任何学习数据。 ");
}

async function copyP0ControlMarkdown() {
  const snapshot = typeof getCurrentP1Snapshot === "function" ? getCurrentP1Snapshot() : getCurrentP0Snapshot();
  const markdown = typeof buildP1ControlMarkdown === "function" ? buildP1ControlMarkdown(snapshot) : buildP0ControlMarkdown(snapshot);
  try {
    await navigator.clipboard.writeText(markdown);
    setStatus("#todaySnapshotStatus", "精简总控回传版已复制；未写入 localStorage。 ");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = markdown; textarea.setAttribute("readonly", ""); textarea.className = "clipboard-fallback";
    document.body.appendChild(textarea); textarea.select();
    const copied = document.execCommand("copy"); textarea.remove();
    setStatus("#todaySnapshotStatus", copied ? "精简总控回传版已复制。" : "复制失败，请允许浏览器剪贴板权限。", !copied);
  }
}

function initP0Final() {
  const preferences = readJson(uiPreferencesKey, {});
  if (preferences.hideLowFrequencyModules === true) {
    document.querySelectorAll("details.low-frequency-panel").forEach((panel) => { panel.open = false; });
  }
  const systemTools = document.querySelector("#systemToolsPanel");
  if (systemTools && preferences.autoCollapseSystemTools !== false) systemTools.open = false;
  [
    ["ai-usage-log", "showAiUsageLog"],
    ["ai-cost-estimate", "showAiCostEstimate"],
    ["recent-commands", "showRecentCommands"],
  ].forEach(([name, key]) => {
    document.querySelectorAll(`[data-system-tool="${name}"]`).forEach((module) => { module.hidden = preferences[key] !== true; });
  });
  document.querySelector("#exportTodaySnapshotBtn").addEventListener("click", downloadP0TodaySnapshot);
  document.querySelector("#copyControlMarkdownBtn").addEventListener("click", copyP0ControlMarkdown);
  renderP0FinalHome();
}
