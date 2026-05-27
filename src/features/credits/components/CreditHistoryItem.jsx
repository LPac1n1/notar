import { useEffect, useState } from "react";
import Button from "../../../components/ui/Button";
import StatusBadge from "../../../components/ui/StatusBadge";
import { LoadingIcon, TrashIcon } from "../../../components/ui/icons";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import {
  diagnoseCreditImportMatching,
  getCreditImportMatchStats,
  loadCreditSituacaoBreakdown,
} from "../../../services/creditImportService";
import { logError } from "../../../services/logger";

function MatchStats({ creditImportId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!creditImportId) return undefined;
    let cancelled = false;
    getCreditImportMatchStats(creditImportId)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((err) => {
        logError("CreditHistoryItem.matchStats", err);
      });
    return () => {
      cancelled = true;
    };
  }, [creditImportId]);

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <LoadingIcon className="h-3 w-3 animate-spin" />
        Calculando conciliação...
      </div>
    );
  }

  return (
    <ul className="space-y-1 text-xs">
      <li className="flex items-center justify-between gap-3">
        <span className="text-[var(--success)]">Casadas com doações</span>
        <span className="font-mono text-[var(--text-soft)]">
          {formatInteger(stats.matchedCount)} ·{" "}
          {formatCurrency(stats.matchedCreditValue)}
        </span>
      </li>
      {stats.divergentCount > 0 ? (
        <li className="flex items-center justify-between gap-3">
          <span className="text-[var(--warning)]">
            Divergentes (mesma nota, valor diferente)
          </span>
          <span className="font-mono text-[var(--text-soft)]">
            {formatInteger(stats.divergentCount)} ·{" "}
            {formatCurrency(stats.divergentCreditValue)}
          </span>
        </li>
      ) : null}
      <li className="flex items-center justify-between gap-3">
        <span className="text-[var(--warning)]">Sem doação correspondente</span>
        <span className="font-mono text-[var(--text-soft)]">
          {formatInteger(stats.creditOnlyCount)}
        </span>
      </li>
      {stats.duplicateCreditCount > 0 ? (
        <li className="flex items-center justify-between gap-3">
          <span className="text-[var(--danger)]">Duplicadas no crédito</span>
          <span className="font-mono text-[var(--text-soft)]">
            {formatInteger(stats.duplicateCreditCount)}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function MatchDiagnostic({ creditImportId }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!creditImportId) return undefined;
    let cancelled = false;
    diagnoseCreditImportMatching(creditImportId)
      .then((rows) => {
        if (!cancelled) setReport(rows);
      })
      .catch((err) => {
        logError("CreditHistoryItem.diagnose", err);
        if (!cancelled) setError("Não foi possível gerar o diagnóstico.");
      });
    return () => {
      cancelled = true;
    };
  }, [creditImportId]);

  if (error) {
    return <p className="text-xs text-[var(--danger)]">{error}</p>;
  }

  if (!report) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <LoadingIcon className="h-3 w-3 animate-spin" />
        Comparando chaves...
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-[var(--muted)]">
        Doações na base: {formatInteger(report.donationsValid)} válidas (
        {formatInteger(report.donationsTotal)} totais) ·{" "}
        Créditos nesta importação: {formatInteger(report.creditsValid)} válidos.
      </p>

      {report.donationsValid === 0 ? (
        <p className="text-[var(--warning)]">
          Não há doações importadas. Importe a planilha de doações do mesmo
          período antes de comparar.
        </p>
      ) : null}

      {report.samples.length === 0 ? (
        <p className="text-[var(--muted)]">
          Esta importação não tem créditos válidos para comparar.
        </p>
      ) : (
        report.samples.map((sample, index) => (
          <div
            key={index}
            className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3"
          >
            <p className="mb-2 font-medium text-[var(--text-soft)]">
              Crédito #{index + 1} ({formatInteger(sample.cnpjMatches)} doação
              (ões) com mesmo CNPJ ·{" "}
              <span
                className={
                  sample.cnpjMatchesWithNumero > 0
                    ? ""
                    : "text-[var(--danger)] font-semibold"
                }
              >
                {formatInteger(sample.cnpjMatchesWithNumero)} com número
                preenchido
              </span>
              {" · "}
              {formatInteger(sample.matchKeyMatches)} com CNPJ + número ·{" "}
              <span
                className={
                  sample.fullMatches > 0
                    ? "text-[var(--success)] font-semibold"
                    : "text-[var(--danger)] font-semibold"
                }
              >
                {formatInteger(sample.fullMatches)} com chave completa
                (CNPJ + número + valor)
              </span>
              )
            </p>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase text-[var(--muted)]">
                  Crédito (esta planilha)
                </p>
                <p className="font-mono">
                  CNPJ: {sample.credit.cnpjEstabelecimento || "—"}
                </p>
                <p className="font-mono">
                  Nº: {sample.credit.numeroNota || "—"}
                </p>
                <p className="font-mono">
                  Valor NF: {formatCurrency(sample.credit.valorCents / 100)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase text-[var(--muted)]">
                  Doação encontrada (mesmo CNPJ)
                </p>
                {sample.closestDonation ? (
                  <>
                    <p className="font-mono">
                      CNPJ: {sample.closestDonation.cnpjEstabelecimento || "—"}
                    </p>
                    <p className="font-mono">
                      Nº: {sample.closestDonation.numeroNota || "—"}
                    </p>
                    <p className="font-mono">
                      Valor: {formatCurrency(sample.closestDonation.valorCents / 100)}
                    </p>
                  </>
                ) : (
                  <p className="font-mono text-[var(--muted)]">
                    Nenhuma doação tem esse CNPJ.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SituacaoBreakdown({ creditImportId }) {
  const [breakdown, setBreakdown] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadCreditSituacaoBreakdown(creditImportId)
      .then((rows) => {
        if (!cancelled) setBreakdown(rows);
      })
      .catch((err) => {
        logError("CreditHistoryItem.breakdown", err);
        if (!cancelled) setError("Não foi possível carregar o detalhamento.");
      });
    return () => {
      cancelled = true;
    };
  }, [creditImportId]);

  if (error) {
    return <p className="text-xs text-[var(--danger)]">{error}</p>;
  }

  if (!breakdown) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <LoadingIcon className="h-3 w-3 animate-spin" />
        Carregando situações...
      </div>
    );
  }

  if (breakdown.length === 0) {
    return <p className="text-xs text-[var(--muted)]">Sem linhas registradas.</p>;
  }

  return (
    <ul className="space-y-1 text-xs">
      {breakdown.map((row) => (
        <li
          key={row.situacao}
          className="flex items-center justify-between gap-3"
        >
          <span className="text-[var(--text-soft)]">{row.situacao}</span>
          <span className="font-mono text-[var(--muted)]">
            {formatInteger(row.total)}
            {row.valid > 0 && row.valid !== row.total
              ? ` (${formatInteger(row.valid)} válidas)`
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CreditHistoryItem({
  deletingCreditImportId,
  item,
  onDelete,
  onReimport,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <div className="col-span-2 min-w-0 md:col-span-1">
          <p className="text-sm text-[var(--muted)]">Arquivo</p>
          <p className="break-all font-medium" title={item.fileName}>
            {item.fileName}
          </p>
          <StatusBadge className="mt-2" status={item.status} />
        </div>
        <div>
          <p className="text-sm text-[var(--muted)]">Mês de referência</p>
          <p className="font-medium">
            {item.referenceMonth ? formatMonthYear(item.referenceMonth) : "—"}
          </p>
        </div>
        <div>
          <p className="text-sm text-[var(--muted)]">Importado em</p>
          <p className="font-medium">{item.importedAt}</p>
        </div>
        <div>
          <p className="text-sm text-[var(--muted)]">Total de linhas</p>
          <p className="font-medium">{formatInteger(item.totalRows)}</p>
        </div>
        <div className="col-span-2 flex items-end justify-between gap-3 md:contents">
          <div>
            <p className="text-sm text-[var(--muted)]">Créditos calculados</p>
            <p className="font-medium">{formatInteger(item.validRows)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onReimport ? (
              <Button variant="subtle" onClick={() => onReimport(item)}>
                Reimportar planilha
              </Button>
            ) : null}
            <Button
              variant="danger"
              onClick={() => onDelete(item)}
              disabled={deletingCreditImportId === item.id}
              leftIcon={<TrashIcon className="h-4 w-4" />}
            >
              {deletingCreditImportId === item.id ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </div>

      <details
        open
        className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)]"
      >
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text-soft)]">
          Conciliação com doações
        </summary>
        <div className="border-t border-[var(--line)] px-3 py-2">
          <MatchStats creditImportId={item.id} />
        </div>
      </details>

      <details className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text-soft)]">
          Por que não casou? (comparar chaves)
        </summary>
        <div className="border-t border-[var(--line)] px-3 py-2">
          <MatchDiagnostic creditImportId={item.id} />
        </div>
      </details>

      <details className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text-soft)]">
          Detalhamento por situação
        </summary>
        <div className="border-t border-[var(--line)] px-3 py-2">
          <SituacaoBreakdown creditImportId={item.id} />
        </div>
      </details>
    </div>
  );
}
