const CACHE_NAME = "study-dashboard-p0-checkpoint3-focus-v5";
const APP_ASSETS = [
  "./", "./index.html", "./style.css", "./manifest.json", "./service-worker.js",
  "./js/storage.js", "./js/p0-results.js", "./js/migrations.js", "./js/ui.js", "./js/focus-timer-core.js", "./js/tasks.js", "./js/study-time.js", "./js/exam-stats.js", "./js/review.js", "./js/data-safety.js", "./js/app.js",
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
