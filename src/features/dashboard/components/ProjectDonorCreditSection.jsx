import { useCallback, useMemo, useState } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import SectionCard from "../../../components/ui/SectionCard";
import SelectInput from "../../../components/ui/SelectInput";
import CopyableCpf from "../../donors/components/CopyableCpf";
import CopyableDonorName from "../../donors/components/CopyableDonorName";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { listProjectCreditByDonor } from "../../../services/projectCreditService";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

const EMPTY = [];

/**
 * Quem sustenta o projeto — no total ou num mês específico.
 *
 * Recurso próprio, e não parte do painel: trocar o mês aqui não pode
 * reprocessar as agregações do resto da tela.
 *
 * As opções de mês vêm da série que o painel já carregou (`months`), em vez de
 * uma consulta dedicada. Buscá-las aqui faria cada troca de mês refazer a
 * consulta que monta a própria lista de meses — o mesmo desperdício que já
 * apareceu nos filtros das listagens.
 */
export default function ProjectDonorCreditSection({ months = EMPTY }) {
  const [referenceMonth, setReferenceMonth] = useState("");

  const loader = useCallback(
    (currentFilters) =>
      listProjectCreditByDonor({
        referenceMonth: currentFilters?.referenceMonth ?? "",
      }),
    [],
  );
  const filters = useMemo(() => ({ referenceMonth }), [referenceMonth]);

  const { data, error, reload } = useDataResource({
    loader,
    filters,
    errorMessage: "Não foi possível carregar o crédito por doador.",
    scope: "ProjectDonorCreditSection",
    initialData: EMPTY,
  });

  useDatabaseChangeEffect(reload, {
    domains: ["projects", "donors", "credits", "imports"],
  });

  const monthOptions = useMemo(
    () => [
      { value: "", label: "Todos os meses" },
      // Do mais recente para o mais antigo: é o recorte que se procura antes.
      ...[...months]
        .reverse()
        .map((month) => ({
          value: month.referenceMonth,
          label: formatMonthYear(month.referenceMonth),
        })),
    ],
    [months],
  );

  const donors = data ?? EMPTY;
  const isSingleMonth = Boolean(referenceMonth);

  return (
    <SectionCard
      title="Crédito por doador"
      description={
        isSingleMonth
          ? `Quanto cada doador gerou em ${formatMonthYear(referenceMonth)}.`
          : "Quanto cada doador deste projeto já gerou, somando todos os meses."
      }
    >
      <FeedbackMessage message={error} tone="error" />

      {months.length > 0 ? (
        <div className="mb-4 max-w-xs">
          <SelectInput
            label="Mês"
            name="referenceMonth"
            value={referenceMonth}
            onChange={(event) => setReferenceMonth(event.target.value)}
            options={monthOptions}
            placeholder="Todos os meses"
          />
        </div>
      ) : null}

      {donors.length ? (
        <div className="space-y-3">
          {donors.map((donor, index) => (
            <div
              key={donor.donorId}
              className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[auto_1fr_auto]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-sm font-semibold text-[var(--text-soft)]">
                {index + 1}
              </div>
              <div className="min-w-0">
                <CopyableDonorName className="font-medium" name={donor.donorName} />
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableCpf value={donor.cpf} />
                  {/* Com um mês fixo a contagem seria sempre 1 — dizer "1
                      mês(es) com doação" não informa nada. */}
                  {isSingleMonth ? null : (
                    <span>• {formatInteger(donor.monthCount)} mês(es) com doação</span>
                  )}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm text-[var(--muted)]">Crédito</p>
                <p className="font-semibold whitespace-nowrap text-[var(--text-main)]">
                  {formatCurrency(donor.totalCredit)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            isSingleMonth
              ? "Nenhum crédito neste mês"
              : "Nenhum crédito conciliado"
          }
          description={
            isSingleMonth
              ? "Nenhum doador deste projeto teve nota conciliada no mês selecionado."
              : "Assim que uma planilha do mês for importada e conciliada, o crédito de cada doador aparece aqui."
          }
        />
      )}
    </SectionCard>
  );
}
