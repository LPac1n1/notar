export function getErrorMessage(error, fallbackMessage) {
  try {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const message = String(error.message ?? "");

      if (message) {
        return message;
      }
    }

    if (typeof error === "string" && error) {
      return error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}
