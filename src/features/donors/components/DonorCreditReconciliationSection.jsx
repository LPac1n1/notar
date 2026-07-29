import { useEffect, useState } from "react";
import SectionCard from "../../../components/ui/SectionCard";
import { LoadingIcon, WarningIcon } from "../../../components/ui/icons";
import { getDonorReconciliationSummary } from "../../../services/reconciliation/creditReconciliationService";
import { logError } from "../../../services/logger";
import { formatCurrency, formatInteger } from "../../../utils/format";

// "incomplete" used to surface as a warning ("Crédito disponível"). The
// user established that surplus credit on the NFP side is normal — there
// is no expectation that every cent of credit be abated — so it now
// rolls into "ok". Only "exceeded" remains as an actionable warning.
const STATUS_META = {
  ok: {
    label: "Dentro do limite",
    tone: "success",
    description:
      "O abatimento marcado no sistema está dentro do crédito real gerado na NFP.",
  },
  exceeded: {
    label: "Abatimento excedido",
    tone: "danger",
    description:
      "O valor abatido no sistema é maior que o crédito real disponível na NFP.",
  },
  "no-credit": {
    label: "Sem crédito conciliado",
    tone: "neutral",
    description:
      "Nenhuma nota deste doador casou com a planilha de créditos. Importe a planilha do mês correspondente.",
  },
};

function statusClasses(tone) {
  switch (tone) {
    case "success":
      return "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]";
    case "danger":
      return "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]";
    case "warning":
      return "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]";
    default:
      return "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)]";
  }
}

function MetricTile({ label, value, hint, valueClass = "" }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 font-semibold text-[var(--text-main)] ${valueClass}`.trim()}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export default function DonorCreditReconciliationSection({ donorId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!donorId) return undefined;
    let cancelled = false;
    getDonorReconciliationSummary(donorId)
      .then((rows) => {
        if (!cancelled) setSummary(rows);
      })
      .catch((err) => {
        logError("DonorCreditReconciliation.load", err);
        if (!cancelled) {
          setError("Não foi possível carregar a conciliação de créditos.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [donorId]);

  if (error) {
    return (
      <SectionCard
        title="Conciliação de créditos"
        description="Comparação entre o valor abatido no sistema e o crédito real gerado na NFP."
        className="mb-6"
      >
        <p className="text-sm text-[var(--danger)]">{error}</p>
      </SectionCard>
    );
  }

  if (!summary) {
    return (
      <SectionCard
        title="Conciliação de créditos"
        description="Comparação entre o valor abatido no sistema e o crédito real gerado na NFP."
        className="mb-6"
      >
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <LoadingIcon className="h-4 w-4 animate-spin" />
          Carregando conciliação...
        </div>
      </SectionCard>
    );
  }

  const meta = STATUS_META[summary.status] ?? STATUS_META["no-credit"];
  // For surplus credit (status "ok" but difference negative) we still show
  // the number so the user can see the headroom, just without "crédito
  // restante" framing that implied actionability. The exceeded case keeps
  // the explicit "abatido a mais" call-out.
  const differenceLabel =
    summary.difference > 0
      ? `+${formatCurrency(summary.difference)} abatido a mais`
      : summary.difference < 0
      ? formatCurrency(summary.difference)
      : formatCurrency(0);

  return (
    <SectionCard
      title="Conciliação de créditos"
      description="Comparação entre o valor abatido no sistema e o crédito real gerado na NFP."
      className="mb-6"
    >
      <div
        className={`mb-4 flex items-start gap-3 rounded-md border p-3 ${statusClasses(meta.tone)}`}
      >
        {meta.tone === "danger" || meta.tone === "warning" ? (
          <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        ) : null}
        <div>
          <p className="font-semibold">{meta.label}</p>
          <p className="mt-1 text-sm">{meta.description}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile
          label="Crédito real gerado"
          value={formatCurrency(summary.totalCredit)}
          hint={`${formatInteger(summary.matchedNoteCount)} nota(s) casada(s) com a planilha de créditos`}
        />
        <MetricTile
          label="Total abatido"
          value={formatCurrency(summary.totalAbated)}
          hint="Apenas abatimentos marcados como realizados"
        />
        <MetricTile
          label="Diferença"
          value={differenceLabel}
          valueClass={
            summary.status === "exceeded" ? "text-[var(--danger)]" : ""
          }
        />
        <MetricTile
          label="Notas sem crédito"
          value={formatInteger(summary.orphanDonationNoteCount)}
          hint="Notas válidas deste doador que não bateram com nenhum crédito"
        />
      </div>
    </SectionCard>
  );
}
