import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import CopyableValue from "../components/ui/CopyableValue";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import StatusBadge from "../components/ui/StatusBadge";
import {
  BackupExportIcon,
  BackupImportIcon,
  BugIcon,
  CloudIcon,
  DownloadIcon,
  KeyboardIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UploadIcon,
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
import { useTheme } from "../hooks/useTheme";
import { KEYBOARD_SHORTCUTS } from "../hooks/useKeyboardNavigation";
import { createActionHistoryEntry } from "../services/actionHistoryService";
import {
  finishDataSyncFeedback,
  startDataSyncFeedback,
} from "../services/dataSyncFeedback";
import { reconcileAllImports } from "../services/importService";
import { downloadFile } from "../utils/download";
import { formatDatePtBR, formatSyncTime } from "../utils/date";
import { getErrorMessage } from "../utils/error";
import { formatInteger } from "../utils/format";
import { NAV_ITEMS } from "../components/layout/navigation";

const DATA_SYNC_HANDOFF_DELAY_MS = 650;

const THEME_OPTIONS = [
  { value: "system", label: "Sistema", icon: MonitorIcon },
  { value: "dark",   label: "Escuro",  icon: MoonIcon },
  { value: "light",  label: "Claro",   icon: SunIcon },
];

const SHORTCUT_LABELS = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.to, item.label]),
);

function plural(n, singular, pluralForm) {
  return `${formatInteger(n)} ${n === 1 ? singular : pluralForm}`;
}

function formatBackupStats(stats = {}) {
  return [
    plural(stats.demands ?? 0, "demanda", "demandas"),
    plural(stats.donors ?? 0, "doador", "doadores"),
    plural(stats.donorCpfLinks ?? 0, "CPF vinculado", "CPFs vinculados"),
    plural(stats.imports ?? 0, "importação", "importações"),
    plural(stats.importCpfSummary ?? 0, "CPF consolidado", "CPFs consolidados"),
    plural(stats.monthlyDonorSummary ?? 0, "resumo mensal", "resumos mensais"),
    plural(stats.actionHistory ?? 0, "ação no histórico", "ações no histórico"),
    plural(stats.trashItems ?? 0, "item na lixeira", "itens na lixeira"),
  ].join(", ");
}

function formatLastSyncedAt(value) {
  if (!value) return "—";
  const time = formatSyncTime(value);
  if (!time) return "—";
  return `${formatDatePtBR(value)} às ${time}`;
}

async function recordSettingsAction({ actionType, description, label, payload = {} }) {
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
  return new Promise((resolve) => window.setTimeout(resolve, DATA_SYNC_HANDOFF_DELAY_MS));
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-sm text-[var(--muted)]">{label}</span>
      <span className="text-right text-sm font-medium text-[var(--text-main)]">{children}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-[var(--line)]" />;
}

