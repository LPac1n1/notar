import { buildSelectOptions } from "../../../utils/select";

export function getPreviewColumnOptions(previewData) {
  return buildSelectOptions(previewData?.columns ?? [], {
    emptyLabel: "Selecione a coluna de CPF",
  });
}
