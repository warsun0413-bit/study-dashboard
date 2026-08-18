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
  const selectedTaskId = document.querySelector("#focusTask")?.value || plan?.currentTaskId || "";
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcomingTask = typeof findNextScheduledPlanTask === "function"
    ? findNextScheduledPlanTask(plan?.tasks, nowMinutes, selectedTaskId)
    : null;
  const guidance = !upcomingTask && typeof buildDailyExecutionGapItems === "function" && typeof selectDailyGuidanceItem === "function"
    ? selectDailyGuidanceItem(buildDailyExecutionGapItems(plan || { tasks: [] }), {
      actionField: "startAction",
      excludeTaskId: selectedTaskId,
      excludeKeys: ["review"],
    })
    : null;
  const guidanceTask = guidance && Array.isArray(plan?.tasks)
    ? plan.tasks.find((task) => String(task && task.id || "") === guidance.taskId)
    : null;
  const priorities = upcomingTask ? [{
    type: "task",
    targetId: upcomingTask.id || upcomingTask.taskId,
    title: upcomingTask.name || "下一项任务",
    meta: upcomingTask.time || "",
  }] : guidance ? [{
    type: "task",
    targetId: guidance.taskId,
    title: guidance.label || guidanceTask?.name || "下一项任务",
    meta: guidanceTask?.time || "",
  }] : typeof buildDailyExecutionGapItems !== "function" || typeof selectDailyGuidanceItem !== "function"
    ? buildP0TopPriorities(plan, [], date, 4)
      .filter((priority) => priority.type !== "task" || priority.targetId !== selectedTaskId)
      .slice(0, 1)
    : [];
  const container = document.querySelector("#topPriorityList");
  container.replaceChildren();
  if (!priorities.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "当前项完成后，今天没有更高优先级任务。"; container.appendChild(empty); return;
  }
  priorities.forEach((priority) => {
    const link = document.createElement("a");
    link.className = "priority-item next-priority-item";
    link.href = "#planTitle";
    const rank = document.createElement("strong"); rank.textContent = "→";
    const content = document.createElement("span");
    const title = document.createElement("b"); title.textContent = priority.title;
    const priorityTask = priority.type === "task" && Array.isArray(plan?.tasks)
      ? plan.tasks.find((task) => [task.id, task.taskId, task.sourceTaskKey].some((id) => String(id || "") === String(priority.targetId || "")))
      : null;
    const executionBrief = priorityTask && typeof getTaskExecutionBrief === "function"
      ? getTaskExecutionBrief(priorityTask)
      : null;
    const executionDescription = executionBrief
      ? [
        executionBrief.startAction ? `先做：${executionBrief.startAction}` : "",
        executionBrief.completionCriteria ? `完成：${executionBrief.completionCriteria}` : "",
      ].filter(Boolean).join(" · ")
      : priorityTask && typeof getTaskExecutionDescription === "function"
        ? getTaskExecutionDescription(priorityTask)
        : "";
    const meta = document.createElement("small");
    meta.textContent = [priority.meta, executionDescription].filter(Boolean).join(" · ");
    content.append(title, meta); link.append(rank, content); container.appendChild(link);
  });
}

function renderP0FactSummary() {
  const now = new Date();
  const date = getDateKey(now);
  const plans = readDailyPlans();
  const plan = plans[date];
  const reviewQueue = readJson(reviewQueueKey, []);
  const summary = getP0FactSummary(plan, reviewQueue, date, now.getHours() * 60 + now.getMinutes());
  const reviewState = typeof getReviewWorkloadForPlan === "function"
    ? getReviewWorkloadForPlan(reviewQueue, date, plan)
    : null;
  document.querySelector("#summaryDueToday").textContent = String(summary.dueTodayCount);
  document.querySelector("#summaryOverdueReviews").textContent = String(summary.overdueReviewCount);
  const cockpitCount = document.querySelector("#cockpitDueReviewsCount");
  const cockpitMeta = document.querySelector("#cockpitDueReviewsMeta");
  const actionableCount = reviewState ? reviewState.remainingCount : summary.dueTodayCount + summary.overdueReviewCount;
  cockpitCount.textContent = String(actionableCount);
  if (cockpitMeta) {
    cockpitMeta.textContent = reviewState
      ? reviewState.totalCount
        ? `今日已完成 ${reviewState.completedCount}/${reviewState.totalCount}${reviewState.backlogCount ? ` · 历史积压 ${reviewState.backlogCount}` : ""}`
        : reviewState.backlogCount ? `今日预算已完成 · 历史积压 ${reviewState.backlogCount}` : "今天无需复盘"
      : "查看到期与逾期复盘";
  }
  cockpitCount.closest("a")?.setAttribute("aria-label", reviewState
    ? `今日复盘待做 ${actionableCount} 条；历史积压 ${reviewState.backlogCount} 条`
    : `到期与逾期复盘 ${actionableCount} 条`);
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
  document.querySelector("#exportTodaySnapshotBtn").addEventListener("click", downloadP0TodaySnapshot);
  document.querySelector("#copyControlMarkdownBtn").addEventListener("click", copyP0ControlMarkdown);
  renderP0FinalHome();
}
