import { useCallback, useMemo, useState } from "react";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import Button from "../components/ui/Button";
import { SkeletonRows } from "../components/ui/Skeleton";
import MetricCard from "../components/ui/MetricCard";
import {
  listRaffleNumbers,
  listRafflePeriods,
} from "../services/raffle/raffleNumbersService";
import { exportRaffleNumbersCsv } from "../services/exportService";
import { useDataResource } from "../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { usePagination } from "../hooks/usePagination";
import PaginationControls from "../components/ui/PaginationControls";
import { logError } from "../services/logger";
import { formatDatePtBR, formatMonthYear } from "../utils/date";
import { formatInteger } from "../utils/format";

/**
 * Números da sorte.
 *
 * Cada nota doada no período vale um número, atribuído na ordem em que a
 * compra foi feita. A lista existe para ser mostrada em público durante um
 * sorteio, e é isso que decide o que ela NÃO traz: valor da nota e crédito
 * gerado não aparecem porque não são consultados — quem participa não precisa
 * saber quanto o vizinho gastou para conferir o próprio número.
 *
 * Nome e CPF chegam aqui já mascarados pelo serviço. Fazer a máscara na borda
 * de saída, e não nesta tela, é o que garante que o CSV saia igualmente
 * protegido sem depender de alguém lembrar de aplicá-la de novo.
 */

const COLUNAS = [
  { label: "Número", align: "right" },
  { label: "Nome" },
  { label: "CPF" },
  { label: "Data da nota" },
];

const ESCOPOS = [
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
];

export default function Raffle() {
  const [scope, setScope] = useState("month");
  const [period, setPeriod] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const periodsLoader = useCallback(() => listRafflePeriods(), []);
  const emptyFilters = useMemo(() => ({}), []);
  const {
    data: periods,
    reload: reloadPeriods,
  } = useDataResource({
    loader: periodsLoader,
    filters: emptyFilters,
    errorMessage: "Não foi possível carregar os meses disponíveis.",
    scope: "RafflePeriods",
    initialData: [],
  });

  // Ancora no mês mais recente na primeira carga. Ajuste durante o render em
  // vez de efeito: em efeito a tabela chegaria a ser pintada vazia antes de o
  // período entrar, e a tela piscaria entre "sem notas" e a lista.
  const [hasAnchored, setHasAnchored] = useState(false);
  if (!hasAnchored && periods.length > 0) {
    setHasAnchored(true);
    setPeriod(periods[0]);
  }

  const numbersFilters = useMemo(() => ({ period, scope }), [period, scope]);
  const numbersLoader = useCallback(
    (filtros) =>
      filtros.period ? listRaffleNumbers(filtros) : Promise.resolve([]),
    [],
  );
  const {
    data: numbers,
    isLoading,
    error,
    setError,
    reload: reloadNumbers,
  } = useDataResource({
    loader: numbersLoader,
    filters: numbersFilters,
    errorMessage: "Não foi possível montar a lista de números.",
    scope: "RaffleNumbers",
    initialData: [],
  });

  useDatabaseChangeEffect(
    useCallback(() => {
      reloadPeriods();
      reloadNumbers();
    }, [reloadPeriods, reloadNumbers]),
    { domains: ["imports", "donors", "projects"] },
  );

  const pagination = usePagination(numbers, { initialPageSize: 25 });

  const periodOptions = useMemo(
    () =>
      periods.map((mes) => ({
        value: mes,
        label: formatMonthYear(mes),
      })),
    [periods],
  );

  // No recorte anual o seletor lista ANOS, não meses: oferecer doze entradas
  // que produzem exatamente a mesma lista seria só uma forma de errar.
  const yearOptions = useMemo(() => {
    const anos = [...new Set(periods.map((mes) => mes.slice(0, 4)))];
    return anos.map((ano) => ({ value: `${ano}-01-01`, label: ano }));
  }, [periods]);

  const opcoes = scope === "year" ? yearOptions : periodOptions;

  // Trocar de escopo pode deixar o período fora da lista de opções (um mês
  // não é um ano). Realinha durante o render, pela mesma razão da âncora.
  const [lastScope, setLastScope] = useState(scope);
  if (lastScope !== scope) {
    setLastScope(scope);
    const primeira = opcoes[0]?.value ?? "";
    const aindaVale = opcoes.some((opcao) => opcao.value === period);
    if (!aindaVale) setPeriod(primeira);
  }

  const handleExport = async () => {
    if (isExporting || !period) return;

    setError("");
    setExportMessage("");
    setIsExporting(true);

    try {
      const resultado = await exportRaffleNumbersCsv({ period, scope });
      setExportMessage(
        `${formatInteger(resultado.rowCount)} número(s) exportado(s).`,
      );
    } catch (err) {
      logError("RafflePage.export", err);
      setError("Não foi possível exportar a lista de números.");
    } finally {
      setIsExporting(false);
    }
  };

  const rotuloDoPeriodo =
    scope === "year" ? period.slice(0, 4) : formatMonthYear(period);

  return (
    <div>
      <PageHeader
        title="Números da sorte"
        subtitle="Cada nota doada vale um número, na ordem em que a compra foi feita."
        className="mb-6"
        actions={
          <Button
            variant="subtle"
            onClick={handleExport}
            disabled={!period || numbers.length === 0}
            isLoading={isExporting}
            loadingLabel="Exportando..."
          >
            Exportar lista
          </Button>
        }
      />

      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={exportMessage} tone="success" persistent={false} />

      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-1">
            <SelectInput
              label="Período"
              name="raffleScope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              options={ESCOPOS}
            />
          </div>
          <div className="md:col-span-1">
            <SelectInput
              label={scope === "year" ? "Ano" : "Mês"}
              name="rafflePeriod"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              options={opcoes}
              searchable
            />
          </div>
          <MetricCard
            label="Números gerados"
            value={formatInteger(numbers.length)}
            helper={
              period
                ? `Notas doadas em ${rotuloDoPeriodo}.`
                : "Escolha um período."
            }
          />
          <MetricCard
            label="Participantes"
            value={formatInteger(
              new Set(numbers.map((linha) => linha.cpf)).size,
            )}
            helper="Pessoas distintas com pelo menos um número."
          />
        </div>

        <SectionCard
          title={period ? `Números de ${rotuloDoPeriodo}` : "Números"}
          description="Nome e CPF aparecem parcialmente ocultos: a lista é feita para ser exibida durante o sorteio."
        >
          {isLoading ? (
            <SkeletonRows rows={6} loadingLabel="Montando a lista de números" />
          ) : numbers.length === 0 ? (
            <EmptyState
              title="Nenhum número neste período"
              description="Só entram notas válidas, com data, de CPFs cadastrados como doadores deste projeto."
            />
          ) : (
            <div className="space-y-4">
              <PaginationControls
                endItem={pagination.endItem}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.handlePageSizeChange}
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalItems={pagination.totalItems}
                totalPages={pagination.totalPages}
              />
              <DataTable
                caption={`Número da sorte de cada nota doada em ${rotuloDoPeriodo}.`}
                columns={COLUNAS}
              >
                {pagination.visibleItems.map((linha) => (
                  <tr key={`${linha.number}`}>
                    <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-strong)]">
                      {formatInteger(linha.number)}
                    </td>
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-[var(--text-main)]"
                    >
                      {linha.name}
                    </th>
                    <td className="px-3 py-2 text-[var(--text-soft)]">
                      {linha.cpf}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-soft)]">
                      {formatDatePtBR(linha.noteDate)}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
