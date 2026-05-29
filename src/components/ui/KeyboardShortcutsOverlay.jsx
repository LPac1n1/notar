import { useEffect } from "react";
import Modal from "./Modal";
import { KEYBOARD_SHORTCUTS } from "../../hooks/useKeyboardNavigation";
import { NAV_ITEMS } from "../layout/navigation";

const NAV_LABEL_BY_PATH = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.to, item.label]),
);

// Atalhos globais que NÃO são de navegação. Documentados aqui pra que o
// overlay sirva como referência única; cada item da lista corresponde a
// um handler real (Header, Modal, etc.) e a lista vive ao lado deles via
// nome do atalho.
const GLOBAL_SHORTCUTS = [
  {
    chord: ["a"],
    label: "Próximas ações (inbox)",
    where: "Em qualquer página",
  },
  {
    chord: ["n"],
    label: "Nova anotação rápida",
    where: "Em qualquer página",
  },
  {
    chord: ["Ctrl", "K"],
    label: "Busca global / comandos",
    where: "Em qualquer página",
  },
  {
    chord: ["Ctrl", "Enter"],
    label: "Salvar anotação rápida",
    where: "Modal de anotação rápida",
  },
  {
    chord: ["Esc"],
    label: "Fechar modal ou painel",
    where: "Em qualquer modal/drawer",
  },
  {
    chord: ["?"],
    label: "Este painel de atalhos",
    where: "Em qualquer página",
  },
];

function KbdChord({ keys }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center">
          <kbd className="rounded border border-[var(--line-strong)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--text-soft)]">
            {key}
          </kbd>
          {index < keys.length - 1 ? (
            <span className="px-0.5 text-[var(--muted)]">+</span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * Overlay com todos os atalhos disponíveis. Aberto por `?` global ou
 * via "Atalhos de teclado" em Settings. Substitui o "preciso descobrir
 * sozinho" pelo "vejo tudo de uma vez".
 *
 * Estrutura: navegação primeiro (chord `g` é a aposta principal), depois
 * comandos globais. Cada linha mostra a chord + ação + onde funciona.
 */
export default function KeyboardShortcutsOverlay({ onClose }) {
  // Suporte ao próprio `?` pra fechar — convenção. Esc já é tratado pelo
  // Modal, não precisa duplicar.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Modal
      title="Atalhos de teclado"
      description="Pressione ? a qualquer momento pra abrir ou fechar este painel."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-6">
        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Navegação · pressione{" "}
            <KbdChord keys={["g"]} /> seguido da letra
          </p>
          <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)] bg-[var(--surface-elevated)]">
            {KEYBOARD_SHORTCUTS.map(({ key, to }) => {
              const label = NAV_LABEL_BY_PATH[to] ?? to;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="text-[var(--text-main)]">{label}</span>
                  <KbdChord keys={["g", key]} />
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Comandos globais
          </p>
          <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)] bg-[var(--surface-elevated)]">
            {GLOBAL_SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.chord.join("+")}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-[var(--text-main)]">{shortcut.label}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {shortcut.where}
                  </p>
                </div>
                <KbdChord keys={shortcut.chord} />
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-[var(--muted)]">
          Atalhos não funcionam quando o foco está em campos de texto.
        </p>
      </div>
    </Modal>
  );
}
