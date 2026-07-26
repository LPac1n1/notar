import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import DataSyncSectionLoading from "../components/ui/DataSyncSectionLoading";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import PaginationControls from "../components/ui/PaginationControls";
import SectionCard from "../components/ui/SectionCard";
import {
  countTrashItems,
  deleteAllTrashItemsPermanently,
  deleteTrashItemPermanently,
  listTrashItems,
  restoreTrashItem,
} from "../services/trashService";
import { formatInteger } from "../utils/format";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useDataRefreshIndicator } from "../hooks/useDataRefreshIndicator";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useMutationAction } from "../hooks/useMutationAction";

export default function Trash() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [trashItemPendingPermanentDelete, setTrashItemPendingPermanentDelete] =
    useState(null);
  const [isClearTrashConfirmOpen, setIsClearTrashConfirmOpen] = useState(false);

  const filters = useMemo(() => ({}), []);
  const {
    data: trashItems,
    isLoading,
    isRefreshing,
    error,
    reload: reloadTrash,
    pagination: trashPagination,
  } = usePaginatedResource({
    loader: listTrashItems,
    countLoader: countTrashItems,
    filters,
    initialPageSize: 25,
    errorMessage: "Não foi possível carregar os itens da lixeira.",
    scope: "TrashPage",
  });

  const { dataSyncFeedback, showDataRefreshLoading } =
    useDataRefreshIndicator(isRefreshing);

  useDatabaseChangeEffect(reloadTrash, { domains: ["trash"] });

  const runMutation = useMutationAction({
    setError: setFormError,
    setSuccessMessage,
    setBusy: setIsSubmitting,
    reload: reloadTrash,
  });

  const handleRestoreTrashItem = (item) => {
    runMutation({
      scope: "TrashPage.restore",
      run: () => restoreTrashItem(item.id),
      successMessage: `${item.label} foi restaurado com sucesso.`,
      errorMessage: "Não foi possível restaurar o item.",
    });
  };

  const handlePermanentDeleteTrashItem = () => {
    if (!trashItemPendingPermanentDelete) return;
    runMutation({
      scope: "TrashPage.permanentDelete",
      run: () => deleteTrashItemPermanently(trashItemPendingPermanentDelete.id),
      successMessage: "Item removido permanentemente da lixeira.",
      errorMessage: "Não foi possível excluir o item permanentemente.",
      onSuccess: () => setTrashItemPendingPermanentDelete(null),
    });
  };

  const handleClearTrash = () => {
    runMutation({
      scope: "TrashPage.clearAll",
      run: () => deleteAllTrashItemsPermanently(),
      successMessage: "A lixeira foi esvaziada com sucesso.",
      errorMessage: "Não foi possível apagar todos os itens da lixeira.",
      onSuccess: () => setIsClearTrashConfirmOpen(false),
    });
  };

  const displayError =
    isClearTrashConfirmOpen || trashItemPendingPermanentDelete
      ? ""
      : formError || error;

  if (isLoading && !error) {
    return (
      <div>
        <PageHeader
          title="Lixeira"
          subtitle="Itens removidos do sistema."
          className="mb-6"
        />
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
        subtitle={`${formatInteger(trashPagination.totalItems)} item(ns) disponível(is) para restauração.`}
        className="mb-6"
      />
      <FeedbackMessage message={displayError} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard title="Itens removidos">
        {showDataRefreshLoading ? (
          <DataSyncSectionLoading
            message={dataSyncFeedback.label}
            rows={3}
          />
        ) : trashItems.length === 0 ? (
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

            <PaginationControls
              endItem={trashPagination.endItem}
              onPageChange={trashPagination.setPage}
              onPageSizeChange={trashPagination.handlePageSizeChange}
              page={trashPagination.page}
              pageSize={trashPagination.pageSize}
              totalItems={trashPagination.totalItems}
              totalPages={trashPagination.totalPages}
            />

            {trashItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-main)]">
                    {item.label}
                  </p>
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

            <PaginationControls
              endItem={trashPagination.endItem}
              onPageChange={trashPagination.setPage}
              onPageSizeChange={trashPagination.handlePageSizeChange}
              page={trashPagination.page}
              pageSize={trashPagination.pageSize}
              totalItems={trashPagination.totalItems}
              totalPages={trashPagination.totalPages}
            />
          </div>
        )}
      </SectionCard>

      <AnimatePresence>
        {isClearTrashConfirmOpen ? (
          <ConfirmModal
            title="Apagar tudo"
            description="Todos os itens da lixeira serão removidos permanentemente. Deseja continuar?"
            confirmLabel="Apagar tudo"
            feedbackMessage={formError}
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
            feedbackMessage={formError}
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
