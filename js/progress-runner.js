// Read-only progress runner view backed by existing plan, time, review and result stores.
let studyProgressRunnerPeriod = "daily";

function getProgressRunnerFormalCount(input, date) {
  const recordCount = [input.wordRecords, input.readingRecords, input.politicsRecords, input.outputRecords]
    .reduce((total, records) => total + (Array.isArray(records) ? records.filter((record) => record && record.date === date).length : 0), 0);
  const days = input.professionalStore && input.professionalStore.days;
  const professionalDay = days && days[date];
  const professionalCount = ["722", "844"].reduce((total, subject) => {
    const units = professionalDay && professionalDay[subject] && professionalDay[subject].units;
    return total + (Array.isArray(units) ? units.filter((unit) => {
      const result = unit && (unit.reviewResult || unit.result || unit.acceptanceResult);
      return result && !["unverified", "pending", "未验收"].includes(result);
    }).length : 0);
  }, 0);
  return recordCount + professionalCount;
}

function getProgressRunnerInput(dateKey = getDateKey()) {
  const input = getP1IntegrationInput(dateKey);
  const history = Array.isArray(input.history) ? input.history : [];
  const historyByDate = Object.fromEntries(history.filter((record) => record && record.date).map((record) => [record.date, record]));
  const monthRange = progressRunnerPeriodRange("monthly", dateKey);
  const weekRange = progressRunnerPeriodRange("weekly", dateKey);
  const start = [monthRange.start, progressRunnerAddDays(dateKey, -28)].sort()[0];
  const end = [monthRange.end, weekRange.end].sort().at(-1);
  const reviews = Array.isArray(input.reviewQueue) ? input.reviewQueue.filter((review) => review && review.status !== "cancelled" && !review.duplicateOf) : [];
  const days = {};
  progressRunnerDates(start, end).forEach((date) => {
    const due = reviews.filter((review) => review.dueDate === date);
    const plan = input.dailyPlans && input.dailyPlans[date];
    const reviewState = date === dateKey && typeof getReviewWorkloadForPlan === "function"
      ? getReviewWorkloadForPlan(reviews, date, plan)
      : null;
    const executionTarget = date === dateKey && typeof getDailyExecutionTargetModel === "function"
      ? getDailyExecutionTargetModel(date, historyByDate[date])
      : null;
    days[date] = {
      plan,
      effectiveSeconds: getP1EffectiveSecondsByDate(input, date),
      targetSeconds: typeof getPlanStudyTargetSeconds === "function"
        ? getPlanStudyTargetSeconds(date, historyByDate[date])
        : getDailyStudyTargetSeconds(date, historyByDate[date]),
      executionTargetSeconds: executionTarget ? executionTarget.executionTargetSeconds : undefined,
      reviewDue: due.length,
      reviewCompleted: due.filter((review) => review.status === "completed").length,
      reviewBudgetDue: reviewState ? reviewState.totalCount : undefined,
      reviewBudgetCompleted: reviewState ? reviewState.completedCount : undefined,
      reviewBacklog: reviewState ? reviewState.backlogCount : 0,
      formalCount: getProgressRunnerFormalCount(input, date),
      historySaved: Boolean(historyByDate[date]),
    };
  });
  const dateCandidates = [
    ...Object.keys(input.dailyPlans || {}),
    ...Object.keys(input.focusTotals || {}),
    ...history.map((record) => record && record.date),
    ...(Array.isArray(input.manualRecords) ? input.manualRecords.map((record) => record && record.date) : []),
  ].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && date <= dateKey).sort();
  const now = new Date();
  return { dateKey, nowMinutes: now.getHours() * 60 + now.getMinutes(), firstDataDate: dateCandidates[0] || dateKey, days };
}

function formatProgressRunnerNumber(value) {
  const number = Number(value) || 0;
  if (Number.isInteger(number)) return String(number);
  return Number.isInteger(number * 2) ? number.toFixed(1) : number.toFixed(2);
}

function formatProgressRunnerRange(model) {
  if (model.period === "daily") return model.range.start;
  if (model.period === "weekly") return `${model.range.start} 至 ${model.range.end}`;
  const [year, month] = model.range.start.split("-");
  return `${year}年${Number(month)}月`;
}

function getProgressRunnerPhaseOverview() {
  return getP0PhaseOverview(readJson(planPhaseTemplatesKey, []), getDateKey());
}

