export const DONOR_TYPE_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "holder", label: "Titulares", tone: "info" },
  { value: "auxiliary", label: "Auxiliares", tone: "default" },
];

export const DONATION_START_DATE_OPTIONS = [
  { value: "all", label: "Com ou sem data de início" },
  { value: "with-date", label: "Com data de início", tone: "success" },
  { value: "without-date", label: "Sem data de início", tone: "warning" },
];

export const ACTIVE_STATUS_OPTIONS = [
  { value: "active", label: "Apenas ativos", tone: "success" },
  { value: "inactive", label: "Apenas inativos", tone: "neutral" },
  { value: "all", label: "Todos", tone: "default" },
];
