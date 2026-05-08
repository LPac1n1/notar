import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import FormModal from "../components/ui/FormModal";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import TextInput from "../components/ui/TextInput";
import { PlusIcon } from "../components/ui/icons";
import NoteCard from "../features/notes/components/NoteCard";
import NoteColorPicker from "../features/notes/components/NoteColorPicker";
import RichNoteEditor from "../features/notes/components/RichNoteEditor";
import { isNoteContentEmpty } from "../features/notes/utils/noteContent";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataSyncFeedback } from "../hooks/useDataSyncFeedback";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "../services/noteService";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";
import { DEFAULT_NOTE_COLOR } from "../utils/noteColor";

const EMPTY_NOTE_FORM = {
  title: "",
  content: "",
  color: DEFAULT_NOTE_COLOR,
};
const AUTO_SAVE_DELAY_MS = 800;
const UNTITLED_NOTE_TITLE = "Sem título";
const AUTO_SAVE_STATUS_CONFIG = {
  idle: {
    dotClass: "bg-[var(--muted)]",
    label: "Salvamento automático ativo",
  },
  pending: {
    dotClass: "bg-amber-400",
    label: "Alterações pendentes",
  },
  saving: {
    dotClass: "bg-[var(--accent)]",
    label: "Salvando...",
  },
  saved: {
    dotClass: "bg-emerald-400",
    label: "Salvo automaticamente",
  },
  error: {
    dotClass: "bg-red-400",
    label: "Falha ao salvar automaticamente",
  },
};

function normalizeNoteDraft(form) {
  return {
    title: String(form.title ?? "").trim() || UNTITLED_NOTE_TITLE,
    content: String(form.content ?? "").trim(),
    color: form.color || DEFAULT_NOTE_COLOR,
  };
}

function getNoteFingerprint(form) {
  return JSON.stringify(normalizeNoteDraft(form));
}

function hasNoteDraftContent(form) {
  return (
    Boolean(String(form.title ?? "").trim()) ||
    !isNoteContentEmpty(form.content)
  );
}

