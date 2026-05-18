import { useId } from "react";

export default function TextInput({
  className = "",
  description = "",
  error = "",
  hideLabel = false,
  id,
  label = "",
  wrapperClassName = "",
  ...props
}) {
  const generatedId = useId();
  const inputId = id || props.name || generatedId;
  const descriptionId = description ? `${inputId}-description` : "";
  const errorId = error ? `${inputId}-error` : "";
  const ariaDescribedBy = [descriptionId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`space-y-1.5 ${wrapperClassName}`.trim()}>
      {label ? (
        <label
          htmlFor={inputId}
          className={
            hideLabel
              ? "sr-only"
              : "block text-sm font-medium text-[var(--muted)]"
          }
        >
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        aria-describedby={ariaDescribedBy || undefined}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] ${error ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]" : ""} ${className}`.trim()}
        {...props}
      />

      {description ? (
        <p
          id={descriptionId}
          className="text-xs leading-5 text-[var(--muted)]"
        >
          {description}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="text-xs leading-5 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
