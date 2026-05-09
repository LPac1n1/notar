import { useCallback } from "react";
import { logError } from "../../../services/logger";
import { getErrorMessage } from "../../../utils/error";

/**
 * Reduces the four near-identical mutation handlers in `Monthly.jsx` (single
 * row toggle, consolidated donor toggle, bulk abate, undo) to a single shared
 * runner. Each call shares the same skeleton:
 *
 *   1. clear error/success/action
 *   2. flag updating donor/summary
 *   3. await the mutation
 *   4. trigger a reload
 *   5. show success + optional Desfazer action
 *   6. on error: log + setError(getErrorMessage(...)) + clear flags
 *
 * The hook returns a function that takes the mutation-specific bits (runner,
 * messages, undo factory) and handles the rest. Returns the truthiness of
 * success so callers can chain follow-up state (e.g. closing a modal only
 * when the action succeeded).
 *
 * @example
 *   const runStatusAction = useStatusChangeAction({
 *     setError, setSuccessMessage, setSuccessAction,
 *     setUpdatingDonorId, setUpdatingSummaryId,
 *     reload: reloadSummaries,
 *   });
 *
 *   await runStatusAction({
 *     scope: "MonthlyPage.bulkAbate",
 *     summaryId,
 *     run: () => updateAbatementStatuses(...),
 *     successMessage: "Abatimentos atualizados.",
 *     undo: { ... },
 *   });
 */
export function useStatusChangeAction({
  setError,
  setSuccessMessage,
  setSuccessAction,
  setUpdatingDonorId,
  setUpdatingSummaryId,
  reload,
}) {
  return useCallback(
    async ({
      scope = "MonthlyPage.statusChange",
      donorId = "",
      summaryId = "",
      run,
      successMessage = "",
      errorMessage = "Não foi possível concluir a operação.",
      undo,
    }) => {
      try {
        setError?.("");
        setSuccessMessage?.("");
        setSuccessAction?.(null);
        setUpdatingDonorId?.(donorId);
        setUpdatingSummaryId?.(summaryId);

        await run();
        await reload?.();

        if (successMessage) {
          setSuccessMessage?.(successMessage);
        }

        if (undo) {
          setSuccessAction?.({ label: "Desfazer", onAction: undo });
        }

        return true;
      } catch (err) {
        logError(scope, err);
        setError?.(getErrorMessage(err, errorMessage));
        return false;
      } finally {
        setUpdatingDonorId?.("");
        setUpdatingSummaryId?.("");
      }
    },
    [
      setError,
      setSuccessMessage,
      setSuccessAction,
      setUpdatingDonorId,
      setUpdatingSummaryId,
      reload,
    ],
  );
}
