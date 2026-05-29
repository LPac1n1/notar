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

// Workspace = trabalho diário. Dashboard puxa o usuário pra ação, Mensal
// e Importações são as duas oficinas onde o operador gasta a maior
// parte do tempo. Anotações fica aqui porque é captura de contexto,
// não configuração.
export const WORKSPACE_NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    end: true,
    description: "Visão geral, alertas e indicadores",
    icon: DashboardIcon,
  },
  {
    to: "/mensal",
    label: "Gestão Mensal",
    description: "Apuração, abatimentos e pendências",
    icon: MonthlyIcon,
  },
  {
    to: "/importacoes",
    label: "Importações",
    description: "Planilhas de doações e créditos, conciliação e busca de CPFs",
    icon: ImportIcon,
  },
  {
    to: "/anotacoes",
    label: "Anotações",
    description: "Registros internos rápidos",
    icon: NotesIcon,
  },
];

// Cadastros = entidades configuradas raramente. Separadas visualmente
// pra reforçar "isso é setup, não rotina diária".
export const REGISTRY_NAV_ITEMS = [
  {
    to: "/doadores",
    label: "Doadores",
    description: "Cadastros, CPFs e início das doações",
    icon: DonorIcon,
  },
  {
    to: "/pessoas",
    label: "Pessoas",
    description: "Referências, vínculos e papéis no sistema",
    icon: UserIcon,
  },
  {
    to: "/demandas",
    label: "Demandas",
    description: "Grupos atendidos e vínculos principais",
    icon: DemandIcon,
  },
];

// Back-compat barrel — Settings (shortcuts) e CommandPalette consomem
// a lista plana. Ordem preserva a hierarquia: workspace primeiro.
export const MAIN_NAV_ITEMS = [
  ...WORKSPACE_NAV_ITEMS,
  ...REGISTRY_NAV_ITEMS,
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

// Kept for backwards-compatibility with getNavigationItem
export const NAV_ITEMS = [...MAIN_NAV_ITEMS, ...FOOTER_NAV_ITEMS];

export function getNavigationItem(pathname) {
  if (pathname === "/") {
    return NAV_ITEMS[0];
  }

  return NAV_ITEMS.find((item) => item.to !== "/" && pathname.startsWith(item.to)) ?? NAV_ITEMS[0];
}
