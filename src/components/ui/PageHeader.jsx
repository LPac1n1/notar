import {
  DashboardIcon,
  DemandIcon,
  DonorIcon,
  ImportIcon,
  MonthlyIcon,
  SettingsIcon,
  SparkIcon,
} from "./icons";

const TITLE_ICONS = {
  Dashboard: DashboardIcon,
  Demandas: DemandIcon,
  Doadores: DonorIcon,
  "Gestão Mensal": MonthlyIcon,
  Importações: ImportIcon,
  Configurações: SettingsIcon,
};

export default function PageHeader({ title, subtitle, className = "" }) {
  const TitleIcon = TITLE_ICONS[title] ?? SparkIcon;

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[color:var(--surface-elevated)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-strong)] shadow-sm">
            <TitleIcon className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
            Área operacional
          </div>
          <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--text-main)] md:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
