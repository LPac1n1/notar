export default function Skeleton({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-[color:var(--surface-muted)] ${className}`.trim()}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === lines - 1 ? "w-8/12" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({
  className = "",
  loadingLabel = "Carregando informações",
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-4 ${className}`.trim()}
    >
      <span className="sr-only">{loadingLabel}</span>
      <div aria-hidden="true">
        <Skeleton className="mb-4 h-4 w-5/12" />
        <Skeleton className="mb-3 h-7 w-7/12" />
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

export function SkeletonRows({
  rows = 4,
  className = "",
  loadingLabel = "Carregando lista",
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`space-y-3 ${className}`.trim()}
    >
      <span className="sr-only">{loadingLabel}</span>
      <div aria-hidden="true" className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <Skeleton className="mb-3 h-4 w-5/12" />
                <SkeletonText lines={2} />
              </div>
              <div>
                <Skeleton className="mb-3 h-4 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
