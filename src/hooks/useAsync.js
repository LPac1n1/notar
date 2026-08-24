import { useCallback, useState } from "react";
import {
  finishAsyncOperation,
  startAsyncOperation,
} from "../services/asyncFeedback";
import { getErrorMessage } from "../utils/error";

const INITIAL_STATE = {
  data: null,
  error: "",
  status: "idle",
};

/**
 * @deprecated Use `useMutationAction` (`hooks/useMutationAction.js`) for
 * CRUD mutations and `useDataResource` (`hooks/useDataResource.js`) for
 * filter-driven loads. `useAsync` predates both and remains here for
 * existing call sites (Monthly, Imports) that still rely on its
 * `importOperation.run(...)` shape with the GlobalAsyncFeedback bridge.
 *
 * New code should not adopt this hook — pick one of the two replacements
 * to keep the surface consistent across pages.
 */
export function useAsync({
  errorMessage = "A operação não foi concluída.",
  loadingMessage = "Processando",
  reportFinal = false,
  reportGlobal = false,
  successMessage = "",
} = {}) {
  const [state, setState] = useState(INITIAL_STATE);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(
    async (task, options = {}) => {
      const nextReportGlobal = options.reportGlobal ?? reportGlobal;
      const nextLoadingMessage = options.loadingMessage ?? loadingMessage;
      const nextSuccessMessage = options.successMessage ?? successMessage;
      const nextErrorMessage = options.errorMessage ?? errorMessage;
      const shouldReportFinal = options.reportFinal ?? reportFinal;
      const operationId = nextReportGlobal
        ? startAsyncOperation({
            label: nextLoadingMessage,
            scope: options.scope ?? "global",
          })
        : "";

      setState((current) => ({
        ...current,
        error: "",
        status: "loading",
      }));

      try {
        const result = await (typeof task === "function" ? task() : task);

        setState({
          data: result,
          error: "",
          status: "success",
        });

        if (operationId) {
          finishAsyncOperation(operationId, {
            message: shouldReportFinal ? nextSuccessMessage : "",
            status: "success",
          });
        }

        return result;
      } catch (error) {
        const message = getErrorMessage(error, nextErrorMessage);

        setState((current) => ({
          ...current,
          error: message,
          status: "error",
        }));

        if (operationId) {
          finishAsyncOperation(operationId, {
            message: shouldReportFinal ? message : "",
            status: "error",
          });
        }

        throw error;
      }
    },
    [errorMessage, loadingMessage, reportFinal, reportGlobal, successMessage],
  );

  return {
    ...state,
    isError: state.status === "error",
    isIdle: state.status === "idle",
    isLoading: state.status === "loading",
    isSuccess: state.status === "success",
    reset,
    run,
  };
}
