import Button from "./Button";
import { WarningIcon } from "./icons";

export default function ErrorState({
  actionLabel = "",
  description = "Tente novamente em alguns instantes.",
  onAction,
  secondaryActionLabel = "",
  onSecondaryAction,
  title = "Não foi possível carregar os dados",
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--danger-line)] bg-[color:var(--danger-soft)] p-6 text-center"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--danger-line)] bg-[color:var(--surface-elevated)] text-[var(--danger)]">
        <WarningIcon className="h-6 w-6" />
      </div>
      <p className="mb-2 font-display text-xl font-semibold text-[var(--text-main)]">
        {title}
      </p>
      <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--text-soft)]">
        {description}
      </p>
      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          {actionLabel && onAction ? (
            <Button variant="subtle" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <Button variant="ghost" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
