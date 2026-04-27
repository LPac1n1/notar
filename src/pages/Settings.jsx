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
import { reconcileAllImports } from "../services/importService";
import { useAsync } from "../hooks/useAsync";
import { getErrorMessage } from "../utils/error";

function formatBackupStats(stats = {}) {
  return [
    `${stats.demands ?? 0} demanda(s)`,
    `${stats.donors ?? 0} doador(es)`,
    `${stats.donorCpfLinks ?? 0} CPF(s) vinculado(s)`,
    `${stats.imports ?? 0} importacao(oes)`,
    `${stats.importCpfSummary ?? 0} CPF(s) consolidados`,
    `${stats.monthlyDonorSummary ?? 0} resumo(s) mensal(is)`,
    `${stats.trashItems ?? 0} item(ns) na lixeira`,
  ].join(", ");
}

export default function Settings() {
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [backupInputKey, setBackupInputKey] = useState(0);
  const [isImportBackupConfirmOpen, setIsImportBackupConfirmOpen] = useState(false);
  const isLoadingStorage = storageInfo === null && !error;
  const settingsOperation = useAsync({ reportGlobal: true });

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
            "Nao foi possivel verificar o modo de armazenamento local do sistema.",
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
      await settingsOperation.run(
        async () => {
          setIsSubmitting(true);
          setError("");
          setSuccessMessage("");
          setOperationMessage("Criando e conectando o arquivo de dados...");

          const result = await createDatabaseFile();
          setStorageInfo(result.storageInfo);
          setSuccessMessage(
            result.migratedCurrentSession
              ? "Arquivo criado e conectado. Os dados atuais da sessao foram copiados para ele."
              : "Arquivo criado e conectado. As proximas alteracoes serao gravadas nele.",
          );
        },
        {
          loadingMessage: "Criando arquivo de dados...",
          successMessage: "Arquivo de dados conectado.",
        },
      );
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Nao foi possivel criar e conectar o arquivo de dados.",
        ),
      );
    } finally {
      setOperationMessage("");
      setIsSubmitting(false);
    }
  };

  const handleOpenFile = async () => {
    try {
      await settingsOperation.run(
        async () => {
          setIsSubmitting(true);
          setError("");
          setSuccessMessage("");
          setOperationMessage("Abrindo arquivo de dados e carregando informações...");

          const result = await openDatabaseFile({ emitChange: false });
          setOperationMessage("Reconciliando importações e resumos mensais...");
          await reconcileAllImports({ emitChange: false });
          notifyDatabaseChanged({ source: "database-file-opened" });
          setStorageInfo(result.storageInfo);
          setSuccessMessage(
            result.usedExistingFile
              ? "Arquivo existente conectado. Os dados carregados agora passam a vir desse arquivo."
              : "Arquivo conectado com sucesso.",
          );
        },
        {
          loadingMessage: "Abrindo arquivo de dados...",
          successMessage: "Arquivo de dados carregado.",
        },
      );
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Nao foi possivel abrir o arquivo de dados.",
        ),
      );
    } finally {
      setOperationMessage("");
      setIsSubmitting(false);
    }
  };

  const handleDisconnectFile = async () => {
    try {
      await settingsOperation.run(
        async () => {
          setIsSubmitting(true);
          setError("");
          setSuccessMessage("");
          setOperationMessage("Desconectando arquivo de dados...");

          const result = await disconnectDatabaseFile();
          setStorageInfo(result.storageInfo);
          setSuccessMessage(
            "Arquivo desconectado. Os dados atuais continuam apenas nesta sessao ate que um novo arquivo seja conectado.",
          );
          await refreshStorageInfo();
        },
        {
          loadingMessage: "Desconectando arquivo de dados...",
          successMessage: "Arquivo desconectado.",
        },
      );
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Nao foi possivel desconectar o arquivo de dados.",
        ),
      );
    } finally {
      setOperationMessage("");
      setIsSubmitting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      await settingsOperation.run(
        async () => {
          setIsSubmitting(true);
          setError("");
          setSuccessMessage("");
          setOperationMessage("Gerando backup dos dados atuais...");

          const backup = await exportDatabaseBackup();
          const blob = new Blob([backup.text], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");

          link.href = url;
          link.download = backup.fileName;
          document.body.append(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);

          setSuccessMessage(
            `Backup exportado com sucesso: ${formatBackupStats(backup.stats)}.`,
          );
        },
        {
          loadingMessage: "Gerando backup dos dados...",
          successMessage: "Backup exportado.",
        },
      );
    } catch (backupError) {
      setError(
        getErrorMessage(
          backupError,
          "Nao foi possivel exportar o backup do sistema.",
        ),
      );
    } finally {
      setOperationMessage("");
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

    try {
      await settingsOperation.run(
        async () => {
          setIsSubmitting(true);
          setError("");
          setSuccessMessage("");
          setOperationMessage("Lendo e validando o arquivo de backup...");

          const result = await importDatabaseBackup(selectedBackupFile, {
            emitChange: false,
          });
          setOperationMessage("Reconciliando importações e resumos mensais...");
          await reconcileAllImports({ emitChange: false });
          notifyDatabaseChanged({ source: "backup-import" });
          setStorageInfo(result.storageInfo);
          resetBackupFileSelection();
          setIsImportBackupConfirmOpen(false);
          setSuccessMessage(
            `Backup importado com sucesso: ${formatBackupStats(result.stats)}.`,
          );
        },
        {
          loadingMessage: "Restaurando backup...",
          successMessage: "Backup importado e telas atualizadas.",
        },
      );
    } catch (backupError) {
      setError(
        getErrorMessage(
          backupError,
          "Nao foi possivel importar o backup selecionado.",
        ),
      );
    } finally {
      setOperationMessage("");
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
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage
        message={operationMessage}
        tone="info"
        persistent
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
              <p className="text-sm text-[var(--muted)]">Status</p>
              <p className="font-medium text-[var(--text-main)]">
                {storageInfo.label}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {storageInfo.description}
              </p>
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
                message="Sem um arquivo conectado, os dados atuais so existem nesta sessao e podem se perder ao fechar ou recarregar a aplicacao."
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
            isLoading={isSubmitting}
            loadingMessage={operationMessage || "Restaurando backup..."}
            onCancel={() => setIsImportBackupConfirmOpen(false)}
            onConfirm={handleImportBackup}
            tone="danger"
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
