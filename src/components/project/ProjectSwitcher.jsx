import { useNavigate } from "react-router-dom";
import { ChevronDownIcon } from "../ui/icons";
import { useNavigationProject, useProjects } from "../../hooks/useProject";

/**
 * Topo da barra lateral: qual projeto está aberto e como sair dele.
 *
 * Fica acima da navegação porque é a posição que comunica "tudo abaixo daqui
 * pertence a isto". Fora de um projeto (Importações, Configurações) mostra a
 * marca, deixando claro que aquela tela não pertence a projeto nenhum.
 */
export default function ProjectSwitcher() {
  const navigate = useNavigate();
  const navProject = useNavigationProject();
  const { projects } = useProjects();

  if (!navProject) {
    return (
      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3 text-left transition-colors hover:border-[var(--line-strong)] lg:justify-start"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[var(--accent)] text-[#12151c]">
          <span className="font-display text-2xl font-semibold">N</span>
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="font-display text-2xl font-bold text-[var(--text-main)]">
            Notar
          </p>
          <p className="truncate text-xs text-[var(--muted)]">
            Escolher projeto
          </p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      title={
        projects.length > 1
          ? "Trocar de projeto"
          : "Ver todos os projetos"
      }
      className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3 text-left transition-colors hover:border-[var(--accent)] lg:justify-start"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-[#12151c]"
        style={{ background: navProject.color || "var(--accent)" }}
      >
        <span className="font-display text-xl font-semibold">
          {navProject.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="hidden min-w-0 flex-1 lg:block">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Projeto
        </p>
        <p className="truncate font-semibold text-[var(--text-main)]">
          {navProject.name}
        </p>
      </div>
      <ChevronDownIcon className="hidden h-4 w-4 shrink-0 text-[var(--muted)] lg:block" />
    </button>
  );
}
