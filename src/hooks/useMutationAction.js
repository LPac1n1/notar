import { useCallback } from "react";
import { logError } from "../services/logger";
import { getErrorMessage } from "../utils/error";

/**
 * Generic mutation runner for the CRUD pages. Captures the boilerplate that
 * was repeated across handleAdd / handleSave / handleDelete / handleConfirm in
 * Donors, People, Demands, Imports, DonorProfile, etc.:
 *
 *   1. Clear feedback flags (error, success message, success action).
 *   2. Mark the page as busy via the caller's setter (e.g. setIsSubmitting).
 *   3. Run the mutation, then optionally trigger a reload.
 *   4. Show success copy and an optional Desfazer action.
 *   5. On failure: log under a scope, set a localized error message.
 *   6. Always: clear the busy flag.
 *
 * The hook accepts the page-level setters so it can drive the UI without
 * each caller re-importing logError/getErrorMessage. Per-call options carry
 * the mutation-specific bits.
 *
 * Returns a runner that resolves to `true` on success and `false` on failure
 * — useful for callers that need to chain follow-up state (e.g. closing a
 * modal only when the mutation succeeded).
 *
 * `useStatusChangeAction` is a domain-tuned cousin of this hook for the
 * Monthly page; both share the same skeleton but Monthly needs separate
 * `setUpdatingDonorId`/`setUpdatingSummaryId` flags. Don't try to merge them
 * — the per-row updating flag is specific to Monthly's StatusToggle UI.
 *
 * @example
 *   const runMutation = useMutationAction({
 *     setError: setFormError,
 *     setSuccessMessage,
 *     setSuccessAction,
 *     setBusy: setIsSubmitting,
 *     reload: reloadDonors,
 *   });
 *
 *   await runMutation({
 *     scope: "DonorsPage.create",
 *     run: () => createDonor(form),
 *     successMessage: "Doador cadastrado com sucesso.",
 *     errorMessage: "Não foi possível cadastrar o doador.",
 *     onSuccess: () => closeCreateModal(),
 *   });
 */
export function useMutationAction({
  setError,
  setSuccessMessage,
  setSuccessAction,
  setBusy,
  reload,
}) {
  return useCallback(
    async ({
      scope = "useMutationAction",
      run,
      successMessage = "",
      errorMessage = "Não foi possível concluir a operação.",
      undo,
      buildUndo,
      onStart,
      onSuccess,
      onError,
      logContext,
    } = {}) => {
      if (typeof run !== "function") {
        return false;
      }

      setBusy?.(true);
      try {
        setError?.("");
        setSuccessMessage?.("");
        setSuccessAction?.(null);

        onStart?.();
        const result = await run();
        await reload?.();

        if (successMessage) {
          setSuccessMessage?.(successMessage);
        }

        // Support either a plain `undo` callback, or a `buildUndo` factory
        // that receives the run result. The factory form lets handlers like
        // `deleteX` use a trashItemId returned by the mutation as the input
        // to a Desfazer action — the inline `undo` is evaluated AFTER `run`
        // resolves so the result is available.
        const resolvedUndo =
          typeof buildUndo === "function" ? buildUndo(result) : undo;
        if (resolvedUndo) {
          setSuccessAction?.({
            label: "Desfazer",
            onAction: resolvedUndo,
          });
        }

        onSuccess?.(result);
        return true;
      } catch (err) {
        logError(scope, err, logContext ?? {});
        onError?.(err);
        setError?.(getErrorMessage(err, errorMessage));
        return false;
      } finally {
        setBusy?.(false);
      }
    },
    [setError, setSuccessMessage, setSuccessAction, setBusy, reload],
  );
}
