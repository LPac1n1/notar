export const ASYNC_FEEDBACK_EVENT = "notar:async-feedback-changed";

let operations = [];
let sequence = 0;
const removalTimeouts = new Map();

function emitAsyncFeedbackChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(ASYNC_FEEDBACK_EVENT, {
      detail: getAsyncFeedbackSnapshot(),
    }),
  );
}

function scheduleRemoval(operationId, duration = 3500) {
  if (typeof window === "undefined") {
    return;
  }

  const existingTimeout = removalTimeouts.get(operationId);

  if (existingTimeout) {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(() => {
    removalTimeouts.delete(operationId);
    clearAsyncOperation(operationId);
  }, duration);

  removalTimeouts.set(operationId, timeoutId);
}

export function getAsyncFeedbackSnapshot() {
  return operations.map((operation) => ({ ...operation }));
}

export function subscribeAsyncFeedback(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = (event) => {
    listener(event.detail ?? getAsyncFeedbackSnapshot());
  };

  window.addEventListener(ASYNC_FEEDBACK_EVENT, handleChange);

  return () => {
    window.removeEventListener(ASYNC_FEEDBACK_EVENT, handleChange);
  };
}

export function startAsyncOperation({
  id = "",
  label = "Processando",
  message = "",
  scope = "global",
} = {}) {
  const operationId = id || `async-${Date.now()}-${sequence}`;
  sequence += 1;

  const nextOperation = {
    id: operationId,
    label,
    message,
    scope,
    status: "loading",
    startedAt: Date.now(),
    endedAt: null,
  };

  operations = [
    ...operations.filter((operation) => operation.id !== operationId),
    nextOperation,
  ];
  emitAsyncFeedbackChanged();

  return operationId;
}

export function updateAsyncOperation(operationId, patch = {}) {
  if (!operationId) {
    return;
  }

  operations = operations.map((operation) =>
    operation.id === operationId ? { ...operation, ...patch } : operation,
  );
  emitAsyncFeedbackChanged();
}

export function finishAsyncOperation(
  operationId,
  {
    status = "success",
    label,
    message = "",
    duration = status === "error" ? 6000 : 3000,
  } = {},
) {
  if (!operationId) {
    return;
  }

  updateAsyncOperation(operationId, {
    ...(label ? { label } : {}),
    message,
    status,
    endedAt: Date.now(),
  });
  scheduleRemoval(operationId, duration);
}

export function clearAsyncOperation(operationId) {
  if (!operationId) {
    return;
  }

  operations = operations.filter((operation) => operation.id !== operationId);
  emitAsyncFeedbackChanged();
}
