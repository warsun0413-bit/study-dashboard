export const legacyStorageFixture = {
  appDataSchemaVersion: "6.0",
  "review-history": JSON.stringify([{ date: "2026-07-17", completedToday: "历史记录" }]),
  studyDailyPlans: JSON.stringify({
    "2026-07-18": { tasks: [{ id: "ma-yuan-722", status: "completed", completed: true }] },
    "2026-07-30": { tasks: [{ id: "future", status: "not-started" }] },
  }),
  studyFocusSeconds: JSON.stringify({ "2026-07-17": 600, "2026-07-18": -5 }),
  studyTaskFocusSeconds: JSON.stringify({ "2026-07-17": { english: 600, invalid: null } }),
  studyFocusSessions: JSON.stringify([
    { id: "zero", date: "2026-07-18", seconds: 0 },
    { id: "valid", date: "2026-07-18", seconds: 600, taskId: "english" },
  ]),
  studyManualTimeRecords: JSON.stringify([{ id: "manual-1", date: "2026-07-18", durationSeconds: 300 }]),
  reviewQueue: JSON.stringify([]),
  "today-1": "done",
  offlineAiPromptDraft: "legacy prompt",
  "completed-today": "仍由当前版本读取",
  lastActiveDate: "2026-07-01",
  studyErrorLog: JSON.stringify(Array.from({ length: 60 }, (_, index) => ({ index }))),
};
