import { useId } from "react";
import { FOCUS_RING } from "./focusRing";
import { CheckIcon } from "./icons";

export default function TextInput({
  className = "",
  description = "",
  error = "",
  success = "",
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
  const successId = success ? `${inputId}-success` : "";
  const ariaDescribedBy = [descriptionId, errorId, successId]
    .filter(Boolean)
    .join(" ");

  const borderClass = error
    ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
    : success
    ? "border-[color:var(--success-line)] focus:border-[color:var(--success)]"
    : "";

  return (
    <div className={`space-y-1.5 ${wrapperClassName}`.trim()}>
      {label ? (
        <label
          htmlFor={inputId}
          className={
            hideLabel
              ? "sr-only"
              : "block w-fit text-sm font-medium text-[var(--muted)]"
          }
        >
          {label}
        </label>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          aria-describedby={ariaDescribedBy || undefined}
          aria-invalid={Boolean(error)}
          className={`w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] ${FOCUS_RING} ${success ? "pr-10" : ""} ${borderClass} ${className}`.trim()}
          {...props}
        />
        {success ? (
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <CheckIcon className="h-4 w-4 text-[color:var(--success)]" />
          </div>
        ) : null}
      </div>

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
          className="text-xs leading-5 text-[color:var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      {success && !error ? (
        <p
          id={successId}
          className="text-xs leading-5 text-[color:var(--success)]"
        >
          {success}
        </p>
      ) : null}
    </div>
  );
}
