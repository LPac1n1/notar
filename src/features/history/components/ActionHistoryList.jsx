import EmptyState from "../../../components/ui/EmptyState";
import StatusBadge from "../../../components/ui/StatusBadge";
import {
  ACTION_HISTORY_ENTITY_LABELS,
  ACTION_HISTORY_TYPE_LABELS,
} from "../constants";
import { formatDateTimePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

function getActionTone(actionType) {
  if (actionType.includes("delete")) {
    return "danger";
  }

  if (actionType.includes("undo") || actionType.includes("restore")) {
    return "warning";
  }

  if (actionType.includes("create") || actionType.includes("import")) {
    return "success";
  }

  return "neutral";
}

function getStatusLabel(status) {
  if (status === "applied") {
    return "Realizado";
  }

  if (status === "pending") {
    return "Pendente";
  }

  return "";
}

function renderPayloadSummary(action) {
  const months = action.payload?.months ?? [];
  const statusLabel = getStatusLabel(action.payload?.status);

  if (months.length > 0) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {statusLabel ? (
            <StatusBadge label={statusLabel} tone={getActionTone(action.actionType)} />
          ) : null}
          {action.payload?.operationLabel ? (
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
              {action.payload.operationLabel}
            </span>
          ) : null}
          <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
            {formatInteger(action.payload.monthCount ?? months.length)} mês(es)
          </span>
          <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
            {formatCurrency(action.payload.totalAmount ?? 0)}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {months.slice(0, 8).map((month) => (
            <span
              key={`${action.id}-${month.id}`}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--muted)]"
            >
              {formatMonthYear(month.referenceMonth)}
            </span>
          ))}
          {months.length > 8 ? (
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--muted)]">
              +{formatInteger(months.length - 8)}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (action.payload?.fileName) {
    return (
      <p className="mt-2 break-all text-xs text-[var(--muted)]">
        Arquivo: <span className="font-medium">{action.payload.fileName}</span>
      </p>
    );
  }

  return null;
}

export default function ActionHistoryList({ actions = [] }) {
  if (actions.length === 0) {
    return (
      <EmptyState
        title="Nenhuma ação registrada"
        description="As ações realizadas no sistema aparecerão aqui."
      />
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <article
          key={action.id}
          className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={
                    ACTION_HISTORY_TYPE_LABELS[action.actionType] ??
                    action.actionType
                  }
                  tone={getActionTone(action.actionType)}
                />
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]">
                  {ACTION_HISTORY_ENTITY_LABELS[action.entityType] ??
                    action.entityType}
                </span>
              </div>

              <p className="mt-2 font-semibold text-[var(--text-main)]">
                {action.description || action.label}
              </p>

              {action.label && action.description !== action.label ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {action.label}
                </p>
              ) : null}

              {renderPayloadSummary(action)}
            </div>

            <div className="text-sm text-[var(--muted)] lg:text-right">
              <p>{formatDateTimePtBR(action.createdAt)}</p>
              {action.entityId ? (
                <p className="mt-1 break-all font-mono text-xs">
                  {action.entityId}
                </p>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
