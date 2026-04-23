export default function TextInput({
  className = "",
  ...props
}) {
  return (
    <input
      className={`w-full rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface-muted)] ${className}`.trim()}
      {...props}
    />
  );
}
