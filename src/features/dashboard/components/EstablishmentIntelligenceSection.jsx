import { useCallback, useMemo, useState } from "react";
import DataTable from "../../../components/ui/DataTable";
import EmptyState from "../../../components/ui/EmptyState";
import Eyebrow from "../../../components/ui/Eyebrow";
import SectionCard from "../../../components/ui/SectionCard";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import MonthlyTrendChart from "./MonthlyTrendChart";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import {
  getEstablishmentIntelligence,
  listEstablishmentMonths,
} from "../../../services/establishment/establishmentService";
import { formatCurrency, formatInteger } from "../../../utils/format";

/**
 * Onde as doações rendem mais.
 *
 * A pergunta que o sistema não respondia: das redes em que os doadores
 * compram, quais devolvem mais crédito. Sem isso, uma campanha só podia
 * sugerir "compre e doe a nota", sem dizer onde compensa mais.
 *
 * Ordenado por CRÉDITO, e não por número de compras — a rede mais frequentada
 * pode ser a que menos rende, e é exatamente essa diferença que interessa.
 *
 * O gráfico mensal só aparece para o estabelecimento escolhido: doze séries
 * sobrepostas seriam ilegíveis, e a comparação entre redes já está na tabela.
 */

const COLUMNS = [
  { label: "Estabelecimento" },
  { label: "Crédito", align: "right" },
  { label: "Participação", align: "right" },
  { label: "Compras", align: "right" },
  { label: "Doadores", align: "right" },
  { label: "Compra média", align: "right" },
  { label: "Crédito médio", align: "right" },
];

const EMPTY = { ranking: [], totals: {} };

function formatShare(share) {
  return `${(share * 100).toFixed(1).replace(".", ",")}%`;
}

export default function EstablishmentIntelligenceSection({ projectId = "" }) {
  const [selectedCnpj, setSelectedCnpj] = useState("");

  const filters = useMemo(() => ({ projectId }), [projectId]);

  const loadRanking = useCallback(
    ({ projectId: id }) => getEstablishmentIntelligence({ projectId: id }),
    [],
  );

  const { data, isLoading, reload } = useDataResource({
    loader: loadRanking,
    filters,
    initialData: EMPTY,
    errorMessage: "Não foi possível carregar o ranking de estabelecimentos.",
    scope: "EstablishmentIntelligence",
  });

  const monthFilters = useMemo(
    () => ({ projectId, cnpj: selectedCnpj }),
    [projectId, selectedCnpj],
  );

  const loadMonths = useCallback(
    ({ projectId: id, cnpj }) =>
      cnpj ? listEstablishmentMonths(cnpj, { projectId: id }) : [],
    [],
  );

  const { data: months, reload: reloadMonths } = useDataResource({
    loader: loadMonths,
    filters: monthFilters,
    errorMessage: "Não foi possível carregar a evolução do estabelecimento.",
    scope: "EstablishmentMonths",
  });

  const reloadAll = useCallback(() => {
    reload();
    reloadMonths();
  }, [reload, reloadMonths]);

  useDatabaseChangeEffect(reloadAll, {
    domains: ["imports", "credits", "donors", "projects"],
  });

  const ranking = data?.ranking ?? [];
  const totals = data?.totals ?? {};

  // O gráfico compartilhado fala em `totalNotes`; aqui a grandeza é "compras".
  const chartMonths = useMemo(
    () =>
      (months ?? []).map((month) => ({
        referenceMonth: month.referenceMonth,
        totalCredit: month.totalCredit,
        totalNotes: month.purchases,
      })),
    [months],
  );

  const selected = ranking.find((item) => item.cnpj === selectedCnpj) ?? null;

  return (
    <SectionCard
      title="Onde as doações rendem mais"
      description="Estabelecimentos ordenados pelo crédito que geraram. A rede mais frequentada nem sempre é a que mais rende."
    >
      {isLoading && ranking.length === 0 ? (
        <SkeletonRows rows={4} loadingLabel="Calculando o ranking de estabelecimentos..." />
      ) : ranking.length === 0 ? (
        <EmptyState
          title="Nenhuma compra conciliada ainda"
          description="O ranking aparece quando houver planilha de doações e de créditos do mesmo período."
        />
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-[var(--muted)]">
            {formatInteger(totals.establishments)} estabelecimento(s),{" "}
            {formatInteger(totals.purchases)} compra(s) e{" "}
            {formatCurrency(totals.totalCredit)} em crédito.
          </p>

          <DataTable
            caption="Estabelecimentos ordenados pelo crédito gerado, do maior para o menor."
            columns={COLUMNS}
          >
            {ranking.map((item) => {
              const isSelected = item.cnpj === selectedCnpj;

              return (
                <tr
                  key={item.cnpj}
                  className={isSelected ? "bg-[var(--accent-selected)]" : ""}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {/* O nome abre a evolução daquele estabelecimento. É um
                        botão, e não a linha inteira: uma linha clicável não
                        anuncia que é clicável para quem usa teclado. */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCnpj(isSelected ? "" : item.cnpj)
                      }
                      aria-pressed={isSelected}
                      className="text-left text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {item.name}
                    </button>
                  </th>
                  <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                    {formatCurrency(item.totalCredit)}
                  </td>
                  <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                    {formatShare(item.share)}
                  </td>
                  <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                    {formatInteger(item.purchases)}
                  </td>
                  <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                    {formatInteger(item.donors)}
                  </td>
                  <td className="numeric px-3 py-2 text-right text-[var(--muted)]">
                    {formatCurrency(item.averagePurchase ?? 0)}
                  </td>
                  <td className="numeric px-3 py-2 text-right text-[var(--muted)]">
                    {item.averageCredit === null
                      ? "—"
                      : formatCurrency(item.averageCredit)}
                  </td>
                </tr>
              );
            })}
          </DataTable>

          {selected && chartMonths.length > 0 ? (
            <div>
              <Eyebrow className="mb-3">
                Crédito por mês — {selected.name}
              </Eyebrow>
              <MonthlyTrendChart months={chartMonths} metricKey="totalCredit" />
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Escolha um estabelecimento acima para ver a evolução dele mês a mês.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
