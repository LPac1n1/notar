import { formatCpf } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";
import { buildSelectOptions } from "../../../utils/select";

export const IMPORT_STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "processed", label: "Processadas", tone: "success" },
  { value: "pending", label: "Pendentes", tone: "warning" },
  { value: "error", label: "Com erro", tone: "danger" },
];

export const CPF_REGISTRATION_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "registered", label: "Somente vinculados", tone: "success" },
  { value: "unregistered", label: "Somente não vinculados", tone: "danger" },
];

export function getPreviewColumnOptions(previewData) {
  return buildSelectOptions(previewData?.columns ?? [], {
    emptyLabel: "Selecione a coluna de CPF",
  });
}

export function getImportHistoryOptions(availableImports) {
  return buildSelectOptions(availableImports, {
    getValue: (item) => item.id,
    getLabel: (item) => `${item.fileName} • ${formatMonthYear(item.referenceMonth)}`,
    emptyLabel: "Todos os arquivos",
  });
}

export function getCpfSummaryImportOptions(availableImports) {
  return buildSelectOptions(availableImports, {
    getValue: (item) => item.id,
    getLabel: (item) => `${formatMonthYear(item.referenceMonth)} • ${item.fileName}`,
    emptyLabel: "Todas as importações",
  });
}

export function getCpfOptions(cpfSummaryOptionSource) {
  return buildSelectOptions(cpfSummaryOptionSource, {
    getValue: (item) => item.cpf,
    getLabel: (item) => formatCpf(item.cpf),
    emptyLabel: "Todos os CPFs",
  });
}

export function getDonorOptions(cpfSummaryOptionSource) {
  return buildSelectOptions(
    cpfSummaryOptionSource.filter((item) => item.matchedDonorId),
    {
      getValue: (item) => item.matchedDonorId,
      getLabel: (item) => item.donorName,
      emptyLabel: "Todos os doadores",
    },
  );
}

export function getDemandOptions(cpfSummaryOptionSource) {
  return buildSelectOptions(cpfSummaryOptionSource, {
    getValue: (item) => item.demand,
    getLabel: (item) => item.demand,
    emptyLabel: "Todas as demandas",
  });
}
