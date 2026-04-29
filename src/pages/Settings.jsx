import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import Loader from "../components/ui/Loader";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TextInput from "../components/ui/TextInput";
import {
  BackupExportIcon,
  BackupImportIcon,
  FolderOpenIcon,
  StorageIcon,
} from "../components/ui/icons";
import {
  createDatabaseFile,
  disconnectDatabaseFile,
  exportDatabaseBackup,
  getDatabaseStorageInfo,
  importDatabaseBackup,
  notifyDatabaseChanged,
  openDatabaseFile,
  STORAGE_INFO_EVENT,
} from "../services/db";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import {
  finishDataSyncFeedback,
  startDataSyncFeedback,
} from "../services/dataSyncFeedback";
import { reconcileAllImports } from "../services/importService";
import { downloadFile } from "../utils/download";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";

const DATA_SYNC_HANDOFF_DELAY_MS = 650;

function formatBackupStats(stats = {}) {
  return [
    `${formatInteger(stats.demands ?? 0)} demanda(s)`,
    `${formatInteger(stats.donors ?? 0)} doador(es)`,
    `${formatInteger(stats.donorCpfLinks ?? 0)} CPF(s) vinculado(s)`,
    `${formatInteger(stats.imports ?? 0)} importação(ões)`,
    `${formatInteger(stats.importCpfSummary ?? 0)} CPF(s) consolidados`,
    `${formatInteger(stats.monthlyDonorSummary ?? 0)} resumo(s) mensal(is)`,
    `${formatInteger(stats.actionHistory ?? 0)} ação(ões) no histórico`,
    `${formatInteger(stats.trashItems ?? 0)} item(ns) na lixeira`,
  ].join(", ");
}

async function recordSettingsAction({
  actionType,
  description,
  label,
  payload = {},
}) {
  await createActionHistoryEntry({
    actionType,
    entityType: "settings",
    entityId: "settings",
    label,
    description,
    payload,
  });
}

function waitForDataSyncHandoff() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, DATA_SYNC_HANDOFF_DELAY_MS);
  });
}

