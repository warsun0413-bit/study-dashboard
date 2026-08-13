import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/execution-state-core.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(`${source}\nglobalThis.core = { EXECUTION_SURFACE_MODES, deriveExecutionSurfaceMode, selectDailyGuidanceItem, createExecutionSurfaceView, createExecutionSurfaceCommand, executionSurfaceCommandsMatch, createResultHandoffModel, resultHandoffModelsMatch };`, context);
const {
  EXECUTION_SURFACE_MODES: MODES,
  deriveExecutionSurfaceMode,
  selectDailyGuidanceItem,
  createExecutionSurfaceView,
  createExecutionSurfaceCommand,
  executionSurfaceCommandsMatch,
  createResultHandoffModel,
  resultHandoffModelsMatch,
} = context.core;

test("daily guidance selects one stable incomplete formal candidate", () => {
  const items = [
    { key: "english", taskId: "english", label: "英语", complete: false, priority: 30, deadlineMinutes: 1020, startAction: "做阅读", tomorrowAction: "复盘阅读" },
    { key: "722", taskId: "722", label: "722", complete: false, priority: 10, deadlineMinutes: 635, startAction: "闭卷复述", tomorrowAction: "核对真理与价值" },
    { key: "844", taskId: "844", label: "844", complete: false, priority: 20, deadlineMinutes: 740, startAction: "画时间线", tomorrowAction: "补青年马克思" },
  ];
  const before = JSON.stringify(items);
  assert.deepEqual({ ...selectDailyGuidanceItem(items, { actionField: "tomorrowAction" }) }, {
    key: "722", taskId: "722", label: "722", description: "", action: "核对真理与价值",
    priority: 10, deadlineMinutes: 635,
  });
  assert.equal(JSON.stringify(items), before);
});

test("daily guidance excludes the displayed current task and non-actionable records", () => {
  const items = [
    { key: "current", taskId: "current", label: "当前", complete: false, priority: 1, startAction: "继续当前" },
    { key: "done", taskId: "done", label: "完成", complete: true, priority: 2, startAction: "不应出现" },
    { key: "skipped", taskId: "skipped", label: "跳过", complete: false, status: "skipped", priority: 3, startAction: "不应出现" },
    { key: "cancelled", taskId: "cancelled", label: "取消", complete: false, status: "cancelled", priority: 4, startAction: "不应出现" },
    { key: "review", taskId: "review", label: "复盘", complete: false, priority: 5, startAction: "做复盘" },
    { key: "next", taskId: "next", label: "下一项", complete: false, priority: 6, startAction: "开始下一项" },
  ];
  assert.deepEqual({ ...selectDailyGuidanceItem(items, {
    actionField: "startAction",
    excludeTaskId: "current",
    excludeKeys: ["review"],
  }) }, {
    key: "next", taskId: "next", label: "下一项", description: "", action: "开始下一项",
    priority: 6, deadlineMinutes: null,
  });
  assert.equal(selectDailyGuidanceItem(items, { actionField: "tomorrowAction" }), null);
});

function resultTargetCommand(taskId, action = "unified-start") {
  return createExecutionSurfaceCommand(createExecutionSurfaceView({
    mode: MODES.DEFAULT,
    taskId,
    primary: { label: "执行", action, taskId },
  }));
}

test("execution surface has one deterministic priority for every state combination", () => {
  const fields = ["focusProtected", "safeguardActive", "dailyHandoffActive", "nightCloseoutActive", "executionGapActive"];
  const expectedOrder = [
    ["focusProtected", MODES.FOCUS_PROTECTED],
    ["safeguardActive", MODES.SAFEGUARD],
    ["dailyHandoffActive", MODES.DAILY_HANDOFF],
    ["nightCloseoutActive", MODES.NIGHT_CLOSEOUT],
    ["executionGapActive", MODES.EXECUTION_GAP],
  ];
  for (let mask = 0; mask < 2 ** fields.length; mask += 1) {
    const input = Object.fromEntries(fields.map((field, index) => [field, Boolean(mask & (1 << index))]));
    const expected = expectedOrder.find(([field]) => input[field])?.[1] || MODES.DEFAULT;
    assert.equal(deriveExecutionSurfaceMode(input), expected, JSON.stringify(input));
  }
});

