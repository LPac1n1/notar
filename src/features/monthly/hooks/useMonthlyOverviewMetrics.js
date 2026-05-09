import { useMemo } from "react";
import {
  DonorIcon,
  MonthlyIcon,
  WarningIcon,
} from "../../../components/ui/icons";
import { formatCurrency, formatInteger } from "../../../utils/format";

export function useMonthlyOverviewMetrics({
  donatedCount = 0,
  hasSelectedReferenceMonth = false,
  notDonatedCount = 0,
  summariesCount = 0,
  totalAbatement = 0,
  totalAppliedAbatement = 0,
  totalPendingAbatement = 0,
  visibleRange = {
    endItem: 0,
    startItem: 0,
  },
} = {}) {
  return useMemo(() => {
    const metrics = [
      {
        icon: DonorIcon,
        label: hasSelectedReferenceMonth
          ? "Doadores filtrados"
          : "Registros filtrados",
        value: formatInteger(summariesCount),
        helper:
          summariesCount > 0
            ? `Mostrando ${formatInteger(visibleRange.startItem)}-${formatInteger(visibleRange.endItem)} nesta página`
            : "Nenhum item com os filtros atuais.",
      },
      {
        icon: MonthlyIcon,
        label: hasSelectedReferenceMonth ? "Total filtrado" : "Total pendente",
        value: formatCurrency(
          hasSelectedReferenceMonth ? totalAbatement : totalPendingAbatement,
        ),
        helper: hasSelectedReferenceMonth
          ? "Somatório dos abatimentos exibidos abaixo."
          : `Pendente: ${formatCurrency(totalPendingAbatement)} • Abatido: ${formatCurrency(totalAppliedAbatement)}`,
      },
    ];

    if (hasSelectedReferenceMonth) {
      metrics.splice(
        1,
        0,
        {
          icon: MonthlyIcon,
          label: "Doaram no mês",
          value: formatInteger(donatedCount),
          helper: "Doadores com notas conciliadas no período.",
          tone: "success",
        },
        {
          icon: WarningIcon,
          label: "Não doaram no mês",
          value: formatInteger(notDonatedCount),
          helper: "Continuam visíveis para acompanhamento.",
          tone: "warning",
        },
      );
    }

    return metrics;
  }, [
    donatedCount,
    hasSelectedReferenceMonth,
    notDonatedCount,
    summariesCount,
    totalAbatement,
    totalAppliedAbatement,
    totalPendingAbatement,
    visibleRange.endItem,
    visibleRange.startItem,
  ]);
}
