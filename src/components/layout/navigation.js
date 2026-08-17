import {
  DashboardIcon,
  DemandIcon,
  DonorIcon,
  HistoryIcon,
  ImportIcon,
  MonthlyIcon,
  NotesIcon,
  SettingsIcon,
  TrashIcon,
  UserIcon,
} from "../ui/icons";

/**
 * A navegação tem três blocos, e o rótulo de cada um é que torna o
 * compartilhamento honesto:
 *
 *   PROJETO     — estes dados são deste projeto.
 *   PLATAFORMA  — vale para TODOS os projetos. Uma planilha só.
 *   CONTA       — nem projeto, nem dado.
 *
 * Sem o bloco "Plataforma" explícito, Importações pareceria pertencer ao
 * projeto aberto, e o usuário concluiria que precisa importar uma planilha
 * por projeto — exatamente o erro que o modelo de atribuição evita.
 */

// Itens do projeto. `path` é relativo: o prefixo `/p/:slug` é montado em
// tempo de render, então nenhum item precisa conhecer o formato da rota.
// `module` liga o item à chave em `projects.modules`; sem `module`, o item
// está sempre presente.
export const PROJECT_NAV_ITEMS = [
  {
    path: "",
    label: "Dashboard",
    end: true,
    description: "Visão geral, alertas e indicadores",
    icon: DashboardIcon,
  },
  {
    path: "doadores",
    label: "Doadores",
    description: "Cadastros, CPFs e início das doações",
    icon: DonorIcon,
  },
  {
    path: "mensal",
    label: "Gestão Mensal",
    module: "monthly",
    description: "Apuração, abatimentos e pendências",
    icon: MonthlyIcon,
  },
  {
    path: "pessoas",
    label: "Pessoas",
    module: "people",
    description: "Referências, vínculos e papéis no sistema",
    icon: UserIcon,
  },
  {
    path: "demandas",
    label: "Demandas",
    module: "demands",
    description: "Grupos atendidos e vínculos principais",
    icon: DemandIcon,
  },
  {
    path: "anotacoes",
    label: "Anotações",
    module: "notes",
    description: "Registros internos rápidos",
    icon: NotesIcon,
  },
];

// Base compartilhada — fora de qualquer projeto.
export const PLATFORM_NAV_ITEMS = [
  {
    to: "/importacoes",
    label: "Importações",
    description: "Planilha única de doações e créditos, para todos os projetos",
    icon: ImportIcon,
  },
];

export const AUDIT_NAV_ITEMS = [
  {
    to: "/lixeira",
    label: "Lixeira",
    description: "Itens removidos e restauração",
    icon: TrashIcon,
  },
  {
    to: "/historico",
    label: "Histórico",
    description: "Auditoria e ações recentes",
    icon: HistoryIcon,
  },
];

export const CONFIG_NAV_ITEMS = [
  {
    to: "/configuracoes",
    label: "Configurações",
    description: "Sincronização, backup e conta",
    icon: SettingsIcon,
  },
];

export const FOOTER_NAV_ITEMS = [...AUDIT_NAV_ITEMS, ...CONFIG_NAV_ITEMS];

/** Só os itens cujo módulo está ligado no projeto. */
export function resolveProjectNavItems(project) {
  const modules = project?.modules ?? {};

  return PROJECT_NAV_ITEMS.filter(
    (item) => !item.module || modules[item.module],
  );
}