export default function Settings() {
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [backupInputKey, setBackupInputKey] = useState(0);
  const [isImportBackupConfirmOpen, setIsImportBackupConfirmOpen] = useState(false);
  const [dataSyncMessage, setDataSyncMessage] = useState("");
  const isLoadingStorage = storageInfo === null && !error;
  const isApplyingData = Boolean(dataSyncMessage);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        setError("");
        const info = await getDatabaseStorageInfo();

        if (isMounted) {
          setStorageInfo(info);
        }
      } catch (storageError) {
        console.error(
          "Erro ao verificar armazenamento local:",
          getErrorMessage(storageError, "Erro desconhecido."),
        );

        if (isMounted) {
          setError(
            "Não foi possível verificar o modo de armazenamento local do sistema.",
          );
        }
      }
    };

    loadSettings();
    const handleStorageInfoChange = (event) => {
      if (isMounted && event.detail) {
        setStorageInfo(event.detail);
      }
    };

    window.addEventListener(STORAGE_INFO_EVENT, handleStorageInfoChange);

    return () => {
      isMounted = false;
      window.removeEventListener(STORAGE_INFO_EVENT, handleStorageInfoChange);
    };
  }, []);

  const refreshStorageInfo = async () => {
    const info = await getDatabaseStorageInfo();
    setStorageInfo(info);
  };

  const handleCreateFile = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const result = await createDatabaseFile();
      await recordSettingsAction({
        actionType: "storage",
        label: result.storageInfo.fileName || "Arquivo de dados",
        description: "Arquivo de dados criado e conectado.",
        payload: {
          fileName: result.storageInfo.fileName,
          migratedCurrentSession: result.migratedCurrentSession,
        },
      });
      setStorageInfo(result.storageInfo);
      setSuccessMessage(
        result.migratedCurrentSession
          ? "Arquivo criado e conectado. Os dados atuais da sessão foram copiados para ele."
          : "Arquivo criado e conectado. As proximas alteracoes serao gravadas nele.",
      );
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Não foi possível criar e conectar o arquivo de dados.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenFile = async () => {
    let dataSyncOperationId = "";

    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const result = await openDatabaseFile({
        emitChange: false,
        onFileSelected: (handle) => {
          const nextMessage = "Carregando dados";
          dataSyncOperationId = startDataSyncFeedback({
            label: nextMessage,
            source: "database-file-opened",
          });
          setDataSyncMessage(nextMessage);
          setStorageInfo((current) =>
            current
              ? {
                  ...current,
                  fileName: handle?.name ?? current.fileName,
                }
              : current,
          );
        },
      });
      await reconcileAllImports({ emitChange: false });
      await recordSettingsAction({
        actionType: "storage",
        label: result.storageInfo.fileName || "Arquivo de dados",
        description: "Arquivo de dados existente conectado.",
        payload: {
          fileName: result.storageInfo.fileName,
          usedExistingFile: result.usedExistingFile,
        },
      });
      notifyDatabaseChanged({ source: "database-file-opened" });
      await waitForDataSyncHandoff();
      setStorageInfo(result.storageInfo);
      setSuccessMessage(
        result.usedExistingFile
          ? "Arquivo existente conectado. Os dados carregados agora passam a vir desse arquivo."
          : "Arquivo conectado com sucesso.",
      );
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Não foi possível abrir o arquivo de dados.",
        ),
      );
    } finally {
      finishDataSyncFeedback(dataSyncOperationId);
      setDataSyncMessage("");
      setIsSubmitting(false);
    }
  };

  const handleDisconnectFile = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const result = await disconnectDatabaseFile();
      await recordSettingsAction({
        actionType: "storage",
        label: storageInfo?.fileName || "Arquivo de dados",
        description: "Arquivo de dados desconectado.",
        payload: {
          fileName: storageInfo?.fileName ?? "",
        },
      });
      setStorageInfo(result.storageInfo);
      setSuccessMessage(
        "Arquivo desconectado. Os dados atuais continuam apenas nesta sessão até que um novo arquivo seja conectado.",
      );
      await refreshStorageInfo();
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Não foi possível desconectar o arquivo de dados.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const backup = await exportDatabaseBackup();
      downloadFile({
        fileName: backup.fileName,
        content: backup.text,
        mimeType: "application/json",
      });
      await recordSettingsAction({
        actionType: "backup",
        label: backup.fileName,
        description: "Backup exportado.",
        payload: {
          exportedAt: backup.exportedAt,
          fileName: backup.fileName,
          stats: backup.stats,
        },
      });

      setSuccessMessage(
        `Backup exportado com sucesso: ${formatBackupStats(backup.stats)}.`,
      );
    } catch (backupError) {
      setError(
        getErrorMessage(
          backupError,
          "Não foi possível exportar o backup do sistema.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackupFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedBackupFile(file);
  };

  const resetBackupFileSelection = () => {
    setSelectedBackupFile(null);
    setBackupInputKey((current) => current + 1);
  };

  const handleImportBackup = async () => {
    if (!selectedBackupFile) {
      setError("Selecione um arquivo de backup antes de importar.");
      return;
    }

    let dataSyncOperationId = "";

    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");
      const nextMessage = "Carregando dados";
      dataSyncOperationId = startDataSyncFeedback({
        label: nextMessage,
        source: "backup-import",
      });
      setDataSyncMessage(nextMessage);

      const result = await importDatabaseBackup(selectedBackupFile, {
        emitChange: false,
      });
      await reconcileAllImports({ emitChange: false });
      await recordSettingsAction({
        actionType: "backup",
        label: selectedBackupFile.name,
        description: "Backup importado e restaurado.",
        payload: {
          fileName: selectedBackupFile.name,
          stats: result.stats,
        },
      });
      notifyDatabaseChanged({ source: "backup-import" });
      await waitForDataSyncHandoff();
      setStorageInfo(result.storageInfo);
      resetBackupFileSelection();
      setIsImportBackupConfirmOpen(false);
      setSuccessMessage(
        `Backup importado com sucesso: ${formatBackupStats(result.stats)}.`,
      );
    } catch (backupError) {
      setError(
        getErrorMessage(
          backupError,
          "Não foi possível importar o backup selecionado.",
        ),
      );
    } finally {
      finishDataSyncFeedback(dataSyncOperationId);
      setDataSyncMessage("");
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Arquivo de dados e backup."
        className="mb-6"
      />
      <FeedbackMessage
        message={isImportBackupConfirmOpen ? "" : error}
        tone="error"
      />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Armazenamento local"
        className="mb-6"
      >
        {isLoadingStorage ? (
          <LoadingScreen
            compact
            title="Verificando o armazenamento"
            description="Carregando opções de armazenamento."
          />
        ) : storageInfo ? (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              {isApplyingData ? (
                <div role="status" aria-live="polite" aria-busy="true">
                  <p className="text-sm text-[var(--muted)]">Status</p>
                  <div className="mt-1">
                    <Loader label={dataSyncMessage || "Carregando dados"} />
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Aplicando o arquivo selecionado e atualizando as telas do sistema.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--muted)]">Status</p>
                  <p className="font-medium text-[var(--text-main)]">
                    {storageInfo.label}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {storageInfo.description}
                  </p>
                </>
              )}
            </div>

            {storageInfo.fileName ? (
              <div>
                <p className="text-sm text-[var(--muted)]">Arquivo conectado</p>
                <p className="font-medium text-[var(--text-main)] break-all">
                  {storageInfo.fileName}
                </p>
              </div>
            ) : null}

            {!storageInfo.isPersistent ? (
              <FeedbackMessage
                message="Sem um arquivo conectado, os dados atuais só existem nesta sessão e podem se perder ao fechar ou recarregar a aplicação."
                tone="warning"
                className="mb-0"
                persistent
              />
            ) : null}

            <div className="flex flex-col gap-3 pt-2 md:flex-row">
              <Button
                onClick={handleCreateFile}
                disabled={isSubmitting}
                leftIcon={<StorageIcon className="h-4 w-4" />}
              >
                Criar arquivo de dados
              </Button>

              <Button
                variant="subtle"
                onClick={handleOpenFile}
                disabled={isSubmitting}
                leftIcon={<FolderOpenIcon className="h-4 w-4" />}
              >
                Abrir arquivo existente
              </Button>

              <Button
                variant="danger"
                onClick={handleDisconnectFile}
                disabled={isSubmitting || !storageInfo.fileName}
              >
                Desconectar arquivo
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Verificando o modo de armazenamento do sistema...
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Cópia de segurança"
        description="Exportação e restauração em JSON."
        className="mb-6"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Button
              onClick={handleExportBackup}
              disabled={isSubmitting}
              leftIcon={<BackupExportIcon className="h-4 w-4" />}
            >
              Salvar backup
            </Button>
            <p className="text-sm text-[var(--muted)]">
              Cria um arquivo JSON com uma cópia completa dos dados atuais.
            </p>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-[var(--text-main)]">
                Restaurar backup
              </p>
              <p className="text-sm text-[var(--muted)]">
                Traz de volta uma cópia salva antes e substitui os dados atuais do sistema.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <TextInput
                key={backupInputKey}
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFileChange}
                className="md:flex-1"
              />

              <Button
                variant="subtle"
                onClick={() => setIsImportBackupConfirmOpen(true)}
                disabled={isSubmitting || !selectedBackupFile}
                leftIcon={<BackupImportIcon className="h-4 w-4" />}
              >
                Importar backup
              </Button>
            </div>

            {selectedBackupFile ? (
              <p className="mt-3 break-all text-sm text-[var(--muted)]">
                Arquivo selecionado:{" "}
                <span className="font-medium text-[var(--text-main)]">
                  {selectedBackupFile.name}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <AnimatePresence>
        {isImportBackupConfirmOpen ? (
          <ConfirmModal
            title="Restaurar backup"
            description="Importar um backup vai substituir os dados atuais do sistema. Deseja continuar?"
            confirmLabel="Restaurar backup"
            feedbackMessage={error}
            isDisabled={isSubmitting}
            onCancel={() => setIsImportBackupConfirmOpen(false)}
            onConfirm={handleImportBackup}
            tone="danger"
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
