import { useCallback, useMemo } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import PaginationControls from "../../../components/ui/PaginationControls";
import SectionCard from "../../../components/ui/SectionCard";
import SelectInput from "../../../components/ui/SelectInput";
import StatusBadge from "../../../components/ui/StatusBadge";
import TextInput from "../../../components/ui/TextInput";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { usePaginatedResource } from "../../../hooks/usePaginatedResource";
import {
  countCreditNotes,
  listCreditNotes,
} from "../../../services/creditImportService";
import { formatMonthYear } from "../../../utils/date";
import { formatCpf } from "../../../utils/cpf";
import { formatCurrency, formatInteger } from "../../../utils/format";

// Sync these labels with `buildCreditNotesFilters` in
// services/credit/creditImportPipeline.js — adding a new option here without
// teaching the SQL helper will silently fall through to "no filter".
const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "valid", label: "Válidas (calculadas)" },
  { value: "invalid", label: "Inválidas (situação ≠ calculado)" },
  { value: "matched", label: "Casadas com doação" },
  { value: "divergent", label: "Divergentes (valor difere)" },
  { value: "credit_only", label: "Sem doação correspondente" },
  { value: "duplicate_credit", label: "Duplicadas no crédito" },
];

const STATUS_BADGES = {
  matched: { label: "Casada", tone: "success" },
  divergent: { label: "Divergente", tone: "warning" },
  credit_only: { label: "Sem doação", tone: "warning" },
  duplicate_credit: { label: "Duplicada", tone: "danger" },
};

function MatchStatusBadge({ matchStatus, isValid }) {
  if (!isValid) {
    return <StatusBadge label="Inválida" tone="neutral" />;
  }
  const descriptor = STATUS_BADGES[matchStatus];
  if (descriptor) {
    return <StatusBadge label={descriptor.label} tone={descriptor.tone} />;
  }
  return <StatusBadge label="Pendente" tone="neutral" />;
}

function formatCnpj(cnpj) {
  if (!cnpj || cnpj.length < 14) return cnpj || "—";
  // 12.345.678/0001-99
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
}

function formatBrazilianDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!day) return value;
  return `${day}/${month}/${year}`;
}

/**
 * Browsable list of every credit note in the database. Powers the "Notas de
 * crédito" section on the Credits page (Sprint 3 / P4.1). Filters are
 * applied server-side via `listCreditNotes` so the page stays responsive
 * even when the underlying table holds 30k+ rows.
 *
 * Each row tells the user where the note is in the reconciliation pipeline
 * (matched, divergent, orphan…) and surfaces the matched donor when one
 * exists — clicking the donor name takes them straight to the donor profile.
 */
export default function CreditNotesSection({
  filters,
  onFilterChange,
  onClearFilters,
  onOpenDonorProfile,
  referenceMonthOptions,
}) {
  const loader = useCallback(
    ({ limit, offset, ...rest }) =>
      listCreditNotes({
        ...rest,
        limit,
        offset,
      }),
    [],
  );
  const countLoader = useCallback(
    (currentFilters) => countCreditNotes(currentFilters),
    [],
  );

  const memoFilters = useMemo(
    () => ({
      referenceMonth: filters.referenceMonth,
      statusFilter: filters.status,
      search: filters.search,
    }),
    [filters.referenceMonth, filters.status, filters.search],
  );

  const {
    data,
    isLoading,
    isRefreshing,
    error,
    pagination,
    reload,
  } = usePaginatedResource({
    loader,
    countLoader,
    filters: memoFilters,
    errorMessage: "Não foi possível carregar as notas de crédito.",
    scope: "CreditNotesSection",
    initialData: [],
    initialPageSize: 25,
  });

  useDatabaseChangeEffect(reload, {
    sources: [
      "credit-import",
      "credit-reimport",
      "reconciliation",
      "import",
      "reimport",
    ],
  });

  const rows = data ?? [];
  const hasActiveFilters = Boolean(
    filters.referenceMonth || filters.status || filters.search,
  );

  return (
    <SectionCard className="mb-5">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[var(--text-main)]">
            Notas de crédito
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Lista detalhada das notas importadas, com o status atual de
            conciliação. Use os filtros para isolar divergências ou créditos
            sem doação correspondente.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <SelectInput
          label="Mês de referência"
          name="referenceMonth"
          value={filters.referenceMonth}
          onChange={onFilterChange}
          options={referenceMonthOptions}
          placeholder="Todos os meses"
        />
        <SelectInput
          label="Status"
          name="status"
          value={filters.status}
          onChange={onFilterChange}
          options={STATUS_OPTIONS}
        />
        <TextInput
          label="Buscar"
          name="search"
          placeholder="CNPJ ou nº da nota"
          value={filters.search}
          onChange={onFilterChange}
        />
        <div className="flex items-end">
          <button
            type="button"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface-strong)] text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <FeedbackMessage tone="error" message={error} persistent />

      {isLoading && rows.length === 0 ? (
        <SkeletonRows rows={5} loadingLabel="Carregando notas de crédito..." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma nota encontrada"
          description={
            hasActiveFilters
              ? "Ajuste ou limpe os filtros para ver mais resultados."
              : "Importe uma planilha de créditos para ver as notas aqui."
          }
        />
      ) : (
        <div aria-busy={isRefreshing} className="space-y-3">
          <PaginationControls
            className="bg-[var(--surface-strong)]"
            endItem={pagination.endItem}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
          />

          <div className="overflow-x-auto rounded-md border border-[var(--line)]">
            <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
              <thead className="bg-[var(--surface-strong)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Mês</th>
                  <th className="px-3 py-2">CNPJ Estabelecimento</th>
                  <th className="px-3 py-2">Nº Nota</th>
                  <th className="px-3 py-2">Data emissão</th>
                  <th className="px-3 py-2 text-right">Valor NF</th>
                  <th className="px-3 py-2 text-right">Crédito (R$)</th>
                  <th className="px-3 py-2">Doador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-[var(--surface-elevated)]">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--surface-strong)]">
                    <td className="px-3 py-2">
                      <MatchStatusBadge
                        matchStatus={row.matchStatus}
                        isValid={row.isValid}
                      />
                      {!row.isValid && row.situacao ? (
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          Situação: {row.situacao}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-soft)]">
                      {row.referenceMonth
                        ? formatMonthYear(row.referenceMonth)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-soft)]">
                      {formatCnpj(row.cnpjEstabelecimento)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-soft)]">
                      {row.numeroNota || "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-soft)]">
                      {formatBrazilianDate(row.dataEmissao)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-soft)]">
                      {formatCurrency(row.valorNf)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-main)]">
                      {formatCurrency(row.credito)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {row.donorId ? (
                        <button
                          type="button"
                          onClick={() => onOpenDonorProfile?.(row.donorId)}
                          className="text-left text-[var(--accent)] underline-offset-2 transition hover:underline"
                        >
                          {row.donorName || "Doador"}
                        </button>
                      ) : row.donationCpf ? (
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {formatCpf(row.donationCpf)}
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            className="bg-[var(--surface-strong)]"
            endItem={pagination.endItem}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
          />

          <p className="text-xs text-[var(--muted)]">
            {isRefreshing
              ? "Atualizando lista..."
              : `${formatInteger(pagination.totalItems)} nota(s) encontrada(s).`}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