test("truthy non-booleans cannot accidentally take over the cockpit", () => {
  assert.equal(deriveExecutionSurfaceMode({ safeguardActive: "false", executionGapActive: true }), MODES.EXECUTION_GAP);
  assert.equal(deriveExecutionSurfaceMode({ dailyHandoffActive: 1 }), MODES.DEFAULT);
});

test("one view keeps its title action and task identity together", () => {
  const view = createExecutionSurfaceView({
    mode: MODES.EXECUTION_GAP,
    taskId: "plan-722",
    meta: "关键缺口",
    title: "先补：722",
    description: "从准确断点继续",
    primary: { label: "先补5分钟", action: "execution-gap-action", delegateAction: "unified-start" },
  });
  assert.equal(view.valid, true);
  assert.equal(view.taskId, "plan-722");
  assert.equal(view.primary.taskId, "plan-722");
  assert.equal(view.primary.delegateAction, "unified-start");
});

test("a mismatched button task fails closed", () => {
  const view = createExecutionSurfaceView({
    mode: MODES.DAILY_HANDOFF,
    taskId: "plan-722",
    title: "722",
    primary: { label: "开始", action: "daily-handoff-start", taskId: "plan-844" },
  });
  assert.equal(view.valid, false);
  assert.equal(view.primary.disabled, true);
  assert.equal(view.primary.taskId, "");
  assert.equal(view.primary.action, "");
});

test("an execution gap resolves to one explicit task command", () => {
  const view = createExecutionSurfaceView({
    mode: MODES.EXECUTION_GAP,
    taskId: "plan-722",
    primary: { label: "先补5分钟", action: "execution-gap-action", delegateAction: "unified-start" },
  });
  const command = createExecutionSurfaceCommand(view);
  assert.deepEqual(
    { ...command },
    { valid: true, mode: MODES.EXECUTION_GAP, kind: "task", action: "execution-gap-action", taskId: "plan-722", taskAction: "unified-start" },
  );
});

test("taskless closeout is valid but unknown and disabled actions fail closed", () => {
  const closeout = createExecutionSurfaceCommand(createExecutionSurfaceView({
    mode: MODES.NIGHT_CLOSEOUT,
    primary: { label: "两句话收工", action: "night-closeout" },
  }));
  assert.equal(closeout.valid, true);
  assert.equal(closeout.kind, "closeout");
  assert.equal(createExecutionSurfaceCommand(createExecutionSurfaceView({
    taskId: "plan-722",
    primary: { label: "未知动作", action: "unexpected-action" },
  })).valid, false);
  assert.equal(createExecutionSurfaceCommand(createExecutionSurfaceView({
    taskId: "plan-722",
    primary: { label: "伪统一动作", action: "unified-unknown" },
  })).valid, false);
  assert.equal(createExecutionSurfaceCommand(createExecutionSurfaceView({
    taskId: "plan-722",
    primary: { label: "已完成", action: "unified-done", disabled: true },
  })).valid, false);
});

test("a command matches only the same rendered mode task and action", () => {
  const command = createExecutionSurfaceCommand(createExecutionSurfaceView({
    mode: MODES.DEFAULT,
    taskId: "plan-722",
    primary: { label: "先做5分钟", action: "unified-start" },
  }));
  assert.equal(executionSurfaceCommandsMatch(command, { ...command }), true);
  assert.equal(executionSurfaceCommandsMatch(command, { ...command, taskId: "plan-844" }), false);
  assert.equal(executionSurfaceCommandsMatch(command, { ...command, mode: MODES.EXECUTION_GAP }), false);
});

test("result handoff stays hidden without a formal receipt", () => {
  const model = createResultHandoffModel({ task: { taskId: "plan-722", name: "722" } });
  assert.equal(model.visible, false);
  assert.equal(model.command.valid, false);
  assert.equal(model.taskId, "");
});

