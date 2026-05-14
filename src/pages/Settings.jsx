import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TextInput from "../components/ui/TextInput";
import {
  BackupExportIcon,
  BackupImportIcon,
  DownloadIcon,
} from "../components/ui/icons";
import {
  exportDatabaseBackup,
  flushPendingCloudSync,
  getCloudSyncStatus,
  getDatabaseStorageInfo,
  importDatabaseBackup,
  notifyDatabaseChanged,
  onCloudSyncStatusChange,
  STORAGE_INFO_EVENT,
} from "../services/db";
import { exportLogBuffer, getLogBufferSnapshot, logError } from "../services/logger";
import { useAuth } from "../hooks/useAuth";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import {
  finishDataSyncFeedback,
  startDataSyncFeedback,
} from "../services/dataSyncFeedback";
import { reconcileAllImports } from "../services/importService";
import { downloadFile } from "../utils/download";
import { formatDatePtBR } from "../utils/date";
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

function formatLastSyncedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDatePtBR(value)} às ${time}`;
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
  const { user, signOut } = useAuth();
  const [storageInfo, setStorageInfo] = useState(null);
  const [syncSnapshot, setSyncSnapshot] = useState(() => getCloudSyncStatus());
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
        logError("Settings.loadStorageInfo", storageError);

        if (isMounted) {
          setError(
            "Não foi possível verificar o modo de armazenamento do sistema.",
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
    const unsubscribeSync = onCloudSyncStatusChange((nextSnapshot) => {
      if (isMounted) {
        setSyncSnapshot(nextSnapshot);
      }
    });

    return () => {
      isMounted = false;
      window.removeEventListener(STORAGE_INFO_EVENT, handleStorageInfoChange);
      unsubscribeSync();
    };
  }, []);

  const handleForceSync = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");
      await flushPendingCloudSync();
      setSuccessMessage("Sincronização concluída.");
    } catch (syncError) {
      logError("Settings.forceSync", syncError);
      setError(
        getErrorMessage(
          syncError,
          "Não foi possível sincronizar com a nuvem agora.",
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
      logError("Settings.exportBackup", backupError);
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
      resetBackupFileSelection();
      setIsImportBackupConfirmOpen(false);
      setSuccessMessage(
        `Backup importado com sucesso: ${formatBackupStats(result.stats)}.`,
      );
    } catch (backupError) {
      logError("Settings.importBackup", backupError, {
        fileName: selectedBackupFile?.name ?? "",
      });
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

  const handleSignOut = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");
      await signOut();
    } catch (signOutError) {
      logError("Settings.signOut", signOutError);
      setError(
        getErrorMessage(signOutError, "Não foi possível encerrar a sessão."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadLogBuffer = () => {
    // Snapshot before exporting so the file size matches what the user sees
    // in the success message. The log buffer keeps growing in memory while
    // the session is open, so we capture the count once.
    const snapshot = getLogBufferSnapshot();
    const json = exportLogBuffer();
    const fileName = `notar-log-${new Date().toISOString().slice(0, 10)}.json`;

    downloadFile({
      fileName,
      content: json,
      mimeType: "application/json",
    });

    setError("");
    setSuccessMessage(
      snapshot.length === 0
        ? "Log salvo. Nenhum erro foi capturado nesta sessão."
        : `Log salvo com ${formatInteger(snapshot.length)} entrada(s) recente(s).`,
    );
  };

  const syncStatusBadge = (() => {
    if (syncSnapshot.status === "syncing") {
      return { tone: "info", label: "Sincronizando…" };
    }
    if (syncSnapshot.status === "error") {
      return {
        tone: "warning",
        label: "Falha ao sincronizar — tentaremos novamente na próxima alteração.",
      };
    }
    return { tone: "muted", label: "Tudo sincronizado" };
  })();

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Sincronização, backup e conta."
        className="mb-6"
      />
      <FeedbackMessage
        message={isImportBackupConfirmOpen ? "" : error}
        tone="error"
      />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Sincronização"
        description="Seus dados ficam salvos automaticamente no Supabase. Não precisa abrir nem salvar arquivo."
        className="mb-6"
      >
        {isLoadingStorage ? (
          <LoadingScreen
            compact
            title="Verificando o armazenamento"
            description="Carregando informações de sincronização."
          />
        ) : storageInfo ? (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              <p className="text-sm text-[var(--muted)]">Status</p>
              <p className="font-medium text-[var(--text-main)]">
                {isApplyingData ? dataSyncMessage : storageInfo.label}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {storageInfo.description}
              </p>
              <p
                className={`mt-2 text-sm ${
                  syncStatusBadge.tone === "warning"
                    ? "text-[var(--warning)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {syncStatusBadge.label}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                <p className="text-sm text-[var(--muted)]">Última sincronização</p>
                <p className="font-medium text-[var(--text-main)]">
                  {formatLastSyncedAt(syncSnapshot.lastSyncedAt)}
                </p>
              </div>
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
                <p className="text-sm text-[var(--muted)]">Conta sincronizada</p>
                <p className="font-medium text-[var(--text-main)] break-all">
                  {user?.email || "—"}
                </p>
              </div>
            </div>

            <div className="pt-1">
              <Button
                variant="subtle"
                onClick={handleForceSync}
                disabled={isSubmitting || syncSnapshot.status === "syncing"}
              >
                Sincronizar agora
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
        description="Exportação e restauração em JSON. Útil como rede de segurança offline."
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
                Substitui os dados atuais do sistema pelos do arquivo escolhido. A nuvem é atualizada na sequência.
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

      <SectionCard
        title="Conta"
        description="Sessão atual deste dispositivo."
        className="mb-6"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm text-[var(--muted)]">E-mail</p>
            <p className="font-medium text-[var(--text-main)] break-all">
              {user?.email || "—"}
            </p>
          </div>
          <Button
            variant="subtle"
            onClick={handleSignOut}
            disabled={isSubmitting}
          >
            Sair desta conta
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Diagnóstico"
        description="Ferramentas para investigar problemas que apareçam durante o uso."
        className="mb-6"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Button
            variant="subtle"
            onClick={handleDownloadLogBuffer}
            leftIcon={<DownloadIcon className="h-4 w-4" />}
          >
            Baixar log de erros
          </Button>
          <p className="text-sm text-[var(--muted)]">
            Gera um JSON com os erros capturados nesta sessão (até 200
            entradas). Anexe a esse arquivo ao reportar um problema.
          </p>
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
