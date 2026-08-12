import { useCallback, useMemo, useState } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import SelectInput from "../../../components/ui/SelectInput";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import CopyableDonorName from "../../donors/components/CopyableDonorName";
import { useDataResource } from "../../../hooks/useDataResource";
import {
  getTopDonorFilterOptions,
  listTopDonors,
  TOP_DONOR_SORT_OPTIONS,
} from "../../../services/dashboardService";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

const LIMIT_OPTIONS = [
  { value: "5", label: "Top 5" },
  { value: "10", label: "Top 10" },
  { value: "25", label: "Top 25" },
  { value: "50", label: "Top 50" },
];

const INITIAL_FILTERS = {
  referenceMonth: "",
  demand: "",
  sort: "abatement",
  limit: 5,
};

const EMPTY_OPTIONS = { months: [], demands: [] };

/**
 * Ranking de doadores com recorte próprio.
 *
 * As opções dos filtros carregam num recurso SEPARADO do ranking: elas só
 * mudam quando o banco muda, não quando o usuário troca de mês. Juntar os
 * dois faria toda troca de filtro refazer também as duas queries de DISTINCT.
 */
export default function TopDonorsSection({ onOpenDonor }) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const donorsLoader = useCallback((value) => listTopDonors(value), []);
  const {
    data: topDonors,
    isLoading,
    error,
  } = useDataResource({
    loader: donorsLoader,
    filters,
    errorMessage: "Não foi possível carregar o ranking de doadores.",
    scope: "Dashboard.topDonors",
  });

  const optionsLoader = useCallback(() => getTopDonorFilterOptions(), []);
  const optionsFilters = useMemo(() => ({}), []);
  const { data: options } = useDataResource({
    loader: optionsLoader,
    filters: optionsFilters,
    errorMessage: "Não foi possível carregar os filtros do ranking.",
    scope: "Dashboard.topDonorOptions",
    initialData: EMPTY_OPTIONS,
  });

  const monthOptions = useMemo(
    () => [
      { value: "", label: "Todos os meses" },
      ...(options?.months ?? []).map((month) => ({
        value: month,
        label: formatMonthYear(month),
      })),
    ],
    [options],
  );

  const demandOptions = useMemo(
    () => [
      { value: "", label: "Todas as demandas" },
      ...(options?.demands ?? []).map((demand) => ({
        value: demand,
        label: demand,
      })),
    ],
    [options],
  );

  const handleFilterChange = (event) => {
    const { name, value } = event.target;

    setFilters((current) => {
      const next = {
        ...current,
        [name]: name === "limit" ? Number(value) : value,
      };

      // Fixar um mês torna "meses doando" sempre 1. A opção some da lista,
      // então o valor precisa sair do filtro de verdade — deixá-lo só
      // escondido manteria a query ordenando por uma coluna constante.
      if (name === "referenceMonth" && value && next.sort === "months") {
        next.sort = "abatement";
      }

      return next;
    });
  };

  const hasFilters =
    JSON.stringify(filters) !== JSON.stringify(INITIAL_FILTERS);
  const isSingleMonth = Boolean(filters.referenceMonth);
  const sortOptions = isSingleMonth
    ? TOP_DONOR_SORT_OPTIONS.filter((option) => option.value !== "months")
    : TOP_DONOR_SORT_OPTIONS;

  return (
    <SectionCard
      title="Maiores doadores"
      description={
        filters.referenceMonth
          ? `Ranking de ${formatMonthYear(filters.referenceMonth)}.`
          : "Ranking histórico pelos maiores valores de abatimento gerados."
      }
    >
      {/* Duas colunas, não quatro: a seção divide a linha com "Demandas no
          último mês" a partir de xl, e quatro selects nessa largura truncam
          o texto selecionado para "To...". */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SelectInput
          label="Mês"
          name="referenceMonth"
          onChange={handleFilterChange}
          options={monthOptions}
          searchable
          value={filters.referenceMonth}
        />
        <SelectInput
          label="Demanda"
          name="demand"
          onChange={handleFilterChange}
          options={demandOptions}
          searchable
          value={filters.demand}
        />
        <SelectInput
          label="Ordenar por"
          name="sort"
          onChange={handleFilterChange}
          options={sortOptions}
          value={filters.sort}
        />
        <SelectInput
          label="Quantidade"
          name="limit"
          onChange={handleFilterChange}
          options={LIMIT_OPTIONS}
          value={String(filters.limit)}
        />
      </div>

      {error ? (
        <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {isLoading ? (
        <SkeletonRows rows={3} loadingLabel="Carregando ranking de doadores" />
      ) : null}

      {!isLoading && topDonors?.length ? (
        <div className="space-y-3">
          {topDonors.map((donor, index) => (
            <div
              key={`${donor.donorId}-${donor.demand}`}
              className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[auto_1fr_auto]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-sm font-semibold text-[var(--text-soft)]">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--text-main)]">
                  <CopyableDonorName
                    className="font-medium"
                    name={donor.donorName}
                    onClick={() => onOpenDonor(donor.donorId)}
                  />
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Demanda: {donor.demand}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {formatInteger(donor.totalNotes)} nota(s)
                  {isSingleMonth
                    ? ""
                    : ` em ${formatInteger(donor.importedMonthCount)} mês(es)`}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm text-[var(--muted)]">Abatimento</p>
                <p className="font-semibold break-words text-[var(--text-main)]">
                  {formatCurrency(donor.totalAbatement)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && !topDonors?.length ? (
        <EmptyState
          title={hasFilters ? "Nenhum doador nesse recorte" : "Sem ranking por enquanto"}
          description={
            hasFilters
              ? "Nenhuma doação bate com os filtros escolhidos. Ajuste o mês ou a demanda."
              : "Os maiores doadores aparecerão aqui depois das importações processadas."
          }
        />
      ) : null}
    </SectionCard>
  );
}
