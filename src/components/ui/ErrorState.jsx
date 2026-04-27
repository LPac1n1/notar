import Button from "./Button";
import { WarningIcon } from "./icons";

export default function ErrorState({
  actionLabel = "",
  description = "Tente novamente em alguns instantes.",
  onAction,
  title = "Nao foi possivel carregar os dados",
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--danger-line)] bg-[color:var(--danger-soft)] p-6 text-center"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--danger-line)] bg-[color:var(--surface-elevated)] text-[var(--danger)]">
        <WarningIcon className="h-6 w-6" />
      </div>
      <p className="mb-2 font-[var(--font-display)] text-xl font-semibold text-[var(--text-main)]">
        {title}
      </p>
      <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--text-soft)]">
        {description}
      </p>
      {actionLabel && onAction ? (
        <div className="mt-4">
          <Button variant="subtle" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
