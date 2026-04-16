import {
  DashboardIcon,
  DemandIcon,
  DonorIcon,
  ImportIcon,
  MonthlyIcon,
  SettingsIcon,
} from "../ui/icons";

export const NAV_ITEMS = [
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
    to: "/mensal",
    label: "Gestão Mensal",
    description: "Apuração, abatimentos e pendências",
    icon: MonthlyIcon,
  },
  {
    to: "/importacoes",
    label: "Importações",
    description: "Planilhas, conciliação e histórico",
    icon: ImportIcon,
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    description: "Arquivo de dados, backup e restauração",
    icon: SettingsIcon,
  },
];

export function getNavigationItem(pathname) {
  if (pathname === "/") {
    return NAV_ITEMS[0];
  }

  return NAV_ITEMS.find((item) => item.to !== "/" && pathname.startsWith(item.to)) ?? NAV_ITEMS[0];
}

