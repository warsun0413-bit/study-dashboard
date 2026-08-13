const EXECUTION_SURFACE_MODES = Object.freeze({
  FOCUS_PROTECTED: "focus-protected",
  SAFEGUARD: "safeguard",
  DAILY_HANDOFF: "daily-handoff",
  NIGHT_CLOSEOUT: "night-closeout",
  EXECUTION_GAP: "execution-gap",
  DEFAULT: "default",
});

function deriveExecutionSurfaceMode(input = {}) {
  if (input.focusProtected === true) return EXECUTION_SURFACE_MODES.FOCUS_PROTECTED;
  if (input.safeguardActive === true) return EXECUTION_SURFACE_MODES.SAFEGUARD;
  if (input.dailyHandoffActive === true) return EXECUTION_SURFACE_MODES.DAILY_HANDOFF;
  if (input.nightCloseoutActive === true) return EXECUTION_SURFACE_MODES.NIGHT_CLOSEOUT;
  if (input.executionGapActive === true) return EXECUTION_SURFACE_MODES.EXECUTION_GAP;
  return EXECUTION_SURFACE_MODES.DEFAULT;
}

function executionSurfaceText(value) {
  return String(value == null ? "" : value).trim();
}

function selectDailyGuidanceItem(items, options = {}) {
  const actionField = options.actionField === "startAction" ? "startAction" : "tomorrowAction";
  const excludeTaskId = executionSurfaceText(options.excludeTaskId);
  const excludedKeys = new Set((Array.isArray(options.excludeKeys) ? options.excludeKeys : [])
    .map(executionSurfaceText)
    .filter(Boolean));
  const candidates = (Array.isArray(items) ? items : [])
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .filter(({ item }) => item && typeof item === "object")
    .filter(({ item }) => item.complete !== true)
    .filter(({ item }) => !["skipped", "cancelled"].includes(executionSurfaceText(item.status)))
    .filter(({ item }) => {
      const taskId = executionSurfaceText(item.taskId);
      return taskId && taskId !== excludeTaskId && !excludedKeys.has(executionSurfaceText(item.key));
    })
    .filter(({ item }) => executionSurfaceText(item[actionField]))
    .sort((left, right) => {
      const leftPriority = Number.isFinite(Number(left.item.priority)) ? Number(left.item.priority) : Number.MAX_SAFE_INTEGER;
      const rightPriority = Number.isFinite(Number(right.item.priority)) ? Number(right.item.priority) : Number.MAX_SAFE_INTEGER;
      const leftDeadline = Number.isFinite(Number(left.item.deadlineMinutes)) ? Number(left.item.deadlineMinutes) : Number.MAX_SAFE_INTEGER;
      const rightDeadline = Number.isFinite(Number(right.item.deadlineMinutes)) ? Number(right.item.deadlineMinutes) : Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || leftDeadline - rightDeadline || left.sourceIndex - right.sourceIndex;
    });
  if (!candidates.length) return null;
  const selected = candidates[0].item;
  return {
    key: executionSurfaceText(selected.key),
    taskId: executionSurfaceText(selected.taskId),
    label: executionSurfaceText(selected.label),
    description: executionSurfaceText(selected.description),
    action: executionSurfaceText(selected[actionField]),
    priority: Number.isFinite(Number(selected.priority)) ? Number(selected.priority) : null,
    deadlineMinutes: Number.isFinite(Number(selected.deadlineMinutes)) ? Number(selected.deadlineMinutes) : null,
  };
}

function createExecutionSurfaceView(input = {}) {
  const knownModes = Object.values(EXECUTION_SURFACE_MODES);
  const mode = knownModes.includes(input.mode) ? input.mode : EXECUTION_SURFACE_MODES.DEFAULT;
  const taskId = executionSurfaceText(input.taskId);
  const primaryInput = input.primary && typeof input.primary === "object" ? input.primary : {};
  const primaryTaskId = executionSurfaceText(primaryInput.taskId || taskId);
  const taskMismatch = Boolean(taskId && primaryTaskId && taskId !== primaryTaskId);
  const className = ["primary", "secondary", "success", "ghost"].includes(primaryInput.className)
    ? primaryInput.className
    : "primary";
  return {
    valid: !taskMismatch,
    mode,
    taskId,
    meta: executionSurfaceText(input.meta),
    title: executionSurfaceText(input.title),
    description: executionSurfaceText(input.description),
    primary: taskMismatch ? {
      label: "任务状态需要刷新",
      action: "",
      delegateAction: "",
      taskId: "",
      className: "ghost",
      disabled: true,
    } : {
      label: executionSurfaceText(primaryInput.label),
      action: executionSurfaceText(primaryInput.action),
      delegateAction: executionSurfaceText(primaryInput.delegateAction),
      taskId: primaryTaskId,
      className,
      disabled: primaryInput.disabled === true,
    },
  };
}

