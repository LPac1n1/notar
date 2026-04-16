export default function TextInput({
  className = "",
  ...props
}) {
  return (
    <input
      className={`w-full rounded-2xl border border-[var(--line)] bg-[color:var(--surface-elevated)] px-4 py-3 text-[var(--text-main)] shadow-[0_8px_22px_-18px_rgba(0,0,0,0.4)] outline-none transition-all duration-200 placeholder:text-[var(--muted)] focus:border-[var(--line-strong)] focus:bg-[color:var(--surface-muted)] focus:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.48)] ${className}`.trim()}
      {...props}
    />
  );
}