test("result handoff closes safely when no next task exists", () => {
  const model = createResultHandoffModel({ receipt: { taskId: "plan-722", savedLabel: "已保存：722" } });
  assert.equal(model.visible, true);
  assert.equal(model.title, "已保存：722");
  assert.equal(model.nextText, "今日正式任务已完成；可以检查记录后收工。");
  assert.equal(model.buttonLabel, "");
  assert.equal(model.command.valid, false);
});

test("result handoff distinguishes continuing the same task from starting the next task", () => {
  const receipt = { taskId: "plan-722", savedLabel: "已保存：722" };
  const current = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-722"),
    executionLabel: "继续当前任务",
    task: { taskId: "plan-722", name: "722", description: "核对真理与价值", status: "in-progress" },
  });
  assert.equal(current.nextText, "继续当前任务：722 · 核对真理与价值");
  assert.equal(current.buttonLabel, "继续当前任务");
  assert.equal(current.command.taskId, "plan-722");
  assert.equal(current.command.taskAction, "unified-start");

  const next = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "复述理论演进线", status: "not-started" },
  });
  assert.equal(next.nextText, "下一项：844 · 复述理论演进线");
  assert.equal(next.buttonLabel, "先做下一项5分钟");
  assert.equal(next.command.taskId, "plan-844");
});

test("result handoff matching rejects changed receipts tasks and actions", () => {
  const original = createResultHandoffModel({
    receipt: { taskId: "plan-722", savedLabel: "已保存：722" },
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "复述", status: "not-started" },
  });
  assert.equal(resultHandoffModelsMatch(original, { ...original }), true);
  assert.equal(resultHandoffModelsMatch(original, { ...original, receiptKey: "changed" }), false);
  assert.equal(resultHandoffModelsMatch(original, {
    ...original,
    command: { ...original.command, taskId: "plan-output" },
  }), false);
  assert.equal(resultHandoffModelsMatch(original, {
    ...original,
    command: { ...original.command, taskAction: "unified-record" },
  }), false);
});

test("result handoff matching rejects a changed task status even when the command stays the same", () => {
  const receipt = { taskId: "plan-722", savedLabel: "已保存：722" };
  const original = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "复述", status: "not-started" },
  });
  const changed = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "复述", status: "in-progress" },
  });
  assert.equal(executionSurfaceCommandsMatch(original.command, changed.command), true);
  assert.equal(original.buttonLabel, changed.buttonLabel);
  assert.equal(resultHandoffModelsMatch(original, changed), false);
});

test("result handoff matching rejects changed visible task text", () => {
  const receipt = { taskId: "plan-722", savedLabel: "已保存：722" };
  const original = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "复述", status: "not-started" },
  });
  const renamed = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "马发史", description: "复述", status: "not-started" },
  });
  const reworded = createResultHandoffModel({
    receipt,
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "闭卷复述", status: "not-started" },
  });
  assert.equal(resultHandoffModelsMatch(original, renamed), false);
  assert.equal(resultHandoffModelsMatch(original, reworded), false);
});

test("result handoff matching rejects changed visible labels with the same task and command", () => {
  const input = {
    receipt: { taskId: "plan-722", savedLabel: "已保存：722" },
    executionCommand: resultTargetCommand("plan-844", "unified-record"),
    task: { taskId: "plan-844", name: "844", description: "补齐正式结果", status: "in-progress" },
  };
  const original = createResultHandoffModel({ ...input, executionLabel: "记录结果" });
  const relabeled = createResultHandoffModel({ ...input, executionLabel: "补齐正式结果" });
  assert.equal(original.receiptKey, relabeled.receiptKey);
  assert.equal(original.taskKey, relabeled.taskKey);
  assert.equal(executionSurfaceCommandsMatch(original.command, relabeled.command), true);
  assert.notEqual(original.displayKey, relabeled.displayKey);
  assert.equal(resultHandoffModelsMatch(original, relabeled), false);
});

