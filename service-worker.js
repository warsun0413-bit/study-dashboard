const CACHE_NAME = "study-dashboard-professional-multiline-v120";
const APP_ASSETS = [
  "./", "./index.html", "./style.css?v=focus-result-handoff-v140", "./manifest.json", "./service-worker.js",
  "./js/execution-state-core.js?v=focus-result-handoff-v140", "./js/plan-window-core.js?v=time-window-first-v134", "./js/ai-tomorrow-plan-core.js?v=focus-result-handoff-v140", "./js/ai-rolling-week-plan-core.js?v=capacity-evidence-v132", "./js/admission-readiness-core.js?v=admission-joint-v114", "./js/progress-runner-core.js?v=execution-target-v126", "./js/p0-final-core.js?v=ai-plan-calibration-v92", "./js/p1-results-core.js?v=reading-notes-v116", "./js/p1-output-core.js?v=ai-plan-calibration-v92", "./js/p1-integration-core.js?v=anchor-aware-v127", "./js/storage.js?v=admission-joint-v114", "./js/p0-results.js?v=review-workload-v125", "./js/migrations.js?v=ai-plan-calibration-v92", "./js/ui.js?v=ai-plan-calibration-v92", "./js/focus-timer-core.js?v=background-focus-v118", "./js/tasks.js?v=focus-result-handoff-v140", "./js/study-time.js?v=target-truth-v133", "./js/exam-stats.js?v=ai-plan-calibration-v92", "./js/admission-readiness.js?v=admission-joint-v114", "./js/review.js?v=focus-result-handoff-v140", "./js/nankai-control-plan-2026-08-06.js?v=control-plan-import-v105", "./js/data-safety.js?v=admission-joint-v114", "./js/p1-results.js?v=reading-notes-v116", "./js/p1-output.js?v=ai-plan-calibration-v92", "./js/p1-integration.js?v=anchor-aware-v127", "./js/progress-runner.js?v=execution-target-v126", "./js/p0-final.js?v=guidance-truth-v129", "./js/app.js?v=admission-joint-v114",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
