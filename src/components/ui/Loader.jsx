import { LoadingIcon } from "./icons";

const SIZE_CLASS_NAMES = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

export default function Loader({
  className = "",
  label = "Carregando",
  showLabel = true,
  size = "md",
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 text-sm text-[var(--text-soft)] ${className}`.trim()}
    >
      <LoadingIcon
        className={`${SIZE_CLASS_NAMES[size] ?? SIZE_CLASS_NAMES.md} animate-spin text-[var(--accent-strong)]`}
      />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}
