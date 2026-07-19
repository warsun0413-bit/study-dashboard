// P1 final folded weekly view and schema-2 snapshot adapter.
function getP1IntegrationInput(date = getDateKey()) {
  const plans = readDailyPlans(); const studyTime = getStudyTimeSnapshot(date); const taskTotals = readTaskFocusTotals();
  return { date, phaseTemplates: readJson(planPhaseTemplatesKey, []), dailyPlan: plans[date], dailyPlans: plans, effectiveStudySeconds: studyTime.totalStudySeconds, taskFocusSeconds: taskTotals[date] || {}, professionalStore: readJson(professionalResultsKey, {}), reviewQueue: readJson(reviewQueueKey, []), history: readHistory(), focusTotals: readJson(focusMinutesKey, {}), manualRecords: readJson(manualTimeRecordsKey, []), wordRecords: readJson(englishWordRecordsKey, []), readingRecords: readJson(englishReadingRecordsKey, []), politicsRecords: readJson(politicsRecordsKey, []), outputRecords: readJson(outputRecordsKey, []), ankiCandidates: readJson(ankiCandidatesKey, []), executionModes: readJson(executionModesKey, {}), debtQueue: readJson(debtQueueKey, []) };
}
function getCurrentP1Snapshot() { return buildP1TodaySnapshot(getP1IntegrationInput()); }
function formatP1Rate(value) { return value === null ? "未记录" : `${Math.round(value * 100)}%`; }
function ensureP1WeeklyPanel() {
  if (document.querySelector("#p1WeeklyPanel")) return;
  const panel = document.createElement("details"); panel.id = "p1WeeklyPanel"; panel.className = "panel low-frequency-panel";
  panel.innerHTML = '<summary><span><span class="step">周统计</span><strong>本周真实执行汇总</strong></span></summary><div class="low-frequency-body"><p id="p1WeeklyRange" class="muted"></p><div id="p1WeeklySummary" class="plan-import-summary"></div><p id="p1WeeklyWarnings" class="status"></p></div>';
  document.querySelector("main.dashboard").appendChild(panel);
}
function renderP1WeeklyStats() {
  const stats = buildP1WeeklyStats(getP1IntegrationInput(), getDateKey());
  document.querySelector("#p1WeeklyRange").textContent = `${stats.range.start} 至 ${stats.range.end}`;
  const rows = [
    ["有效学习", formatP0Duration(stats.effectiveStudy.totalSeconds)], ["有效学习天", stats.effectiveStudy.effectiveDays], ["计划完成率", formatP1Rate(stats.plan.completionRate)],
    ["D1完成率", formatP1Rate(stats.reviews.d1CompletionRate)], ["英语阅读", `${stats.english.readingCount}篇｜${formatP1Rate(stats.english.readingAccuracy.rate)}`],
    ["政治总正确率", formatP1Rate(stats.politics.total.rate)], ["专业课正式验收", `${stats.professional.formalUnits}单元`], ["输出", `${stats.output.total}次`],
    ["训练", `${stats.training.completed}/${stats.training.planned}`], ["当前欠账", `${stats.execution.activeDebt}项｜超3天${stats.execution.overThreeDays}项`],
  ];
  const box = document.querySelector("#p1WeeklySummary"); box.replaceChildren(); rows.forEach(([label, value]) => { const row = document.createElement("div"); const name = document.createElement("span"); name.textContent = label; const data = document.createElement("strong"); data.textContent = String(value); row.append(name, data); box.appendChild(row); });
  document.querySelector("#p1WeeklyWarnings").textContent = stats.warnings.length ? stats.warnings.join("；") : "本周暂无基于正式数据触发的警告。";
}
function initP1Integration() { ensureP1WeeklyPanel(); renderP1WeeklyStats(); }
