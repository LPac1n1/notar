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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const notesRequestIdRef = useRef(0);
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

  useEffect(() => {
    loadNotes({ showLoading: true });
  }, [loadNotes]);

  useDatabaseChangeEffect(() => loadNotes());

  const handleFormChange = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleContentChange = (setter) => (value) => {
    setter((current) => ({
      ...current,
      content: value,
    }));
  };

  const handleOpenCreateModal = () => {
    setError("");
    setSuccessMessage("");
    setCreateForm({ ...EMPTY_NOTE_FORM });
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateForm({ ...EMPTY_NOTE_FORM });
  };

  const handleAdd = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await createNote(createForm);
      handleCloseCreateModal();
      setSuccessMessage("Anotação criada com sucesso.");
      await loadNotes();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível criar a anotação."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (note) => {
    setError("");
    setSuccessMessage("");
    setEditingNote(note);
    setEditForm({
      title: note.title,
      content: note.content,
      color: note.color,
    });
  };

  const handleCloseEditModal = () => {
    setEditingNote(null);
    setEditForm({ ...EMPTY_NOTE_FORM });
  };

  const handleSaveEdit = async () => {
    if (!editingNote) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setIsSubmitting(true);
      await updateNote({
        id: editingNote.id,
        ...editForm,
      });
      handleCloseEditModal();
      setSuccessMessage("Anotação atualizada com sucesso.");
      await loadNotes();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar a anotação."));
    } finally {
      setIsSubmitting(false);
    }
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
            description="Registre uma informação interna."
            confirmLabel="Criar anotação"
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={handleCloseCreateModal}
            onSubmit={handleAdd}
            size="xl"
          >
            <NoteFormFields
              form={createForm}
              onChange={handleFormChange(setCreateForm)}
              onContentChange={handleContentChange(setCreateForm)}
            />
          </FormModal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingNote ? (
          <FormModal
            title="Editar anotação"
            description="Atualize título, conteúdo ou cor."
            confirmLabel="Salvar anotação"
            feedbackMessage={error}
            isLoading={isSubmitting}
            onClose={handleCloseEditModal}
            onSubmit={handleSaveEdit}
            size="xl"
          >
            <NoteFormFields
              form={editForm}
              onChange={handleFormChange(setEditForm)}
              onContentChange={handleContentChange(setEditForm)}
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
