import { useCallback, useMemo } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import MonthlyTrendChart from "./MonthlyTrendChart";
import { useDataResource } from "../../../hooks/useDataResource";
import { listMonthlyTrend } from "../../../services/dashboardService";

const EMPTY_FILTERS = {};

export default function DashboardTrendSection() {
  const loader = useCallback(() => listMonthlyTrend(), []);
  const filters = useMemo(() => EMPTY_FILTERS, []);
  const { data: months, isLoading } = useDataResource({
    loader,
    filters,
    errorMessage: "Não foi possível carregar a evolução mensal.",
    scope: "Dashboard.monthlyTrend",
  });

  return (
    <SectionCard
      title="Evolução mensal"
      description="Últimos 12 meses com planilha consolidada."
    >
      {isLoading ? <SkeletonRows rows={3} loadingLabel="Carregando evolução mensal" /> : null}

      {!isLoading && months?.length ? <MonthlyTrendChart months={months} /> : null}

      {!isLoading && !months?.length ? (
        <EmptyState
          title="Sem histórico para comparar"
          description="A evolução aparece depois que houver ao menos um mês consolidado."
        />
      ) : null}
    </SectionCard>
  );
}
