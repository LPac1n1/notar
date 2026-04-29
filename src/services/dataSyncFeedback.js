export const DATA_SYNC_FEEDBACK_EVENT = "notar:data-sync-feedback-changed";

let operationCounter = 0;
const activeOperations = new Map();

function getLatestOperation() {
  const operations = Array.from(activeOperations.values());
  return operations[operations.length - 1] ?? null;
}

function emitDataSyncFeedback() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(DATA_SYNC_FEEDBACK_EVENT, {
      detail: getDataSyncFeedbackSnapshot(),
    }),
  );
}

export function getDataSyncFeedbackSnapshot() {
  const currentOperation = getLatestOperation();

  return {
    activeCount: activeOperations.size,
    isActive: activeOperations.size > 0,
    label: currentOperation?.label ?? "Carregando dados",
    source: currentOperation?.source ?? "",
    startedAt: currentOperation?.startedAt ?? 0,
  };
}

export function startDataSyncFeedback({
  label = "Carregando dados",
  source = "database",
} = {}) {
  operationCounter += 1;
  const id = `data-sync-${operationCounter}`;

  activeOperations.set(id, {
    id,
    label,
    source,
    startedAt: Date.now(),
  });
  emitDataSyncFeedback();

  return id;
}

export function finishDataSyncFeedback(id) {
  if (!id || !activeOperations.has(id)) {
    return;
  }

  activeOperations.delete(id);
  emitDataSyncFeedback();
}

export function subscribeDataSyncFeedback(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = (event) => {
    listener(event.detail ?? getDataSyncFeedbackSnapshot());
  };

  window.addEventListener(DATA_SYNC_FEEDBACK_EVENT, handleChange);

  return () => {
    window.removeEventListener(DATA_SYNC_FEEDBACK_EVENT, handleChange);
  };
}
