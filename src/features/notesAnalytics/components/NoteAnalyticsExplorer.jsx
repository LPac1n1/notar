import { useCallback, useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import DataTable from "../../../components/ui/DataTable";
import EmptyState from "../../../components/ui/EmptyState";
import Eyebrow from "../../../components/ui/Eyebrow";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import MetricValue from "../../../components/ui/MetricValue";
import PaginationControls from "../../../components/ui/PaginationControls";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import NoteAnalyticsTable from "./NoteAnalyticsTable";
import NoteFiltersBar from "./NoteFiltersBar";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { usePaginatedResource } from "../../../hooks/usePaginatedResource";
import { listDonors } from "../../../services/donorService";
import {
  countNotesAnalytics,
  getNoteFilterOptions,
  getNotesAnalyticsSummary,
  listNotesAnalytics,
  listNotesForExport,
  NOTE_EXPORT_LIMIT,
} from "../../../services/notes/noteAnalyticsService";
import { DEFAULT_NOTE_SORT } from "../../../services/notes/noteAnalyticsSql";
import { buildCsvContent } from "../../../utils/csv";
import { formatMonthYear } from "../../../utils/date";
import { downloadFile } from "../../../utils/download";
import { getErrorMessage } from "../../../utils/error";
import { formatCurrency, formatInteger } from "../../../utils/format";
import {
  INITIAL_NOTE_FILTERS,
  NOTE_EXPORT_HEADERS,
} from "../constants";

/**
 * Explorador de notas fiscais.
 *
 * A mesma peça serve ao painel da plataforma e ao perfil do doador: lá com
 * todos os filtros, aqui com o doador travado. Duas implementações da mesma
 * tabela divergiriam na primeira regra que mudasse de um lado só.
 *
 * `lockedFilters` entra por cima do que o usuário escolhe e não aparece na
 * barra — é contexto da página, não escolha. `showSummary` desliga os
 * indicadores para o perfil do doador, que já os tem logo acima.
 */

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function Indicator({ label, value, helper = "" }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2">
        <MetricValue size="lg">{value}</MetricValue>
      </div>
      {helper ? (
        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{helper}</p>
      ) : null}
    </div>
  );
}

const BAND_COLUMNS = [
  { label: "Faixa de compra" },
  { label: "Notas", align: "right" },
  { label: "Gasto", align: "right" },
  { label: "Crédito", align: "right" },
  { label: "Retorno", align: "right" },
];

const TOP_COLUMNS = [
  { label: "Estabelecimento" },
  { label: "Notas", align: "right" },
  { label: "Crédito", align: "right" },
  { label: "Maior nota", align: "right" },
];

/**
 * `sort` e `direction` viajam dentro do objeto de filtros para o recurso
 * paginado recarregar quando a ordenação muda — mas não são filtros e não
 * podem entrar no WHERE. Esta função os separa num lugar só, em vez de cada
 * carregador lembrar de descartá-los.
 */
function splitQuery({ sort, direction, limit, offset, ...filters }) {
  return { sort, direction, limit, offset, filters };
}

// UTF-8 BOM. Sem ele o Excel abre o CSV em ANSI e quebra os acentos.
const CSV_BOM = "\uFEFF";

const EMPTY_SUMMARY = { bands: [], topEstablishments: [] };
const EMPTY_OPTIONS = { months: [], establishments: [], projects: [] };