test("result handoff display snapshot covers every visible field", () => {
  const model = createResultHandoffModel({
    receipt: { taskId: "plan-722", savedLabel: "已保存：722" },
    executionCommand: resultTargetCommand("plan-844"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "闭卷复述", status: "not-started" },
  });
  assert.equal(model.displayKey, [model.title, model.nextText, model.buttonLabel].join("\n"));
  assert.equal(resultHandoffModelsMatch(model, { ...model, displayKey: `${model.displayKey}\nchanged` }), false);
});

test("result handoff rejects a task that does not match the latest execution command", () => {
  const model = createResultHandoffModel({
    receipt: { taskId: "plan-722", savedLabel: "已保存：722" },
    executionCommand: resultTargetCommand("plan-output"),
    executionLabel: "先做下一项5分钟",
    task: { taskId: "plan-844", name: "844", description: "复述", status: "not-started" },
  });
  assert.equal(model.visible, true);
  assert.equal(model.taskId, "");
  assert.equal(model.command.valid, false);
  assert.equal(model.buttonLabel, "");
});

test("result handoff rejects closeout and invalid commands as next-task sources", () => {
  const receipt = { taskId: "plan-722", savedLabel: "已保存：722" };
  const task = { taskId: "plan-844", name: "844", description: "复述", status: "not-started" };
  const closeout = createExecutionSurfaceCommand(createExecutionSurfaceView({
    mode: MODES.DEFAULT,
    primary: { label: "收工", action: "daily-closeout" },
  }));
  const closeoutModel = createResultHandoffModel({ receipt, executionCommand: closeout, task });
  const invalidModel = createResultHandoffModel({ receipt, executionCommand: { valid: false, taskId: "plan-844" }, task });
  assert.equal(closeoutModel.command.valid, false);
  assert.equal(invalidModel.command.valid, false);
  assert.equal(closeoutModel.nextText, "今日正式任务已完成；可以检查记录后收工。");
});

test("result handoff preserves a record command and its rendered label", () => {
  const command = resultTargetCommand("plan-844", "unified-record");
  const model = createResultHandoffModel({
    receipt: { taskId: "plan-722", savedLabel: "已保存：722" },
    executionCommand: command,
    executionLabel: "记录结果",
    task: { taskId: "plan-844", name: "844", description: "补齐正式结果", status: "in-progress" },
  });
  assert.equal(model.buttonLabel, "记录结果");
  assert.deepEqual(model.command, command);
  assert.equal(model.command.taskAction, "unified-record");
});

test("result handoff preserves restore and execution-gap actions", () => {
  const receipt = { taskId: "plan-722", savedLabel: "已保存：722" };
  const task = { taskId: "plan-844", name: "844", description: "继续执行", status: "skipped" };
  const restore = resultTargetCommand("plan-844", "unified-restore");
  const restoreModel = createResultHandoffModel({ receipt, executionCommand: restore, executionLabel: "恢复任务", task });
  const gap = createExecutionSurfaceCommand(createExecutionSurfaceView({
    mode: MODES.EXECUTION_GAP,
    taskId: "plan-844",
    primary: { label: "补齐正式结果", action: "execution-gap-action", delegateAction: "unified-record", taskId: "plan-844" },
  }));
  const gapModel = createResultHandoffModel({ receipt, executionCommand: gap, executionLabel: "补齐正式结果", task });
  assert.equal(restoreModel.command.taskAction, "unified-restore");
  assert.equal(restoreModel.buttonLabel, "恢复任务");
  assert.equal(gapModel.command.action, "execution-gap-action");
  assert.equal(gapModel.command.taskAction, "unified-record");
  assert.equal(gapModel.buttonLabel, "补齐正式结果");
});

test("result handoff fails closed when the execution label is missing", () => {
  const model = createResultHandoffModel({
    receipt: { taskId: "plan-722", savedLabel: "已保存：722" },
    executionCommand: resultTargetCommand("plan-844"),
    task: { taskId: "plan-844", name: "844", description: "继续执行", status: "not-started" },
  });
  assert.equal(model.command.valid, false);
  assert.equal(model.buttonLabel, "");
});
