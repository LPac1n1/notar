import CopyButton from "./CopyButton";

export default function CopyableValue({
  children,
  className = "",
  copyLabel = "Copiar",
  value,
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`.trim()}>
      <span className="min-w-0">{children ?? value}</span>
      <CopyButton label={copyLabel} value={value} />
    </span>
  );
}
