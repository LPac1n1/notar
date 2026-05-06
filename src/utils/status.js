export const STATUS_CONFIG = {
  active: {
    label: "Ativo",
    tone: "success",
  },
  inactive: {
    label: "Inativo",
    tone: "neutral",
  },
  applied: {
    label: "Realizado",
    tone: "success",
  },
  pending: {
    label: "Pendente",
    tone: "warning",
  },
  processed: {
    label: "Processada",
    tone: "success",
  },
  processing: {
    label: "Processando",
    tone: "info",
  },
  error: {
    label: "Com erro",
    tone: "danger",
  },
  registered: {
    label: "Vinculado",
    tone: "success",
  },
  unregistered: {
    label: "Não vinculado",
    tone: "danger",
  },
  holder: {
    label: "Titular",
    tone: "info",
  },
  auxiliary: {
    label: "Auxiliar",
    tone: "info",
  },
};

export function getStatusConfig(status, fallbackLabel = "Status") {
  return STATUS_CONFIG[status] ?? {
    label: fallbackLabel,
    tone: "neutral",
  };
}
