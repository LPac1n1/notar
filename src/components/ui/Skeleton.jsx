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

export function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-4 ${className}`.trim()}
      aria-hidden="true"
    >
      <Skeleton className="mb-4 h-4 w-5/12" />
      <Skeleton className="mb-3 h-7 w-7/12" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonRows({ rows = 4, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`.trim()} aria-hidden="true">
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
  );
}