function setProgressRunnerPhaseEditorStatus(message, isError = false) {
  const status = document.querySelector("#progressRunnerPhaseEditorStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function openProgressRunnerPhaseEditor() {
  const current = getProgressRunnerPhaseOverview().current;
  if (!current) {
    setProgressRunnerPhaseEditorStatus("当前日期没有可编辑的阶段计划。", true);
    return;
  }
  const saved = progressRunnerObject(current.chapterTasks) ? current.chapterTasks : {};
  document.querySelector("#progressRunnerChapter722").value = String(saved["722"] || "");
  document.querySelector("#progressRunnerChapter844").value = String(saved["844"] || "");
  document.querySelector("#progressRunnerChapterPolitics").value = String(saved.politics || "");
  document.querySelector("#progressRunnerPhaseEditor").hidden = false;
  setProgressRunnerPhaseEditorStatus("只填写已经确认的章节范围；留空项不会覆盖已有内容。");
  document.querySelector("#progressRunnerChapter722").focus();
}

function closeProgressRunnerPhaseEditor() {
  document.querySelector("#progressRunnerPhaseEditor").hidden = true;
}

function saveProgressRunnerPhaseChapters(event) {
  event.preventDefault();
  const result = updateProgressRunnerPhaseChapterTasks(readJson(planPhaseTemplatesKey, []), getDateKey(), {
    "722": document.querySelector("#progressRunnerChapter722").value,
    "844": document.querySelector("#progressRunnerChapter844").value,
    politics: document.querySelector("#progressRunnerChapterPolitics").value,
  });
  if (!result.changed) {
    setProgressRunnerPhaseEditorStatus(result.error, true);
    return;
  }
  writeJson(planPhaseTemplatesKey, result.templates);
  closeProgressRunnerPhaseEditor();
  renderStudyProgressRunner();
}

function renderStudyProgressRunner() {
  const panel = document.querySelector("#studyProgressRunner");
  if (!panel || typeof buildProgressRunnerModel !== "function") return;
  const model = buildProgressRunnerModel(getProgressRunnerInput(), studyProgressRunnerPeriod);
  const labels = { ahead: "进度领先", "on-track": "节奏正常", behind: "进度偏慢", insufficient: "数据积累中" };
  const phaseOverview = getProgressRunnerPhaseOverview();
  const phaseTasks = buildProgressRunnerPhaseTasks(phaseOverview);
  const runner = document.querySelector("#progressRunnerPerson");
  const expected = document.querySelector("#progressRunnerExpected");
  const actualPosition = Math.min(98, Math.max(2, model.actualPercent));
  const expectedPosition = Math.min(98, Math.max(2, model.expectedPercent));
  panel.dataset.pace = model.status;
  runner.style.left = `${actualPosition}%`;
  expected.style.left = `${expectedPosition}%`;
  runner.parentElement.classList.toggle("is-close", Math.abs(actualPosition - expectedPosition) < 8);
  runner.parentElement.dataset.pace = model.status;
  document.querySelector("#progressRunnerStatus").textContent = labels[model.status];
  document.querySelector("#progressRunnerPhaseMeta").textContent = phaseTasks.meta;
  const phaseList = document.querySelector("#progressRunnerPhaseTasks");
  phaseList.replaceChildren();
  if (!phaseTasks.tasks.length) {
    const empty = document.createElement("p");
    empty.className = "muted progress-runner-phase-empty";
    empty.textContent = "阶段计划未配置，暂时无法显示章节任务。";
    phaseList.append(empty);
  } else {
    phaseTasks.tasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = `progress-runner-phase-task${task.concrete ? "" : " is-unspecified"}`;
      const label = document.createElement("strong");
      label.textContent = task.label;
      const content = document.createElement("span");
      content.textContent = task.concrete
        ? task.text
        : task.text ? `计划未写明具体章节（原计划：${task.text}）` : "计划未写明具体章节";
      item.append(label, content);
      if (task.criterion) {
        const criterion = document.createElement("small");
        criterion.textContent = `完成标准：${task.criterion}`;
        item.append(criterion);
      }
      phaseList.append(item);
    });
  }
  document.querySelector("#progressRunnerPhase").classList.toggle("is-unconfigured", !phaseTasks.configured);
  document.querySelector("#editProgressRunnerPhaseChaptersBtn").disabled = !phaseOverview.current;
  document.querySelector("#progressRunnerRange").textContent = formatProgressRunnerRange(model);
  document.querySelector("#progressRunnerActual").textContent = `${model.actualPercent}%`;
  document.querySelector("#progressRunnerExpectedValue").textContent = `${model.expectedPercent}%`;
  document.querySelector("#progressRunnerGap").textContent = `${model.gapPercent > 0 ? "+" : ""}${model.gapPercent}%`;
  document.querySelector("#progressRunnerReason").textContent = model.reason;
  document.querySelector("#progressRunnerTasks").textContent = model.taskPlanned
    ? `${formatProgressRunnerNumber(model.taskCompleted)} / ${model.taskPlanned}` : "暂无计划";
  document.querySelector("#progressRunnerTime").textContent = `${formatP0Duration(model.totalSeconds)} / ${formatP0Duration(model.targetSeconds)}${model.targetMode === "execution" ? "（执行目标）" : ""}`;
  document.querySelector("#progressRunnerReviews").textContent = model.reviewDue
    ? `${model.reviewCompleted} / ${model.reviewDue}${model.reviewMode === "daily-budget" && model.reviewBacklog ? ` · 积压${model.reviewBacklog}` : ""}`
    : model.reviewMode === "daily-budget" && model.reviewBacklog ? `今日预算已完成 · 积压${model.reviewBacklog}` : "本期无到期";
  document.querySelector("#progressRunnerEvidence").textContent = `${model.formalCount} 条`;
  document.querySelector("#progressRunnerBaseline").textContent = model.baselinePercent === null
    ? "尚无个人基线" : `近28天中位进度 ${model.baselinePercent}%（${model.baselineDays}个有效日）`;
  document.querySelectorAll("[data-progress-period]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.progressPeriod === studyProgressRunnerPeriod));
  });
}

function initStudyProgressRunner() {
  const panel = document.querySelector("#studyProgressRunner");
  if (!panel || panel.dataset.initialized === "true") return;
  panel.dataset.initialized = "true";
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-progress-period]");
    if (!button) return;
    studyProgressRunnerPeriod = button.dataset.progressPeriod;
    renderStudyProgressRunner();
  });
  document.querySelector("#editProgressRunnerPhaseChaptersBtn").addEventListener("click", openProgressRunnerPhaseEditor);
  document.querySelector("#cancelProgressRunnerPhaseChaptersBtn").addEventListener("click", closeProgressRunnerPhaseEditor);
  document.querySelector("#progressRunnerPhaseEditor").addEventListener("submit", saveProgressRunnerPhaseChapters);
  renderStudyProgressRunner();
}
