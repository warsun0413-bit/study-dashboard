import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const fixtureCandidates = [
  path.resolve("tests/fixtures/private/study-dashboard-full-backup-2026-07-18.json"),
  path.resolve("tests/fixtures/private/study-dashboard-full-backup-2026-07-18.json.json"),
];
const fixturePath = fixtureCandidates.find(existsSync);
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");

test("real backup focus data can be inspected without modifying the fixture", () => {
  assert.ok(fixturePath, "private focus backup fixture is missing");
  const before = readFileSync(fixturePath);
  const beforeHash = hash(before);
  const backup = JSON.parse(before.toString("utf8"));
  const storage = backup.localStorage || backup.data || backup;
  assert.ok(storage.studyFocusTimerState, "studyFocusTimerState missing");
  assert.ok(storage.studyFocusSessions, "studyFocusSessions missing");
  assert.ok(storage.studyFocusSeconds, "studyFocusSeconds missing");

  const sessions = typeof storage.studyFocusSessions === "string"
    ? JSON.parse(storage.studyFocusSessions)
    : storage.studyFocusSessions;
  const focusTotals = typeof storage.studyFocusSeconds === "string"
    ? JSON.parse(storage.studyFocusSeconds)
    : storage.studyFocusSeconds;
  const zeroSessionCount = sessions.filter((session) => !Number.isFinite(Number(session && session.seconds)) || Number(session.seconds) <= 0).length;
  const originalFocusTotal = Object.values(focusTotals).reduce((sum, seconds) => sum + Math.max(0, Number(seconds) || 0), 0);
  assert.equal(zeroSessionCount, 1);
  assert.equal(originalFocusTotal, 60906);

  const source = readFileSync(path.resolve("js/focus-timer-core.js"), "utf8");
  const context = vm.createContext({ Date });
  vm.runInContext(`${source}\nglobalThis.normalize = normalizeFocusTimerState;`, context);
  const rawState = typeof storage.studyFocusTimerState === "string"
    ? JSON.parse(storage.studyFocusTimerState)
    : storage.studyFocusTimerState;
  const normalized = context.normalize(rawState, { date: rawState.date, now: new Date(`${rawState.date}T12:00:00`).getTime() });
  assert.equal(normalized.timerVersion, 3);
  assert.equal(normalized.running, false);
  assert.ok(Number.isFinite(normalized.currentFocusSeconds));
  assert.equal(Object.values(focusTotals).reduce((sum, seconds) => sum + Math.max(0, Number(seconds) || 0), 0), originalFocusTotal);

  const after = readFileSync(fixturePath);
  assert.equal(hash(after), beforeHash);
  assert.equal(beforeHash.toUpperCase(), "CF174162DD64010F628E721919B6E9AE67F0CDFC35526978CB2E94E0A426010C");
});
