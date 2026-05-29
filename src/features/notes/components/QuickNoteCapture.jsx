import { useCallback, useEffect, useState } from "react";
import Button from "../../../components/ui/Button";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import TextInput from "../../../components/ui/TextInput";
import Textarea from "../../../components/ui/Textarea";
import { NotesIcon } from "../../../components/ui/icons";
import {
  EMPTY_NOTE_FORM,
  UNTITLED_NOTE_TITLE,
} from "../constants";
import { NOTE_COLOR_PALETTE } from "../../../utils/noteColor";
import { createNote } from "../../../services/noteService";
import { logError } from "../../../services/logger";
import { getErrorMessage } from "../../../utils/error";

/**
 * Modal compacto pra captura rápida de anotações de qualquer lugar do
 * sistema. Acessível pelo botão 📝+ no header e pelo atalho `n`. Apaga
 * o atrito de "abrir Anotações → clicar Novo → preencher → salvar →
 * voltar pro que eu estava fazendo".
 *
 * Diferenças intencionais vs `Notes.jsx` create modal:
 *   - Sem autosave em background (poucas linhas, captura única).
 *   - Sem rich text editor — Textarea simples. Foco é "anote agora".
 *   - Fecha automático ao salvar; toast confirma.
 *   - Title é opcional (cai pra "Sem título") — captura de pensamento
 *     não exige ritual.
 *
 * Mantém o create-flow simples; quem precisa de note rica usa
 * /anotacoes diretamente. As duas convivem.
 */
export default function QuickNoteCapture({ onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_NOTE_FORM });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Foco no campo de título no próximo frame (depois do Modal montar
    // e completar seu próprio focus trap setup). Pega o input via ID
    // estável — TextInput ainda não usa forwardRef.
    const id = window.requestAnimationFrame(() => {
      const input = document.getElementById("quick-note-title");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  const handleColorChange = useCallback((color) => {
    setForm((current) => ({ ...current, color }));
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const hasContent = form.content.trim() || form.title.trim();
    if (!hasContent) {
      setError("Escreva um título ou um conteúdo antes de salvar.");
      return;
    }
    try {
      setError("");
      setIsSaving(true);
      // Title vazio cai pra UNTITLED_NOTE_TITLE — alinhado com Notes.jsx.
      const finalTitle = form.title.trim() || UNTITLED_NOTE_TITLE;
      await createNote({
        title: finalTitle,
        content: form.content,
        color: form.color,
      });
      onSaved?.({ title: finalTitle });
      onClose?.();
    } catch (err) {
      logError("QuickNoteCapture.save", err);
      setError(getErrorMessage(err, "Não foi possível salvar a anotação."));
    } finally {
      setIsSaving(false);
    }
  }, [form, isSaving, onClose, onSaved]);

  // Ctrl/⌘+Enter pra salvar — atalho clássico de captura rápida.
  useEffect(() => {
    function handleKeyDown(event) {
      const isSubmit =
        (event.ctrlKey || event.metaKey) && event.key === "Enter";
      if (isSubmit) {
        event.preventDefault();
        handleSave();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  return (
    <Modal
      title="Anotação rápida"
      description="Capture o pensamento agora. Pra editar com rich text, use a página de Anotações."
      icon={<NotesIcon className="h-5 w-5" />}
      onClose={isSaving ? undefined : onClose}
      size="md"
    >
      <FeedbackMessage tone="error" message={error} persistent />

      <div className="space-y-4">
        <TextInput
          id="quick-note-title"
          label="Título"
          name="title"
          placeholder="Opcional — fica como 'Sem título'"
          value={form.title}
          onChange={handleChange}
          disabled={isSaving}
        />

        <Textarea
          label="Conteúdo"
          name="content"
          placeholder="Anote aqui"
          value={form.content}
          onChange={handleChange}
          rows={8}
          disabled={isSaving}
        />

        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--muted-strong)]">
            Cor
          </p>
          <div className="flex flex-wrap gap-2">
            {NOTE_COLOR_PALETTE.map((color) => {
              const isSelected = form.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Cor ${color}`}
                  aria-pressed={isSelected}
                  onClick={() => handleColorChange(color)}
                  disabled={isSaving}
                  className={`h-7 w-7 rounded-md border-2 transition-transform ${
                    isSelected
                      ? "scale-110 border-[var(--text-main)]"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <p className="text-xs text-[var(--muted)]">
          <kbd className="rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl + Enter
          </kbd>{" "}
          para salvar
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="subtle"
            onClick={onClose}
            disabled={isSaving}
            className="min-h-9 px-3 py-1.5 text-xs"
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            isLoading={isSaving}
            loadingLabel="Salvando..."
            className="min-h-9 px-3 py-1.5 text-xs"
          >
            Salvar anotação
          </Button>
        </div>
      </div>
    </Modal>
  );
}
