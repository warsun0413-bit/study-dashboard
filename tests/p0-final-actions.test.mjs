import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/p0-final.js", import.meta.url), "utf8");

function createContext() {
  const actions = { downloads: [], clipboard: [], statuses: [], storageWrites: 0 };
  const stored = new Map([["studyFocusSeconds", '{"2026-07-19":60}'], ["review-history", "[]"]]);
  const snapshot = { schemaVersion: 1, type: "study-dashboard-today-snapshot", date: "2026-07-19" };
  const context = vm.createContext({
    console,
    getDateKey: () => snapshot.date,
    readDailyPlans: () => ({ [snapshot.date]: { tasks: [] } }),
    getStudyTimeSnapshot: () => ({ totalStudySeconds: 0 }),
    readTaskFocusTotals: () => ({}),
    readJson: () => ({}),
    readHistory: () => [],
    buildP0TodaySnapshot: () => snapshot,
    buildP0ControlMarkdown: () => "日期：2026-07-19\n今日已完成：未记录",
    planPhaseTemplatesKey: "studyPlanPhaseTemplates",
    professionalResultsKey: "studyProfessionalResults",
    reviewQueueKey: "reviewQueue",
    downloadFile: (...args) => actions.downloads.push(args),
    setStatus: (...args) => actions.statuses.push(args),
    navigator: { clipboard: { writeText: async (value) => actions.clipboard.push(value) } },
    document: { querySelector: () => ({ addEventListener() {} }) },
    localStorage: {
      get length() { return stored.size; },
      key: (index) => [...stored.keys()][index] ?? null,
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => { actions.storageWrites += 1; stored.set(key, String(value)); },
      removeItem: (key) => { actions.storageWrites += 1; stored.delete(key); },
    },
  });
  vm.runInContext(source, context);
  return { actions, context, storageSnapshot: () => Object.fromEntries([...stored.entries()].sort()) };
}

test("snapshot download is read-only for business storage", () => {
  const { actions, context, storageSnapshot } = createContext();
  const before = storageSnapshot();
  context.downloadP0TodaySnapshot();
  assert.equal(actions.storageWrites, 0);
  assert.equal(actions.downloads.length, 1);
  assert.match(actions.downloads[0][0], /2026-07-19\.json$/);
  assert.equal(JSON.parse(actions.downloads[0][1]).type, "study-dashboard-today-snapshot");
  assert.deepEqual(storageSnapshot(), before);
});

test("Markdown copy is read-only for business storage", async () => {
  const { actions, context, storageSnapshot } = createContext();
  const before = storageSnapshot();
  await context.copyP0ControlMarkdown();
  assert.equal(actions.storageWrites, 0);
  assert.deepEqual(actions.clipboard, ["日期：2026-07-19\n今日已完成：未记录"]);
  assert.match(actions.statuses.at(-1)[1], /未写入 localStorage/);
  assert.deepEqual(storageSnapshot(), before);
});

test("system tool preferences collapse low-frequency details and hide disabled modules", () => {
  const panels = [{ open: true }, { open: true }];
  const systemTools = panels[1];
  const aiModule = { hidden: false };
  const sourceContext = vm.createContext({
    ...createContext().context,
    readJson: (key) => key === "studyUiPreferences" ? { hideLowFrequencyModules: true, autoCollapseSystemTools: true, showAiUsageLog: false } : {},
    uiPreferencesKey: "studyUiPreferences",
    document: {
      querySelector: (selector) => selector === "#systemToolsPanel" ? systemTools : { addEventListener() {} },
      querySelectorAll: (selector) => selector === "details.low-frequency-panel" ? panels : selector.includes("ai-usage-log") ? [aiModule] : [],
    },
  });
  vm.runInContext(source, sourceContext);
  sourceContext.renderP0FinalHome = () => {};
  sourceContext.initP0Final();
  assert.deepEqual(panels.map((panel) => panel.open), [false, false]);
  assert.equal(aiModule.hidden, true);
});