export default function Settings() {
  const { status: authStatus, user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [storageInfo, setStorageInfo] = useState(null);
  const [syncSnapshot, setSyncSnapshot] = useState(() => getCloudSyncStatus());
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [backupInputKey, setBackupInputKey] = useState(0);
  const [isImportBackupConfirmOpen, setIsImportBackupConfirmOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [dataSyncMessage, setDataSyncMessage] = useState("");
  const fileInputRef = useRef(null);

  const isLoadingStorage = storageInfo === null && !error;
  const isApplyingData = Boolean(dataSyncMessage);
  const isLocalMode = authStatus === "local";

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        setError("");
        const info = await getDatabaseStorageInfo();
        if (isMounted) setStorageInfo(info);
      } catch (storageError) {
        logError("Settings.loadStorageInfo", storageError);
        if (isMounted)
          setError("Não foi possível verificar o modo de armazenamento do sistema.");
      }
    };

    loadSettings();

    const handleStorageInfoChange = (event) => {
      if (isMounted && event.detail) setStorageInfo(event.detail);
    };

    window.addEventListener(STORAGE_INFO_EVENT, handleStorageInfoChange);
    const unsubscribeSync = onCloudSyncStatusChange((next) => {
      if (isMounted) setSyncSnapshot(next);
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
      setError(getErrorMessage(syncError, "Não foi possível sincronizar com a nuvem agora."));
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
      downloadFile({ fileName: backup.fileName, content: backup.text, mimeType: "application/json" });
      await recordSettingsAction({
        actionType: "backup",
        label: backup.fileName,
        description: "Backup exportado.",
        payload: { exportedAt: backup.exportedAt, fileName: backup.fileName, stats: backup.stats },
      });
      setSuccessMessage(`Backup exportado: ${formatBackupStats(backup.stats)}.`);
    } catch (backupError) {
      logError("Settings.exportBackup", backupError);
      setError(getErrorMessage(backupError, "Não foi possível exportar o backup do sistema."));
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
    setBackupInputKey((c) => c + 1);
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
      dataSyncOperationId = startDataSyncFeedback({ label: nextMessage, source: "backup-import" });
      setDataSyncMessage(nextMessage);
      const result = await importDatabaseBackup(selectedBackupFile, { emitChange: false });
      await reconcileAllImports({ emitChange: false });
      await recordSettingsAction({
        actionType: "backup",
        label: selectedBackupFile.name,
        description: "Backup importado e restaurado.",
        payload: { fileName: selectedBackupFile.name, stats: result.stats },
      });
      notifyDatabaseChanged({ source: "backup-import" });
      await waitForDataSyncHandoff();
      resetBackupFileSelection();
      setIsImportBackupConfirmOpen(false);
      setSuccessMessage(`Backup importado: ${formatBackupStats(result.stats)}.`);
    } catch (backupError) {
      logError("Settings.importBackup", backupError, { fileName: selectedBackupFile?.name ?? "" });
      setError(getErrorMessage(backupError, "Não foi possível importar o backup selecionado."));
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
      setIsSignOutConfirmOpen(false);
      setError(getErrorMessage(signOutError, "Não foi possível encerrar a sessão."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadLogBuffer = () => {
    const snapshot = getLogBufferSnapshot();
    const json = exportLogBuffer();
    const fileName = `notar-log-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile({ fileName, content: json, mimeType: "application/json" });
    setError("");
    setSuccessMessage(
      snapshot.length === 0
        ? "Log salvo. Nenhum erro foi capturado nesta sessão."
        : `Log salvo com ${plural(snapshot.length, "entrada", "entradas")}.`,
    );
  };

  const syncStatus = (() => {
    if (isLocalMode) return { tone: "neutral", label: "Modo local" };
    if (syncSnapshot.status === "syncing") return { tone: "info", label: "Sincronizando…" };
    if (syncSnapshot.status === "error") return { tone: "warning", label: "Falha ao sincronizar" };
    return { tone: "success", label: "Sincronizado" };
  })();

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Aparência, conta, backup e diagnóstico."
        className="mb-6"
      />
      <FeedbackMessage
        message={isImportBackupConfirmOpen || isSignOutConfirmOpen ? "" : error}
        tone="error"
      />
      <FeedbackMessage message={successMessage} tone="success" />

      {/* ── Aparência ─────────────────────────────────────────────────── */}
      <SectionCard
        title="Aparência"
        icon={SunIcon}
        description="Tema da interface. A escolha é salva no navegador."
        className="mb-6"
        collapsible
        defaultOpen
      >
        <div
          role="group"
          aria-label="Tema"
          className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-1"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={isActive}
                className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--accent)] text-[#12151c] shadow-sm"
                    : "text-[var(--muted-strong)] hover:text-[var(--text-main)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {option.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Conta e sincronização ─────────────────────────────────────── */}
      {!isLocalMode ? (
        <SectionCard
          title="Conta"
          icon={CloudIcon}
          description="Sessão ativa e estado da sincronização com o Supabase."
          className="mb-6"
          collapsible
          defaultOpen
        >
          {isLoadingStorage ? (
            <LoadingScreen compact title="Verificando o armazenamento" description="" />
          ) : (
            <div>
              <InfoRow label="E-mail">
                <CopyableValue value={user?.email || ""} copyLabel="Copiar e-mail">
                  <span className="break-all">{user?.email || "—"}</span>
                </CopyableValue>
              </InfoRow>
              <Divider />
              <InfoRow label="Status">
                <StatusBadge tone={syncStatus.tone} label={
                  isApplyingData ? dataSyncMessage : syncStatus.label
                } />
              </InfoRow>
              {syncSnapshot.status === "error" ? (
                <p className="mt-1 pb-2 text-xs text-[var(--warning)]">
                  Tentaremos novamente na próxima alteração.
                </p>
              ) : null}
              <InfoRow label="Última sincronização">
                {formatLastSyncedAt(syncSnapshot.lastSyncedAt)}
              </InfoRow>
              <Divider />
              <div className="pt-3">
                <Button
                  variant="subtle"
                  onClick={handleForceSync}
                  disabled={isSubmitting || syncSnapshot.status === "syncing"}
                  isLoading={syncSnapshot.status === "syncing"}
                  loadingLabel="Sincronizando…"
                  leftIcon={<CloudIcon className="h-4 w-4" />}
                >
                  Sincronizar agora
                </Button>
              </div>

              <div className="mt-6 rounded-md border border-[var(--danger-line)] bg-[color:var(--danger-soft)] p-4">
                <p className="mb-3 text-sm font-medium text-[var(--text-main)]">
                  Encerrar sessão
                </p>
                <p className="mb-4 text-sm text-[var(--muted)]">
                  Você será desconectado deste dispositivo. Para entrar novamente será necessário um link mágico enviado por e-mail.
                </p>
                <Button
                  variant="danger"
                  onClick={() => setIsSignOutConfirmOpen(true)}
                  disabled={isSubmitting}
                >
                  Sair desta conta
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      ) : null}

      {/* ── Cópia de segurança ────────────────────────────────────────── */}
      <SectionCard
        title="Cópia de segurança"
        icon={BackupExportIcon}
        description="Arquivo JSON com todos os dados. Use para transferir entre contas ou recuperar dados."
        className="mb-6"
        collapsible
        defaultOpen={false}
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Button
              onClick={handleExportBackup}
              disabled={isSubmitting}
              leftIcon={<BackupExportIcon className="h-4 w-4" />}
            >
              Salvar backup
            </Button>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Baixa um arquivo <code className="rounded bg-[var(--surface-muted)] px-1 py-0.5 text-xs font-mono">.json</code> com uma cópia completa dos dados atuais.
            </p>
          </div>

          <Divider />

          <div>
            <p className="mb-1 text-sm font-medium text-[var(--text-main)]">Restaurar backup</p>
            <p className="mb-3 text-sm text-[var(--muted)]">
              Substitui os dados atuais pelos do arquivo escolhido.
              {!isLocalMode ? " A nuvem é atualizada na sequência." : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                key={backupInputKey}
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFileChange}
                className="sr-only"
                id="backup-file-input"
              />
              <Button
                variant="subtle"
                leftIcon={<UploadIcon className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {selectedBackupFile ? "Trocar arquivo" : "Escolher arquivo"}
              </Button>
              {selectedBackupFile ? (
                <span className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-3 py-1.5 text-sm text-[var(--text-soft)]">
                  <BackupImportIcon className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  <span className="max-w-48 truncate font-medium">{selectedBackupFile.name}</span>
                </span>
              ) : null}
              <Button
                variant="subtle"
                onClick={() => setIsImportBackupConfirmOpen(true)}
                disabled={isSubmitting || !selectedBackupFile}
                leftIcon={<BackupImportIcon className="h-4 w-4" />}
              >
                Importar
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Atalhos de teclado ────────────────────────────────────────── */}
      <SectionCard
        title="Atalhos de teclado"
        icon={KeyboardIcon}
        description="Pressione g seguido de uma letra para navegar rapidamente entre páginas."
        className="mb-6"
        collapsible
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
          {KEYBOARD_SHORTCUTS.map(({ key, to }) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[var(--line-strong)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--text-soft)]">
                  g
                </kbd>
                <kbd className="rounded border border-[var(--line-strong)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--accent)]">
                  {key}
                </kbd>
              </span>
              <span className="truncate text-[var(--muted)]">
                {SHORTCUT_LABELS[to] ?? to}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Design system ─────────────────────────────────────────────── */}
      <SectionCard
        title="Convenções de design"
        icon={KeyboardIcon}
        description="Referência rápida das regras visuais e de feedback usadas em todo o sistema."
        className="mb-6"
        collapsible
        defaultOpen={false}
      >
        <div className="space-y-5 text-sm">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Hierarquia tipográfica
            </p>
            <ul className="space-y-2 text-[var(--text-soft)]">
              <li>
                <strong className="text-[var(--text-main)]">Page header (h1)</strong>{" "}
                — Montserrat, 30px, semibold. Único por página.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Section title (h2)</strong>{" "}
                — Montserrat, 20px, bold. Um por SectionCard.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Card title (h3)</strong>{" "}
                — System sans, 16px, semibold.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Metric value</strong>{" "}
                — Montserrat, 24-30px, semibold, tabular-nums em valores
                monetários.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Body</strong> — 14px,
                line-height 1.5.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Helper / muted</strong>{" "}
                — 12px, cor <code>--muted</code>.
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Estados de carregamento
            </p>
            <ul className="space-y-2 text-[var(--text-soft)]">
              <li>
                <strong className="text-[var(--text-main)]">Skeleton</strong> —
                primeira carga de listas. Mantém a estrutura visível.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">
                  Inline spinner pequeno
                </strong>{" "}
                — refresh em background. Não bloqueia interação.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">LoadingScreen full</strong>{" "}
                — boot ou operação irreversível (importação processando).
              </li>
              <li>
                <strong className="text-[var(--text-main)]">EmptyState</strong> —
                sempre acompanhado de um CTA primário.
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Feedback de ação
            </p>
            <ul className="space-y-2 text-[var(--text-soft)]">
              <li>
                <strong className="text-[var(--text-main)]">Otimista, sem toast</strong>{" "}
                — local instantânea (toggle, filtro).
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Toast + "Desfazer" 8s</strong>{" "}
                — mutação reversível (delete, edit).
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Inline progress</strong>{" "}
                — mutação cara (import, reimport). Mostra step label.
              </li>
              <li>
                <strong className="text-[var(--text-main)]">Toast com número</strong>{" "}
                — mutação que altera muito estado (re-rodar conciliação).
                Exemplo: "12 doadores movidos para conciliado".
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Cores de status
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  label: "success",
                  className:
                    "border-[var(--success-line)] bg-[var(--accent-2-soft)] text-[var(--success)]",
                },
                {
                  label: "warning",
                  className:
                    "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]",
                },
                {
                  label: "danger",
                  className:
                    "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]",
                },
                {
                  label: "neutral",
                  className:
                    "border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--muted-strong)]",
                },
              ].map((tone) => (
                <div
                  key={tone.label}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold ${tone.className}`}
                >
                  {tone.label}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[var(--muted)]">
            Pressione <kbd className="rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[10px]">?</kbd>{" "}
            em qualquer página para ver o painel completo de atalhos de
            teclado.
          </p>
        </div>
      </SectionCard>

      {/* ── Diagnóstico ───────────────────────────────────────────────── */}
      <SectionCard
        title="Diagnóstico"
        icon={BugIcon}
        description="Ferramentas para investigar problemas durante o uso."
        className="mb-6"
        collapsible
        defaultOpen={false}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="subtle"
            onClick={handleDownloadLogBuffer}
            leftIcon={<DownloadIcon className="h-4 w-4" />}
          >
            Baixar log de erros
          </Button>
          <p className="text-sm text-[var(--muted)]">
            JSON com até 200 erros capturados nesta sessão. Inclua ao reportar um problema.
          </p>
        </div>
      </SectionCard>

      <AnimatePresence>
        {isImportBackupConfirmOpen ? (
          <ConfirmModal
            title="Restaurar backup"
            description="Importar um backup vai substituir os dados atuais do sistema. Essa ação não pode ser desfeita."
            confirmLabel="Restaurar backup"
            feedbackMessage={error}
            isDisabled={isSubmitting}
            onCancel={() => setIsImportBackupConfirmOpen(false)}
            onConfirm={handleImportBackup}
            tone="danger"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isSignOutConfirmOpen ? (
          <ConfirmModal
            title="Sair desta conta"
            description="Você será desconectado desta sessão. Para entrar novamente será necessário usar o link mágico enviado por e-mail."
            confirmLabel="Sair"
            isLoading={isSubmitting}
            onCancel={() => setIsSignOutConfirmOpen(false)}
            onConfirm={handleSignOut}
            tone="danger"
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
