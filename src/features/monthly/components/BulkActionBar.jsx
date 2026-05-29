import Button from "../../../components/ui/Button";
import { CheckIcon } from "../../../components/ui/icons";
import { formatInteger } from "../../../utils/format";

/**
 * Sticky-ish action bar that appears at the top of the Monthly list when
 * the user has at least one summary row selected via the row checkbox.
 *
 * Patterned after Gmail / Linear / GitHub: hides until there's a
 * selection, gives the user exactly the actions that make sense for the
 * current selection (with counts of what will actually change), and a
 * "limpar" escape hatch.
 *
 * Bulk apply only operates on rows that are *both* selected AND eligible
 * (`canUpdateAbatement && abatementStatus === 'pending'`). The bar
 * surfaces both counts so the operator knows exactly what'll happen:
 *
 *   "3 selecionados · 2 pendentes elegíveis · [Abater 2 pendentes]"
 *
 * Padding/margins keep it visible at the top of the SectionCard without
 * clobbering the existing toolbar — it lives ABOVE the filters bar and
 * scrolls with the page (no `position: sticky` because the parent grid
 * is the page itself).
 */
export default function BulkActionBar({
  selectedCount,
  eligibleCount,
  onApplyBulk,
  onClear,
  isApplying = false,
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Ações em lote"
      className="mb-4 flex flex-col gap-3 rounded-md border border-[var(--accent)] bg-[var(--surface-elevated)] p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[#12151c]"
        >
          <CheckIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-main)]">
            {formatInteger(selectedCount)} selecionado(s)
          </p>
          <p className="text-xs text-[var(--muted)]">
            {eligibleCount > 0
              ? `${formatInteger(eligibleCount)} pendente(s) elegível(eis) para abatimento`
              : "Nenhuma das linhas selecionadas está pendente"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="primary"
          onClick={onApplyBulk}
          disabled={eligibleCount === 0 || isApplying}
          isLoading={isApplying}
          loadingLabel="Abatendo..."
          className="min-h-9 px-3 py-1.5 text-xs"
        >
          Abater {formatInteger(eligibleCount)} pendente(s)
        </Button>
        <Button
          variant="subtle"
          onClick={onClear}
          disabled={isApplying}
          className="min-h-9 px-3 py-1.5 text-xs"
        >
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
