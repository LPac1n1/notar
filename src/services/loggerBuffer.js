/**
 * In-memory ring buffer of recent error log entries. Pulled out of
 * `logger.js` so it has zero dependencies — `logger.js` itself imports a
 * service that needs DuckDB, which makes it awkward to import in tests. The
 * buffer functions live here on their own and can be unit-tested directly.
 */

const LOG_BUFFER_LIMIT = 200;
const logBuffer = [];

/**
 * Appends an entry to the buffer, evicting the oldest entry once the limit
 * is reached. The buffer mutates in place so all `getLogBufferSnapshot`
 * calls see consistent order without needing reactive subscriptions.
 */
export function appendLogEntry(entry) {
  logBuffer.push(entry);
  while (logBuffer.length > LOG_BUFFER_LIMIT) {
    logBuffer.shift();
  }
}

/** Returns a copy of the buffer for diagnostic export. */
export function getLogBufferSnapshot() {
  return logBuffer.slice();
}

/** Empties the buffer. Used by the "Limpar log" UI action and by tests. */
export function clearLogBuffer() {
  logBuffer.length = 0;
}

/**
 * Returns a JSON string of the buffered errors suitable for downloading.
 * Includes session metadata so an external reader can reconstruct context.
 */
export function exportLogBuffer() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "",
      entryCount: logBuffer.length,
      entries: logBuffer,
    },
    null,
    2,
  );
}

/** Exposed for tests that want to assert on the cap. */
export const LOG_BUFFER_CAPACITY = LOG_BUFFER_LIMIT;
