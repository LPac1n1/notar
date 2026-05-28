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

export const MAIN_NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    end: true,
    description: "Visão geral, alertas e indicadores",
    icon: DashboardIcon,
  },
  {
    to: "/demandas",
    label: "Demandas",
    description: "Grupos atendidos e vínculos principais",
    icon: DemandIcon,
  },
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
