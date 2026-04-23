import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import {
  deleteAllTrashItemsPermanently,
  deleteTrashItemPermanently,
  listTrashItems,
  restoreTrashItem,
} from "../services/trashService";
import { getErrorMessage } from "../utils/error";

export default function Trash() {
  const [trashItems, setTrashItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [trashItemPendingPermanentDelete, setTrashItemPendingPermanentDelete] =
    useState(null);
  const [isClearTrashConfirmOpen, setIsClearTrashConfirmOpen] = useState(false);

  useEffect(() => {
    const loadTrash = async () => {
      try {
        setError("");
        const trashRows = await listTrashItems();
        setTrashItems(trashRows);
      } catch (trashError) {
        setError(
          getErrorMessage(
            trashError,
            "Nao foi possivel carregar os itens da lixeira.",
          ),
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadTrash();
  }, []);

  const refreshTrashItems = async () => {
    const trashRows = await listTrashItems();
    setTrashItems(trashRows);
  };

  const handleRestoreTrashItem = async (item) => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");
      await restoreTrashItem(item.id);
      await refreshTrashItems();
      setSuccessMessage(`${item.label} foi restaurado com sucesso.`);
    } catch (trashError) {
      setError(
        getErrorMessage(trashError, "Nao foi possivel restaurar o item."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePermanentDeleteTrashItem = async () => {
    if (!trashItemPendingPermanentDelete) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");
      await deleteTrashItemPermanently(trashItemPendingPermanentDelete.id);
      await refreshTrashItems();
      setTrashItemPendingPermanentDelete(null);
      setSuccessMessage("Item removido permanentemente da lixeira.");
    } catch (trashError) {
      setError(
        getErrorMessage(
          trashError,
          "Nao foi possivel excluir o item permanentemente.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearTrash = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");
      await deleteAllTrashItemsPermanently();
      await refreshTrashItems();
      setIsClearTrashConfirmOpen(false);
      setSuccessMessage("A lixeira foi esvaziada com sucesso.");
    } catch (trashError) {
      setError(
        getErrorMessage(
          trashError,
          "Nao foi possivel apagar todos os itens da lixeira.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !error) {
    return (
      <div>
        <PageHeader title="Lixeira" subtitle="Itens removidos do sistema." className="mb-6" />
        <LoadingScreen
          title="Abrindo a lixeira"
          description="Carregando itens removidos."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Lixeira"
        subtitle={`${trashItems.length} item(ns) disponível(is) para restauração.`}
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard title="Itens removidos">
        {trashItems.length === 0 ? (
          <EmptyState
            title="Lixeira vazia"
            description="Quando você remover doadores, demandas ou importações, eles aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="danger"
                onClick={() => setIsClearTrashConfirmOpen(true)}
                disabled={isSubmitting}
              >
                Apagar tudo
              </Button>
            </div>

            {trashItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-main)]">{item.label}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.entityType} • Removido em {item.deletedAt}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="subtle"
                    onClick={() => handleRestoreTrashItem(item)}
                    disabled={isSubmitting}
                  >
                    Restaurar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setTrashItemPendingPermanentDelete(item)}
                    disabled={isSubmitting}
                  >
                    Excluir permanentemente
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <AnimatePresence>
        {isClearTrashConfirmOpen ? (
          <ConfirmModal
            title="Apagar tudo"
            description="Todos os itens da lixeira serão removidos permanentemente. Deseja continuar?"
            confirmLabel="Apagar tudo"
            isLoading={isSubmitting}
            onCancel={() => setIsClearTrashConfirmOpen(false)}
            onConfirm={handleClearTrash}
            tone="danger"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {trashItemPendingPermanentDelete ? (
          <ConfirmModal
            title="Excluir permanentemente"
            description={`Esta ação remove ${trashItemPendingPermanentDelete.label} da lixeira e não poderá ser desfeita.`}
            confirmLabel="Excluir permanentemente"
            isLoading={isSubmitting}
            onCancel={() => setTrashItemPendingPermanentDelete(null)}
            onConfirm={handlePermanentDeleteTrashItem}
            tone="danger"
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
