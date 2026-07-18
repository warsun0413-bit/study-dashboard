// Core UI rendering.
function updateTodayDate() {
  document.querySelector("#todayDate").textContent = getDisplayDate(new Date());
}

function getRecentDateKeys(days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return getDateKey(date);
  }).reverse();
}

function findTaskByCategory(tasks, category, legacyPattern) {
  return tasks.find((task) => task.category === category) || tasks.find((task) => legacyPattern.test(String(task.name || "")));
}

function taskWasCompleted(task) {
  return Boolean(task) && (task.status === "completed" || task.completed === true);
}

function completionMark(task) {
  return taskWasCompleted(task) ? "✓" : "—";
}

function getPlanRate(plan, record) {
  if (record && Number.isFinite(Number(record.completionRate))) return Number(record.completionRate);
  if (!plan || !Array.isArray(plan.tasks)) return null;
  return getCompletionStats(plan).rate;
}

function renderRecentSevenDays() {
  const container = document.querySelector("#recentSevenDays");
  const history = readHistory();
  const plans = readDailyPlans();
  container.replaceChildren();
  getRecentDateKeys().forEach((dateKey) => {
    const record = history.find((item) => item && item.date === dateKey);
    const plan = plans[dateKey];
    const tasks = Array.isArray(record && record.tasks) ? record.tasks : Array.isArray(plan && plan.tasks) ? plan.tasks : [];
    const studyTime = getStudyTimeSnapshot(dateKey, record);
    const card = document.createElement("article");
    card.className = `day-card ${record ? "has-record" : ""}`;
    const date = new Date(`${dateKey}T00:00:00`);
    const title = document.createElement("strong");
    title.textContent = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
    const lines = [
      `学习完成率 ${studyTime.progressRate}%`,
      `总学习 ${formatFocusDuration(studyTime.totalStudySeconds)}`,
      `累计专注 ${formatFocusDuration(studyTime.totalFocusSeconds)}`,
      record ? "已保存记录" : "未保存记录",
    ];
    card.append(title, ...lines.map((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }));
    container.appendChild(card);
  });
}

function setStatus(selector, message, isError = false) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}
