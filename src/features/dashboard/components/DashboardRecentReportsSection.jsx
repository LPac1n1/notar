import { useCallback, useEffect, useState } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import SectionCard from "../../../components/ui/SectionCard";
import { DownloadIcon, FileIcon } from "../../../components/ui/icons";
import Button from "../../../components/ui/Button";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { listRecentReports } from "../../../services/recentReportsService";
import {
  exportDonorsCsv,
  exportImportCpfSummaryCsv,
  exportImportsCsv,
  exportMonthlySummariesCsv,
  exportReconciliationByDonorCsv,
  exportReconciliationPairsCsv,
} from "../../../services/exportService";
import { logError } from "../../../services/logger";
import { formatDateTimePtBR } from "../../../utils/date";
import { getErrorMessage } from "../../../utils/error";
import { formatInteger } from "../../../utils/format";

// Map service `kind` to actual export function. Kept inside the consumer
// (rather than in `recentReportsService`) because the consumer is the one
// that has to handle React state for the loading flag — services stay
// stateless.
const EXPORTERS = {
  exportImports: exportImportsCsv,
  exportImportCpfSummary: exportImportCpfSummaryCsv,
  exportDonors: exportDonorsCsv,
  exportReconciliationByDonor: exportReconciliationByDonorCsv,
  exportReconciliationPairs: exportReconciliationPairsCsv,
  exportMonthlySummaries: exportMonthlySummariesCsv,
};

function describeFilters(filters) {
  if (!filters || typeof filters !== "object") return "";
  const parts = [];
  if (filters.referenceMonth) {
    parts.push(`mês ${filters.referenceMonth.slice(0, 7)}`);
  }
  if (filters.statusFilter && filters.statusFilter !== "all") {
    parts.push(`status ${filters.statusFilter}`);
  }
  return parts.length > 0 ? `Filtros: ${parts.join(", ")}` : "";
}

/**
 * Lists the most recent exports the user generated. Each row is a single
 * line with metadata + a "Re-exportar" button that re-runs the same
 * service call. For exports that depend on filters (Monthly), the
 * filters from the original payload are replayed verbatim.
 *
 * Reads from `action_history` via `listRecentReports`. The section hides
 * itself entirely when there is no export history — avoids showing an
 * empty card for users who never exported anything.
 */
export default function DashboardRecentReportsSection() {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reExportingId, setReExportingId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const rows = await listRecentReports({ limit: 5 });
      setReports(rows);
      setError("");
    } catch (err) {
      logError("DashboardRecentReports.load", err);
      setError("Não foi possível carregar os relatórios recentes.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when a new export lands in history.
  useDatabaseChangeEffect(load, { domains: ["history"] });

  const handleReExport = async (report) => {
    const exporter = EXPORTERS[report.reExport?.kind];
    if (!exporter) return;

    try {
      setReExportingId(report.id);
      setError("");
      setSuccessMessage("");
      const filters = report.reExport.usesFilters
        ? report.filters || {}
        : undefined;
      const result = await exporter(filters);
      setSuccessMessage(
        `${report.label} re-exportado: ${formatInteger(result?.rowCount ?? 0)} linha(s).`,
      );
    } catch (err) {
      logError("DashboardRecentReports.reExport", err);
      setError(getErrorMessage(err, "Não foi possível re-exportar."));
    } finally {
      setReExportingId("");
    }
  };

  if (isLoading) return null;
  if (reports.length === 0 && !error) return null;

  return (
    <SectionCard
      title="Relatórios recentes"
      icon={DownloadIcon}
      description="Os últimos exports que você gerou. Clique em 'Re-exportar' para gerar um novo CSV com os dados atuais."
      className="mb-6"
      collapsible
      defaultOpen={false}
    >
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      {reports.length === 0 ? (
        <EmptyState
          title="Nenhum export recente"
          description="Quando você exportar um CSV ele aparecerá aqui."
        />
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => {
            const filterHint = describeFilters(report.filters);
            return (
              <li
                key={report.id}
                className="flex flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted-strong)]"
                  >
                    <FileIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                      {report.label}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatDateTimePtBR(report.createdAt)}
                      {report.rowCount > 0
                        ? ` · ${formatInteger(report.rowCount)} linha(s)`
                        : ""}
                      {filterHint ? ` · ${filterHint}` : ""}
                    </p>
                  </div>
                </div>
                {EXPORTERS[report.reExport?.kind] ? (
                  <Button
                    variant="subtle"
                    onClick={() => handleReExport(report)}
                    disabled={reExportingId === report.id}
                    isLoading={reExportingId === report.id}
                    loadingLabel="Exportando..."
                    className="min-h-8 shrink-0 px-3 py-1.5 text-xs"
                  >
                    Re-exportar
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
