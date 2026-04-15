import { useEffect, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TextInput from "../components/ui/TextInput";
import {
  createDatabaseFile,
  disconnectDatabaseFile,
  exportDatabaseBackup,
  getDatabaseStorageInfo,
  importDatabaseBackup,
  openDatabaseFile,
} from "../services/db";
import { getErrorMessage } from "../utils/error";

function formatBackupStats(stats = {}) {
  return [
    `${stats.demands ?? 0} demanda(s)`,
    `${stats.donors ?? 0} doador(es)`,
    `${stats.imports ?? 0} importacao(oes)`,
    `${stats.importCpfSummary ?? 0} CPF(s) consolidados`,
    `${stats.monthlyDonorSummary ?? 0} resumo(s) mensal(is)`,
  ].join(", ");
}

export default function Settings() {
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [backupInputKey, setBackupInputKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadStorageInfo = async () => {
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

    loadStorageInfo();

    return () => {
      isMounted = false;
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
      setStorageInfo(result.storageInfo);
      setSuccessMessage(
        result.migratedCurrentSession
          ? "Arquivo criado e conectado. Os dados atuais da sessao foram copiados para ele."
          : "Arquivo criado e conectado. As proximas alteracoes serao gravadas nele.",
      );
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Nao foi possivel criar e conectar o arquivo de dados.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenFile = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const result = await openDatabaseFile();
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
          "Nao foi possivel abrir o arquivo de dados.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnectFile = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const result = await disconnectDatabaseFile();
      setStorageInfo(result.storageInfo);
      setSuccessMessage(
        "Arquivo desconectado. Os dados atuais continuam apenas nesta sessao ate que um novo arquivo seja conectado.",
      );
      await refreshStorageInfo();
    } catch (storageError) {
      setError(
        getErrorMessage(
          storageError,
          "Nao foi possivel desconectar o arquivo de dados.",
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
    } catch (backupError) {
      setError(
        getErrorMessage(
          backupError,
          "Nao foi possivel exportar o backup do sistema.",
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

    const shouldContinue = window.confirm(
      "Importar um backup vai substituir os dados atuais do sistema. Deseja continuar?",
    );

    if (!shouldContinue) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const result = await importDatabaseBackup(selectedBackupFile);
      setStorageInfo(result.storageInfo);
      resetBackupFileSelection();
      setSuccessMessage(
        `Backup importado com sucesso: ${formatBackupStats(result.stats)}.`,
      );
    } catch (backupError) {
      setError(
        getErrorMessage(
          backupError,
          "Nao foi possivel importar o backup selecionado.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Configurações" className="mb-4" />
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage message={successMessage} tone="success" />

      <SectionCard
        title="Armazenamento local"
        description="O Notar pode funcionar em memoria ou conectado a um arquivo local de banco de dados."
        className="mb-6"
      >
        {storageInfo ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm text-zinc-500">Status</p>
              <p className="font-medium text-zinc-900">{storageInfo.label}</p>
            </div>

            <p className="text-sm text-zinc-600">{storageInfo.description}</p>

            {storageInfo.fileName ? (
              <div>
                <p className="text-sm text-zinc-500">Arquivo conectado</p>
                <p className="font-medium text-zinc-900 break-all">
                  {storageInfo.fileName}
                </p>
              </div>
            ) : null}

            <FeedbackMessage
              message={
                storageInfo.isPersistent
                  ? "Os dados estao sendo gravados de forma persistente."
                  : "Os dados podem se perder ao fechar ou recarregar a aplicacao neste ambiente."
              }
              tone={storageInfo.isPersistent ? "success" : "warning"}
              className="mb-0"
              persistent
            />

            <div className="flex flex-col gap-3 pt-2 md:flex-row">
              <Button onClick={handleCreateFile} disabled={isSubmitting}>
                Criar arquivo de dados
              </Button>

              <Button
                variant="subtle"
                onClick={handleOpenFile}
                disabled={isSubmitting}
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
          <p className="text-sm text-zinc-600">
            Verificando o modo de armazenamento do sistema...
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Cópia de segurança"
        description="Salvar cria uma cópia dos dados atuais. Restaurar traz de volta uma cópia salva antes."
        className="mb-6"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Button onClick={handleExportBackup} disabled={isSubmitting}>
              Salvar backup
            </Button>
            <p className="text-sm text-zinc-600">
              Cria um arquivo JSON com uma cópia completa dos dados atuais.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-zinc-900">
                Restaurar backup
              </p>
              <p className="text-sm text-zinc-600">
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
                onClick={handleImportBackup}
                disabled={isSubmitting || !selectedBackupFile}
              >
                Importar backup
              </Button>
            </div>

            {selectedBackupFile ? (
              <p className="mt-3 break-all text-sm text-zinc-600">
                Arquivo selecionado:{" "}
                <span className="font-medium text-zinc-900">
                  {selectedBackupFile.name}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <EmptyState
        title="Mais configurações virão depois"
        description="Esta área continuará crescendo conforme o Notar ganhar novos módulos operacionais."
      />
    </div>
  );
}