function AutoSaveStatus({ status }) {
  const config = AUTO_SAVE_STATUS_CONFIG[status] ?? AUTO_SAVE_STATUS_CONFIG.idle;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 text-xs text-[var(--muted)]"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${config.dotClass} ${
          status === "saving" ? "animate-pulse" : ""
        }`}
      />
      <span className="truncate">{config.label}</span>
    </div>
  );
}

function NoteFormFields({ form, onChange, onContentChange }) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Título"
        name="title"
        placeholder="Título da anotação"
        value={form.title}
        onChange={onChange}
      />

      <RichNoteEditor
        value={form.content}
        onChange={onContentChange}
      />

      <NoteColorPicker value={form.color} onChange={onChange} />
    </div>
  );
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [createForm, setCreateForm] = useState({ ...EMPTY_NOTE_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_NOTE_FORM });
  const [editingNote, setEditingNote] = useState(null);
  const [notePendingRemoval, setNotePendingRemoval] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createAutoSaveStatus, setCreateAutoSaveStatus] = useState("idle");
  const [editAutoSaveStatus, setEditAutoSaveStatus] = useState("saved");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const notesRequestIdRef = useRef(0);
  const createAutoNoteIdRef = useRef("");
  const createAutoSaveTimerRef = useRef(null);
  const editAutoSaveTimerRef = useRef(null);
  const createSavePromiseRef = useRef(null);
  const editSavePromiseRef = useRef(null);
  const latestCreateFormRef = useRef({ ...EMPTY_NOTE_FORM });
  const latestEditFormRef = useRef({ ...EMPTY_NOTE_FORM });
  const editingNoteRef = useRef(null);
  const lastSavedCreateFingerprintRef = useRef("");
  const lastSavedEditFingerprintRef = useRef("");
  const originalEditFingerprintRef = useRef("");
  const isClosingCreateRef = useRef(false);
  const isClosingEditRef = useRef(false);
  const isMountedRef = useRef(true);
  const dataSyncFeedback = useDataSyncFeedback();
  const showDataRefreshLoading =
    dataSyncFeedback.isActive ||
    dataSyncFeedback.isVisible ||
    (dataSyncFeedback.isSettling && isRefreshing);

  const loadNotes = useCallback(async ({ showLoading = false } = {}) => {
    const requestId = notesRequestIdRef.current + 1;
    notesRequestIdRef.current = requestId;

    try {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError("");
      const noteRows = await listNotes();

      if (requestId !== notesRequestIdRef.current) {
        return;
      }

      setNotes(noteRows);
    } catch (err) {
      if (requestId !== notesRequestIdRef.current) {
        return;
      }

      setError(getErrorMessage(err, "Não foi possível carregar as anotações."));
    } finally {
      if (requestId === notesRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  const updateCreateAutoSaveStatus = useCallback((status) => {
    if (isMountedRef.current) {
      setCreateAutoSaveStatus(status);
    }
  }, []);

  const updateEditAutoSaveStatus = useCallback((status) => {
    if (isMountedRef.current) {
      setEditAutoSaveStatus(status);
    }
  }, []);

  const upsertSavedNote = useCallback((savedNote) => {
    if (!isMountedRef.current) {
      return;
    }

    setNotes((currentNotes) => {
      const existingNote = currentNotes.find((note) => note.id === savedNote.id);
      const nextNote = {
        ...(existingNote ?? {}),
        ...savedNote,
        createdAt: existingNote?.createdAt || savedNote.createdAt || "",
        updatedAt: savedNote.updatedAt || new Date().toISOString(),
      };
      const remainingNotes = currentNotes.filter((note) => note.id !== savedNote.id);

      return [nextNote, ...remainingNotes];
    });
  }, []);

  const saveCreateDraft = useCallback(async () => {
    const previousSave = createSavePromiseRef.current ?? Promise.resolve(true);
    const savePromise = previousSave
      .catch(() => true)
      .then(async () => {
        const form = latestCreateFormRef.current;

        if (!createAutoNoteIdRef.current && !hasNoteDraftContent(form)) {
          updateCreateAutoSaveStatus("idle");
          return true;
        }

        const draft = normalizeNoteDraft(form);
        const fingerprint = JSON.stringify(draft);

        if (fingerprint === lastSavedCreateFingerprintRef.current) {
          updateCreateAutoSaveStatus(
            createAutoNoteIdRef.current ? "saved" : "idle",
          );
          return true;
        }

        updateCreateAutoSaveStatus("saving");

        let noteId = createAutoNoteIdRef.current;

        if (noteId) {
          await updateNote(
            {
              id: noteId,
              ...draft,
            },
            { recordHistory: false },
          );
        } else {
          noteId = await createNote(draft, { recordHistory: true });
          createAutoNoteIdRef.current = noteId;
        }

        lastSavedCreateFingerprintRef.current = fingerprint;
        upsertSavedNote({
          id: noteId,
          ...draft,
        });
        if (isMountedRef.current) {
          setError("");
        }
        updateCreateAutoSaveStatus("saved");
        return true;
      });

    createSavePromiseRef.current = savePromise;

    try {
      return await savePromise;
    } catch (err) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err, "Não foi possível salvar a anotação."));
      }
      updateCreateAutoSaveStatus("error");
      return false;
    } finally {
      if (createSavePromiseRef.current === savePromise) {
        createSavePromiseRef.current = null;
      }
    }
  }, [updateCreateAutoSaveStatus, upsertSavedNote]);

  const saveEditDraft = useCallback(
    async ({ recordHistory = false } = {}) => {
      const previousSave = editSavePromiseRef.current ?? Promise.resolve(true);
      const savePromise = previousSave
        .catch(() => true)
        .then(async () => {
          const note = editingNoteRef.current;

          if (!note) {
            return true;
          }

          const form = latestEditFormRef.current;
          const draft = normalizeNoteDraft(form);
          const fingerprint = JSON.stringify(draft);

          if (
            fingerprint === lastSavedEditFingerprintRef.current &&
            !recordHistory
          ) {
            updateEditAutoSaveStatus("saved");
            return true;
          }

          updateEditAutoSaveStatus("saving");
          await updateNote(
            {
              id: note.id,
              ...draft,
            },
            { recordHistory },
          );
          lastSavedEditFingerprintRef.current = fingerprint;

          if (recordHistory) {
            originalEditFingerprintRef.current = fingerprint;
          }

          upsertSavedNote({
            id: note.id,
            ...draft,
          });
          if (isMountedRef.current) {
            setError("");
          }
          updateEditAutoSaveStatus("saved");
          return true;
        });

      editSavePromiseRef.current = savePromise;

      try {
        return await savePromise;
      } catch (err) {
        if (isMountedRef.current) {
          setError(getErrorMessage(err, "Não foi possível salvar a anotação."));
        }
        updateEditAutoSaveStatus("error");
        return false;
      } finally {
        if (editSavePromiseRef.current === savePromise) {
          editSavePromiseRef.current = null;
        }
      }
    },
    [updateEditAutoSaveStatus, upsertSavedNote],
  );

  useEffect(() => {
    loadNotes({ showLoading: true });
  }, [loadNotes]);

  useDatabaseChangeEffect(() => loadNotes());

  useEffect(() => {
    latestCreateFormRef.current = createForm;
  }, [createForm]);

  useEffect(() => {
    latestEditFormRef.current = editForm;
  }, [editForm]);

  useEffect(() => {
    editingNoteRef.current = editingNote;
  }, [editingNote]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return undefined;
    }

    if (createAutoSaveTimerRef.current) {
      window.clearTimeout(createAutoSaveTimerRef.current);
    }

    if (!createAutoNoteIdRef.current && !hasNoteDraftContent(createForm)) {
      updateCreateAutoSaveStatus("idle");
      return undefined;
    }

    const fingerprint = getNoteFingerprint(createForm);

    if (fingerprint === lastSavedCreateFingerprintRef.current) {
      updateCreateAutoSaveStatus(
        createAutoNoteIdRef.current ? "saved" : "idle",
      );
      return undefined;
    }

    updateCreateAutoSaveStatus("pending");
    createAutoSaveTimerRef.current = window.setTimeout(() => {
      void saveCreateDraft();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (createAutoSaveTimerRef.current) {
        window.clearTimeout(createAutoSaveTimerRef.current);
      }
    };
  }, [
    createForm,
    isCreateModalOpen,
    saveCreateDraft,
    updateCreateAutoSaveStatus,
  ]);

  useEffect(() => {
    if (!editingNote) {
      return undefined;
    }

    if (editAutoSaveTimerRef.current) {
      window.clearTimeout(editAutoSaveTimerRef.current);
    }

    const fingerprint = getNoteFingerprint(editForm);

    if (fingerprint === lastSavedEditFingerprintRef.current) {
      updateEditAutoSaveStatus("saved");
      return undefined;
    }

    updateEditAutoSaveStatus("pending");
    editAutoSaveTimerRef.current = window.setTimeout(() => {
      void saveEditDraft();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (editAutoSaveTimerRef.current) {
        window.clearTimeout(editAutoSaveTimerRef.current);
      }
    };
  }, [editForm, editingNote, saveEditDraft, updateEditAutoSaveStatus]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      if (createAutoSaveTimerRef.current) {
        window.clearTimeout(createAutoSaveTimerRef.current);
      }

      if (editAutoSaveTimerRef.current) {
        window.clearTimeout(editAutoSaveTimerRef.current);
      }

      void saveCreateDraft();

      const shouldRecordEditHistory =
        Boolean(editingNoteRef.current) &&
        getNoteFingerprint(latestEditFormRef.current) !==
          originalEditFingerprintRef.current;

      void saveEditDraft({ recordHistory: shouldRecordEditHistory });
      isMountedRef.current = false;
    };
  }, [saveCreateDraft, saveEditDraft]);

  const handleFormChange = (setter, latestFormRef) => (event) => {
    const { name, value } = event.target;
    setter((current) => {
      const nextForm = {
        ...current,
        [name]: value,
      };

      if (latestFormRef) {
        latestFormRef.current = nextForm;
      }

      return nextForm;
    });
  };

  const handleContentChange = (setter, latestFormRef) => (value) => {
    setter((current) => {
      const nextForm = {
        ...current,
        content: value,
      };

      if (latestFormRef) {
        latestFormRef.current = nextForm;
      }

      return nextForm;
    });
  };

  const handleOpenCreateModal = () => {
    const nextForm = { ...EMPTY_NOTE_FORM };

    setError("");
    setSuccessMessage("");
    setCreateForm(nextForm);
    latestCreateFormRef.current = nextForm;
    createAutoNoteIdRef.current = "";
    lastSavedCreateFingerprintRef.current = "";
    updateCreateAutoSaveStatus("idle");
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = async () => {
    if (isClosingCreateRef.current) {
      return;
    }

    isClosingCreateRef.current = true;

    if (createAutoSaveTimerRef.current) {
      window.clearTimeout(createAutoSaveTimerRef.current);
    }

    const wasSaved = await saveCreateDraft();

    if (!wasSaved) {
      isClosingCreateRef.current = false;
      return;
    }

    setIsCreateModalOpen(false);
    setCreateForm({ ...EMPTY_NOTE_FORM });
    latestCreateFormRef.current = { ...EMPTY_NOTE_FORM };
    createAutoNoteIdRef.current = "";
    lastSavedCreateFingerprintRef.current = "";
    updateCreateAutoSaveStatus("idle");
    isClosingCreateRef.current = false;
  };

  const handleOpenEditModal = (note) => {
    const nextForm = {
      title: note.title,
      content: note.content,
      color: note.color,
    };

    setError("");
    setSuccessMessage("");
    setEditingNote(note);
    setEditForm(nextForm);
    latestEditFormRef.current = nextForm;
    editingNoteRef.current = note;
    lastSavedEditFingerprintRef.current = getNoteFingerprint(nextForm);
    originalEditFingerprintRef.current = getNoteFingerprint(nextForm);
    updateEditAutoSaveStatus("saved");
  };

  const handleCloseEditModal = async () => {
    if (isClosingEditRef.current) {
      return;
    }

    isClosingEditRef.current = true;

    if (editAutoSaveTimerRef.current) {
      window.clearTimeout(editAutoSaveTimerRef.current);
    }

    const shouldRecordHistory =
      getNoteFingerprint(latestEditFormRef.current) !==
      originalEditFingerprintRef.current;
    const wasSaved = await saveEditDraft({ recordHistory: shouldRecordHistory });

    if (!wasSaved) {
      isClosingEditRef.current = false;
      return;
    }

    setEditingNote(null);
    setEditForm({ ...EMPTY_NOTE_FORM });
    latestEditFormRef.current = { ...EMPTY_NOTE_FORM };
    editingNoteRef.current = null;
    lastSavedEditFingerprintRef.current = "";
    originalEditFingerprintRef.current = "";
    updateEditAutoSaveStatus("saved");
    isClosingEditRef.current = false;
  };

  const handleConfirmRemove = async () => {
    if (!notePendingRemoval) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsDeleting(true);
      await deleteNote(notePendingRemoval.id);
      setNotePendingRemoval(null);
      setSuccessMessage("Anotação excluída com sucesso.");
      await loadNotes();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível excluir a anotação."));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && !notes.length && !error) {
    return (
      <div>
        <PageHeader
          title="Anotações"
          subtitle="Registros internos rápidos do sistema."
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando anotações"
          description="Buscando registros internos."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Anotações"
        subtitle={`${formatInteger(notes.length)} anotação(ões) cadastrada(s).`}
        className="mb-6"
      />

      <div className="mb-6">
        <Button
          onClick={handleOpenCreateModal}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Nova anotação
        </Button>
      </div>

      <FeedbackMessage
        message={isCreateModalOpen || editingNote || notePendingRemoval ? "" : error}
        tone="error"
      />
      <FeedbackMessage message={successMessage} tone="success" />

      {showDataRefreshLoading ? (
        <DataSyncSectionLoading
          message={dataSyncFeedback.label}
          rows={4}
        />
      ) : notes.length === 0 ? (
        <EmptyState
          title="Nenhuma anotação cadastrada"
          description="Crie uma anotação para registrar informações rápidas do dia a dia."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={handleOpenEditModal}
              onDelete={setNotePendingRemoval}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {isCreateModalOpen ? (
          <FormModal
            title="Nova anotação"
            description="Registre uma informação interna. As alterações são salvas automaticamente."
            cancelLabel="Fechar"
            feedbackMessage={error}
            footerContent={<AutoSaveStatus status={createAutoSaveStatus} />}
            onClose={handleCloseCreateModal}
            onSubmit={saveCreateDraft}
            showSubmit={false}
            size="xl"
          >
            <NoteFormFields
              form={createForm}
              onChange={handleFormChange(setCreateForm, latestCreateFormRef)}
              onContentChange={handleContentChange(
                setCreateForm,
                latestCreateFormRef,
              )}
            />
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingNote ? (
          <FormModal
            title="Editar anotação"
            description="Atualize título, conteúdo ou cor. As alterações são salvas automaticamente."
            cancelLabel="Fechar"
            feedbackMessage={error}
            footerContent={<AutoSaveStatus status={editAutoSaveStatus} />}
            onClose={handleCloseEditModal}
            onSubmit={saveEditDraft}
            showSubmit={false}
            size="xl"
          >
            <NoteFormFields
              form={editForm}
              onChange={handleFormChange(setEditForm, latestEditFormRef)}
              onContentChange={handleContentChange(
                setEditForm,
                latestEditFormRef,
              )}
            />
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {notePendingRemoval ? (
          <ConfirmModal
            title="Excluir anotação"
            description={`Tem certeza de que deseja excluir ${notePendingRemoval.title}?`}
            confirmLabel="Excluir anotação"
            feedbackMessage={error}
            isLoading={isDeleting}
            onCancel={() => setNotePendingRemoval(null)}
            onConfirm={handleConfirmRemove}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
