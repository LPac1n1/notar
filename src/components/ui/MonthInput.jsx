import { useId, useState } from "react";

function formatDisplayValue(value) {
  const text = String(value ?? "");

  if (/^\d{4}-\d{2}/.test(text)) {
    return `${text.slice(5, 7)}/${text.slice(0, 4)}`;
  }

  if (/^\d{2}\/\d{4}$/.test(text)) {
    return text;
  }

  return "";
}

function maskMonth(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 6);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function toIsoMonth(value) {
  if (!/^\d{2}\/\d{4}$/.test(value)) {
    return "";
  }

  const [month, year] = value.split("/");
  const monthNumber = Number(month);

  if (monthNumber < 1 || monthNumber > 12) {
    return "";
  }

  return `${year}-${month}`;
}

export default function MonthInput({
  className = "",
  description = "",
  error = "",
  hideLabel = false,
  id,
  label = "",
  name,
  onChange,
  placeholder = "MM/AAAA",
  value = "",
  wrapperClassName = "",
}) {
  const generatedId = useId();
  const inputId = id || name || generatedId;
  const [draftValue, setDraftValue] = useState(formatDisplayValue(value));
  const [isEditing, setIsEditing] = useState(false);
  const displayValue = isEditing ? draftValue : formatDisplayValue(value);
  const hasInvalidFullValue =
    displayValue.length === 7 && !toIsoMonth(displayValue);
  const hasError = Boolean(error) || hasInvalidFullValue;
  const descriptionId = description ? `${inputId}-description` : "";
  const errorId = hasError ? `${inputId}-error` : "";
  const ariaDescribedBy = [descriptionId, errorId]
    .filter(Boolean)
    .join(" ");

  const handleChange = (event) => {
    const nextDisplayValue = maskMonth(event.target.value);
    setDraftValue(nextDisplayValue);

    if (!nextDisplayValue) {
      onChange?.({ target: { name, value: "" } });
      return;
    }

    const nextIsoMonth = toIsoMonth(nextDisplayValue);

    if (nextIsoMonth) {
      onChange?.({ target: { name, value: nextIsoMonth } });
    }
  };

  return (
    <div className={`space-y-1.5 ${wrapperClassName} ${className}`.trim()}>
      {label ? (
        <label
          htmlFor={inputId}
          className={
            hideLabel
              ? "sr-only"
              : "block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
          }
        >
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        inputMode="numeric"
        name={name}
        placeholder={placeholder}
        value={displayValue}
        onBlur={() => {
          setIsEditing(false);
          setDraftValue(formatDisplayValue(value));
        }}
        onChange={handleChange}
        onFocus={() => {
          setIsEditing(true);
          setDraftValue(formatDisplayValue(value));
        }}
        aria-describedby={ariaDescribedBy || undefined}
        aria-invalid={hasError}
        className={`w-full rounded-md border bg-[var(--surface-elevated)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:bg-[var(--surface-muted)] ${
          hasError
            ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
            : "border-[var(--line)] focus:border-[var(--accent)]"
        }`}
      />

      {description ? (
        <p
          id={descriptionId}
          className="text-xs leading-5 text-[var(--muted)]"
        >
          {description}
        </p>
      ) : null}

      {hasError ? (
        <p
          id={errorId}
          className="text-xs leading-5 text-[var(--danger)]"
        >
          {error || "Informe um mês válido no formato MM/AAAA."}
        </p>
      ) : null}
    </div>
  );
}