export default function NoteAnalyticsExplorer({
  exportPrefix = "notas-fiscais",
  hiddenColumns = [],
  hiddenFilters = [],
  lockedFilters = null,
  showSummary = true,
}) {
  const [filters, setFilters] = useState(INITIAL_NOTE_FILTERS);
  const [ordering, setOrdering] = useState({
    sort: DEFAULT_NOTE_SORT,
    direction: "desc",
  });
  const { sort, direction } = ordering;
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  // O contexto da página tem a última palavra: um filtro de doador digitado na
  // barra não pode escapar do perfil em que a tabela está embutida.
  const effectiveFilters = useMemo(
    () => ({ ...filters, ...(lockedFilters ?? {}) }),
    [filters, lockedFilters],
  );

  const queryFilters = useMemo(
    () => ({ ...effectiveFilters, sort, direction }),
    [effectiveFilters, sort, direction],
  );

  const loadRows = useCallback(
    (query) => listNotesAnalytics(splitQuery(query)),
    [],
  );

  const loadCount = useCallback(
    (query) => countNotesAnalytics({ filters: splitQuery(query).filters }),
    [],
  );

  const {
    data: rows,
    error,
    isLoading,
    pagination,
    reload: reloadRows,
  } = usePaginatedResource({
    loader: loadRows,
    countLoader: loadCount,
    filters: queryFilters,
    initialPageSize: 25,
    errorMessage: "Não foi possível carregar as notas fiscais.",
    scope: "NoteAnalytics",
  });

  const loadSummary = useCallback(
    (query) => getNotesAnalyticsSummary({ filters: splitQuery(query).filters }),
    [],
  );

  const { data: summary, reload: reloadSummary } = useDataResource({
    loader: loadSummary,
    filters: queryFilters,
    initialData: EMPTY_SUMMARY,
    errorMessage: "Não foi possível calcular os indicadores das notas.",
    scope: "NoteAnalyticsSummary",
  });

  const emptyFilters = useMemo(() => ({}), []);

  const loadOptions = useCallback(async () => {
    const [options, donors] = await Promise.all([
      getNoteFilterOptions(),
      listDonors({ isActive: "" }),
    ]);

    return {
      ...options,
      months: options.months.map((month) => ({
        value: month.value,
        label: formatMonthYear(month.label),
      })),
      donors: donors.map((donor) => ({ value: donor.id, label: donor.name })),
    };
  }, []);

  const { data: options } = useDataResource({
    loader: loadOptions,
    filters: emptyFilters,
    initialData: EMPTY_OPTIONS,
    errorMessage: "Não foi possível carregar as opções de filtro.",
    scope: "NoteAnalyticsOptions",
  });

  const reloadAll = useCallback(() => {
    reloadRows();
    reloadSummary();
  }, [reloadRows, reloadSummary]);

  useDatabaseChangeEffect(reloadAll, {
    domains: ["imports", "credits", "donors", "projects"],
  });

  const handleSort = useCallback((column) => {
    setOrdering((current) =>
      current.sort === column
        ? // Mesma coluna inverte o sentido.
          { sort: column, direction: current.direction === "desc" ? "asc" : "desc" }
        : // Coluna nova começa decrescente, que é o que se quer ver
          // primeiro num ranking.
          { sort: column, direction: "desc" },
    );
  }, []);

  const hasFilters =
    JSON.stringify(filters) !== JSON.stringify(INITIAL_NOTE_FILTERS);

  const handleClearFilters = useCallback(() => {
    setFilters(INITIAL_NOTE_FILTERS);
    setExportMessage("");
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError("");
    setExportMessage("");

    try {
      const exported = await listNotesForExport({
        filters: effectiveFilters,
        sort,
        direction,
      });

      if (exported.length === 0) {
        setExportError("Não há notas para exportar com os filtros atuais.");
        return;
      }

      const csv = buildCsvContent(
        NOTE_EXPORT_HEADERS,
        exported.map((row) => ({
          ...row,
          // Vírgula decimal e percentual já formatados: o destino é uma
          // planilha em português, onde o ponto decimal vira texto.
          valor: String(row.valor ?? 0).replace(".", ","),
          credito:
            row.credito === null ? "" : String(row.credito).replace(".", ","),
          retorno: row.retorno === null ? "" : formatPercent(row.retorno),
        })),
      );

      downloadFile({
        // BOM para o Excel reconhecer o UTF-8 e não quebrar os acentos.
        content: `${CSV_BOM}${csv}`,
        fileName: `${exportPrefix}-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: "text/csv;charset=utf-8",
      });

      setExportMessage(
        exported.length >= NOTE_EXPORT_LIMIT
          ? `Exportadas as primeiras ${formatInteger(NOTE_EXPORT_LIMIT)} notas. Refine os filtros para alcançar o restante.`
          : `${formatInteger(exported.length)} nota(s) exportada(s).`,
      );
    } catch (exportFailure) {
      setExportError(
        getErrorMessage(exportFailure, "Não foi possível exportar as notas."),
      );
    } finally {
      setIsExporting(false);
    }
  }, [direction, effectiveFilters, exportPrefix, sort]);

  const totals = summary ?? EMPTY_SUMMARY;

  return (
    <div className="space-y-5">
      <NoteFiltersBar
        filters={filters}
        hidden={hiddenFilters}
        onChange={setFilters}
        options={options ?? EMPTY_OPTIONS}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleExport}
          disabled={isExporting || pagination.totalItems === 0}
          variant="subtle"
        >
          {isExporting ? "Exportando..." : "Exportar resultado"}
        </Button>
        {hasFilters ? (
          <Button onClick={handleClearFilters} variant="ghost">
            Limpar filtros
          </Button>
        ) : null}
        <p className="text-sm text-[var(--muted)]">
          {formatInteger(pagination.totalItems)} nota(s) no recorte atual.
        </p>
      </div>

      <FeedbackMessage message={error || exportError} tone="error" />
      <FeedbackMessage message={exportMessage} tone="success" />

      {showSummary && totals.notes > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Indicator
              label="Crédito gerado"
              value={formatCurrency(totals.totalCredit)}
              helper={`${formatInteger(totals.reconciledNotes)} de ${formatInteger(totals.notes)} nota(s) conciliada(s)`}
            />
            <Indicator
              label="Valor gasto"
              value={formatCurrency(totals.totalSpent)}
              helper={`Compra média de ${formatCurrency(totals.averageValue ?? 0)}`}
            />
            <Indicator
              label="Retorno médio"
              value={formatPercent(totals.averageReturn)}
              helper="Crédito sobre o valor gasto no recorte."
            />
            <Indicator
              label="Crédito por nota"
              value={formatCurrency(totals.averageCredit ?? 0)}
              helper={`Maior nota: ${formatCurrency(totals.biggestCredit ?? 0)}`}
            />
            <Indicator
              label="Maior compra"
              value={formatCurrency(totals.biggestPurchase ?? 0)}
              helper="Nota de maior valor no recorte."
            />
            <Indicator
              label="Estabelecimentos"
              value={formatInteger(totals.establishments)}
              helper={`${formatInteger(totals.donors)} doador(es) cadastrado(s)`}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="min-w-0">
              <Eyebrow className="mb-3">Retorno por faixa de compra</Eyebrow>
              <DataTable
                caption="Notas, gasto e crédito agrupados por faixa de valor da compra."
                columns={BAND_COLUMNS}
              >
                {totals.bands.map((band) => (
                  <tr key={band.key}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {band.label}
                    </th>
                    <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                      {formatInteger(band.notes)}
                    </td>
                    <td className="numeric px-3 py-2 text-right text-[var(--muted)]">
                      {formatCurrency(band.totalSpent)}
                    </td>
                    <td className="numeric px-3 py-2 text-right text-[var(--text-main)]">
                      {formatCurrency(band.totalCredit)}
                    </td>
                    <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                      {formatPercent(band.averageReturn)}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>

            <div className="min-w-0">
              <Eyebrow className="mb-3">Onde estão as compras excepcionais</Eyebrow>
              {totals.topEstablishments.length ? (
                <>
                  <p className="mb-3 text-sm leading-6 text-[var(--muted)]">
                    Só as notas no decil superior de crédito deste recorte —
                    acima de{" "}
                    {formatCurrency(totals.topEstablishments[0].threshold ?? 0)}.
                    É uma pergunta diferente do ranking geral: uma rede pode
                    dominar o total por volume e não aparecer aqui.
                  </p>
                  <DataTable
                    caption="Estabelecimentos das notas de maior crédito do recorte."
                    columns={TOP_COLUMNS}
                  >
                    {totals.topEstablishments.map((item) => (
                      <tr key={item.cnpj}>
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {item.name}
                        </th>
                        <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                          {formatInteger(item.notes)}
                        </td>
                        <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                          {formatCurrency(item.totalCredit)}
                        </td>
                        <td className="numeric px-3 py-2 text-right text-[var(--muted)]">
                          {formatCurrency(item.biggestCredit ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Nenhuma nota conciliada neste recorte.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {isLoading && rows.length === 0 ? (
        <SkeletonRows rows={5} loadingLabel="Carregando notas fiscais..." />
      ) : pagination.totalItems === 0 ? (
        <EmptyState
          title={
            hasFilters ? "Nenhuma nota neste recorte" : "Nenhuma nota importada"
          }
          description={
            hasFilters
              ? "Nenhuma nota atende aos filtros aplicados."
              : "As notas aparecem aqui depois da primeira planilha de doações importada."
          }
          action={
            hasFilters ? (
              <Button variant="subtle" onClick={handleClearFilters}>
                Limpar filtros
              </Button>
            ) : null
          }
        />
      ) : (
        <div>
          <PaginationControls
            endItem={pagination.endItem}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
          />
          <NoteAnalyticsTable
            caption="Notas fiscais do recorte atual, ordenadas pela coluna escolhida."
            direction={direction}
            hiddenColumns={hiddenColumns}
            onSort={handleSort}
            rows={rows}
            sort={sort}
          />
        </div>
      )}
    </div>
  );
}
