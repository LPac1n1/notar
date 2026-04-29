import Loader from "./Loader";
import { SkeletonRows } from "./Skeleton";

export default function DataSyncSectionLoading({
  className = "",
  description = "Atualizando esta área com os dados importados.",
  message = "Carregando dados",
  rows = 4,
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`space-y-3 ${className}`.trim()}
    >
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3">
        <Loader label={message} />
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          {description}
        </p>
      </div>
      <SkeletonRows rows={rows} />
    </div>
  );
}
