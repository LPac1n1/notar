import { formatMonthYear } from "../../../utils/date.js";
import { formatInteger } from "../../../utils/format.js";

function getAbatementStatusLabel(status) {
  return status === "applied" ? "realizado" : "pendente";
}

function getAbatementOperationLabel(operation, monthLimit = "") {
  if (operation === "all") {
    return "Realizar todos";
  }

  if (operation === "through") {
    return monthLimit
      ? `Realizar até ${formatMonthYear(monthLimit)}`
      : "Realizar até";
  }

  if (operation === "selected") {
    return "Realizar selecionados";
  }

  if (operation === "undo") {
    return "Desfazer";
  }

  return "Alteração manual";
}

export function buildAbatementHistoryEntry({
  actionType = "monthly_abatement_status_update",
  donor,
  monthLimit = "",
  months,
  operation = "manual",
  status,
}) {
  const normalizedMonths = months.map((month) => ({
    id: month.id,
    referenceMonth: month.referenceMonth,
    previousStatus: month.abatementStatus,
    amount: Number(month.abatementAmount ?? 0),
  }));
  const totalAmount = normalizedMonths.reduce(
    (total, month) => total + month.amount,
    0,
  );
  const statusLabel = getAbatementStatusLabel(status);
  const actionVerb = actionType.includes("undo")
    ? "restaurado(s) como"
    : "marcado(s) como";

  return {
    actionType,
    entityType: "monthly_abatement",
    entityId: donor.donorId,
    label: donor.donorName,
    description: `${formatInteger(normalizedMonths.length)} mês(es) de ${donor.donorName} ${actionVerb} ${statusLabel}.`,
    payload: {
      demand: donor.demand ?? "",
      donorId: donor.donorId,
      donorName: donor.donorName,
      donorType: donor.donorType,
      monthCount: normalizedMonths.length,
      monthLimit,
      months: normalizedMonths,
      operation,
      operationLabel: getAbatementOperationLabel(operation, monthLimit),
      status,
      totalAmount,
    },
  };
}
