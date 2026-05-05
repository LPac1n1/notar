export const ACTION_HISTORY_ENTITY_OPTIONS = [
  { value: "", label: "Todas as áreas" },
  { value: "demand", label: "Demandas" },
  { value: "donor", label: "Doadores" },
  { value: "person", label: "Pessoas" },
  { value: "import", label: "Importações" },
  { value: "monthly_abatement", label: "Abatimentos" },
  { value: "note", label: "Anotações" },
  { value: "trash", label: "Lixeira" },
  { value: "settings", label: "Configurações" },
  { value: "export", label: "Exportações" },
];

export const ACTION_HISTORY_TYPE_OPTIONS = [
  { value: "", label: "Todas as ações" },
  { value: "create", label: "Criação" },
  { value: "update", label: "Edição" },
  { value: "delete", label: "Remoção" },
  { value: "restore", label: "Restauração" },
  { value: "permanent_delete", label: "Exclusão definitiva" },
  { value: "import", label: "Importação" },
  { value: "export", label: "Exportação" },
  { value: "monthly_abatement_status_update", label: "Abatimento atualizado" },
  { value: "monthly_abatement_status_undo", label: "Abatimento desfeito" },
  { value: "storage", label: "Arquivo de dados" },
  { value: "backup", label: "Backup" },
];

export const ACTION_HISTORY_ENTITY_LABELS = {
  demand: "Demandas",
  donor: "Doadores",
  person: "Pessoas",
  import: "Importações",
  monthly_abatement: "Abatimentos",
  note: "Anotações",
  trash: "Lixeira",
  settings: "Configurações",
  export: "Exportações",
};

export const ACTION_HISTORY_TYPE_LABELS = {
  backup: "Backup",
  create: "Criação",
  delete: "Remoção",
  export: "Exportação",
  import: "Importação",
  monthly_abatement_status_undo: "Abatimento desfeito",
  monthly_abatement_status_update: "Abatimento atualizado",
  permanent_delete: "Exclusão definitiva",
  restore: "Restauração",
  storage: "Arquivo de dados",
  update: "Edição",
};
