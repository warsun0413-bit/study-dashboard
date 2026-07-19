import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/p0-final.js", import.meta.url), "utf8");

function createContext() {
  const actions = { downloads: [], clipboard: [], statuses: [], storageWrites: 0 };
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
    localStorage: { setItem: () => { actions.storageWrites += 1; throw new Error("unexpected business write"); } },
  });
  vm.runInContext(source, context);
  return { actions, context };
}

test("snapshot download is read-only for business storage", () => {
  const { actions, context } = createContext();
  context.downloadP0TodaySnapshot();
  assert.equal(actions.storageWrites, 0);
  assert.equal(actions.downloads.length, 1);
  assert.match(actions.downloads[0][0], /2026-07-19\.json$/);
  assert.equal(JSON.parse(actions.downloads[0][1]).type, "study-dashboard-today-snapshot");
});

test("Markdown copy is read-only for business storage", async () => {
  const { actions, context } = createContext();
  await context.copyP0ControlMarkdown();
  assert.equal(actions.storageWrites, 0);
  assert.deepEqual(actions.clipboard, ["日期：2026-07-19\n今日已完成：未记录"]);
  assert.match(actions.statuses.at(-1)[1], /未写入 localStorage/);
});
