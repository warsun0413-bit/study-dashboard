// v6.0 core-only application bootstrap.
function initApp() {
  runDataMigrations({ source: "app-start", todayKey: getDateKey() });
  ensureDataSchema();
  rollCurrentDetailedPlanWindow();
  updateTodayDate();
  renderTasks();
  initP0Checkpoint2();
  loadReviewFields();
  initDailyReviewQuickRecord();
  bindReviewAutoSaving();
  bindTaskControls();
  restorePomodoroStateFromStorage();
  initStudyTime();
  initExamStats();
  initAdmissionReadiness();
  initP0Final();
  initP1Results();
  initP1Output();
  initP1Integration();
  initStudyProgressRunner();
  renderHistory();
  renderRecentSevenDays();

  document.querySelector("#saveReviewBtn").addEventListener("click", saveTodayReview);
  document.querySelector("#exportJsonBtn").addEventListener("click", downloadJsonBackup);
  document.querySelector("#importControlPlanBtn").addEventListener("click", importBuiltInNankaiControlPlan);
  document.querySelector("#aiTomorrowImportSourceBtn").addEventListener("click", importBuiltInNankaiControlPlan);
  document.querySelector("#importJsonBtn").addEventListener("click", () => document.querySelector("#importJsonInput").click());
  document.querySelector("#importJsonInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importJsonBackup(file);
    event.target.value = "";
  });
  document.querySelector("#clearLearningDataBtn").addEventListener("click", clearLearningData);
  document.querySelector("#applyPlanImportBtn").addEventListener("click", applyPlanImportPreview);
  document.querySelector("#cancelPlanImportBtn").addEventListener("click", cancelPlanImportPreview);
  document.querySelector("#planImportConflicts").addEventListener("change", (event) => {
    if (!event.target.matches("[data-conflict-id]")) return;
    const preview = refreshPendingPlanPreviewFromSelections();
    if (preview) renderPlanImportPreview(preview);
  });
  bindMigrationControls();

  if ("serviceWorker" in navigator && ["http:", "https:"].includes(window.location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
}

initApp();