function createExecutionSurfaceCommand(view) {
  const mode = Object.values(EXECUTION_SURFACE_MODES).includes(view && view.mode)
    ? view.mode
    : EXECUTION_SURFACE_MODES.DEFAULT;
  const primary = view && view.primary && typeof view.primary === "object" ? view.primary : {};
  const action = executionSurfaceText(primary.action);
  const taskId = executionSurfaceText(primary.taskId);
  const invalid = !view || view.valid !== true || primary.disabled === true || !action;
  if (invalid) return { valid: false, mode, kind: "none", action: "", taskId: "", taskAction: "" };
  if (["night-closeout", "safeguard-closeout", "daily-closeout"].includes(action)) {
    return { valid: true, mode, kind: "closeout", action, taskId: "", taskAction: "" };
  }
  if (action === "safeguard-exit") {
    return { valid: true, mode, kind: "safeguard-exit", action, taskId: "", taskAction: "" };
  }
  if (action === "daily-handoff-start" && taskId) {
    return { valid: true, mode, kind: "handoff", action, taskId, taskAction: "unified-start" };
  }
  if (action === "execution-gap-action" && taskId) {
    const taskAction = executionSurfaceText(primary.delegateAction);
    return taskAction
      ? { valid: true, mode, kind: "task", action, taskId, taskAction }
      : { valid: false, mode, kind: "none", action: "", taskId: "", taskAction: "" };
  }
  const taskActions = ["unified-start", "unified-end", "unified-record", "unified-review", "unified-complete", "unified-restore"];
  if (taskActions.includes(action) && taskId) {
    return { valid: true, mode, kind: "task", action, taskId, taskAction: action };
  }
  return { valid: false, mode, kind: "none", action: "", taskId: "", taskAction: "" };
}

function executionSurfaceCommandsMatch(left, right) {
  if (!left || !right || left.valid !== true || right.valid !== true) return false;
  return ["mode", "kind", "action", "taskId", "taskAction"]
    .every((field) => executionSurfaceText(left[field]) === executionSurfaceText(right[field]));
}

function createResultHandoffModel(input = {}) {
  const receipt = input.receipt && typeof input.receipt === "object" ? input.receipt : {};
  const receiptTaskId = executionSurfaceText(receipt.taskId);
  const savedLabel = executionSurfaceText(receipt.savedLabel);
  const emptyCommand = () => createExecutionSurfaceCommand(null);
  if (!receiptTaskId) {
    return { visible: false, receiptKey: "", taskKey: "", displayKey: "", title: "", nextText: "", buttonLabel: "", taskId: "", freeFocusAvailable: false, command: emptyCommand() };
  }
  const task = input.task && typeof input.task === "object" ? input.task : {};
  const executionCommand = input.executionCommand && typeof input.executionCommand === "object"
    ? input.executionCommand
    : {};
  const executionLabel = executionSurfaceText(input.executionLabel);
  const commandTaskId = executionCommand.valid === true && executionLabel && ["task", "handoff"].includes(executionCommand.kind)
    ? executionSurfaceText(executionCommand.taskId)
    : "";
  const suppliedTaskId = executionSurfaceText(task.taskId);
  const taskId = suppliedTaskId && suppliedTaskId === commandTaskId ? suppliedTaskId : "";
  const taskName = executionSurfaceText(task.name);
  const taskDescription = executionSurfaceText(task.description);
  const taskStatus = executionSurfaceText(task.status);
  const taskKey = taskId ? [taskId, taskName, taskDescription, taskStatus].join("\n") : "";
  const sameTask = Boolean(taskId && taskId === receiptTaskId);
  const command = taskId ? { ...executionCommand, taskId } : emptyCommand();
  const model = {
    visible: true,
    receiptKey: `${receiptTaskId}\n${savedLabel}`,
    taskKey,
    title: savedLabel,
    nextText: !taskId
      ? "今日正式任务已完成；可以检查记录后收工。"
      : sameTask
        ? `继续当前任务：${taskName} · ${taskDescription}`
        : `下一项：${taskName} · ${taskDescription}`,
    buttonLabel: taskId ? executionLabel : "",
    taskId,
    freeFocusAvailable: Boolean(taskId
      && taskStatus === "not-started"
      && executionCommand.taskAction === "unified-start"),
    command,
  };
  return {
    ...model,
    displayKey: [model.title, model.nextText, model.buttonLabel, model.freeFocusAvailable ? "free-focus" : "no-free-focus"].join("\n"),
  };
}

function resultHandoffModelsMatch(left, right) {
  return Boolean(left && right && left.visible && right.visible
    && left.receiptKey === right.receiptKey
    && left.taskKey === right.taskKey
    && left.displayKey === right.displayKey
    && left.freeFocusAvailable === right.freeFocusAvailable
    && executionSurfaceCommandsMatch(left.command, right.command));
}
