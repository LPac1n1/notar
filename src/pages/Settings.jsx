import { useEffect, useState } from "react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import {
  createDatabaseFile,
  disconnectDatabaseFile,
  getDatabaseStorageInfo,
  openDatabaseFile,
} from "../services/db";

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallbackMessage;
}

export default function Settings() {
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        console.error(storageError);

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

      <EmptyState
        title="Nenhuma configuração disponível por enquanto"
        description="As configurações do sistema aparecerão aqui conforme os próximos módulos forem implementados."
      />
    </div>
  );
}
