// v6.0 core-only application bootstrap.
function initApp() {
  runDataMigrations({ source: "app-start" });
  ensureDataSchema();
  updateTodayDate();
  renderTasks();
  initP0Checkpoint2();
  loadReviewFields();
  bindReviewAutoSaving();
  bindTaskControls();
  restorePomodoroStateFromStorage();
  initStudyTime();
  initExamStats();
  renderHistory();
  renderRecentSevenDays();

  document.querySelector("#saveReviewBtn").addEventListener("click", saveTodayReview);
  document.querySelector("#exportJsonBtn").addEventListener("click", downloadJsonBackup);
  document.querySelector("#importJsonBtn").addEventListener("click", () => document.querySelector("#importJsonInput").click());
  document.querySelector("#importJsonInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importJsonBackup(file);
    event.target.value = "";
  });
  document.querySelector("#clearLearningDataBtn").addEventListener("click", clearLearningData);
  bindMigrationControls();

  if ("serviceWorker" in navigator && ["http:", "https:"].includes(window.location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
}

initApp();
