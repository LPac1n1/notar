import { useEffect, useState } from "react";

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
  name,
  onChange,
  placeholder = "MM/AAAA",
  value = "",
}) {
  const [displayValue, setDisplayValue] = useState(formatDisplayValue(value));
  const hasInvalidFullValue =
    displayValue.length === 7 && !toIsoMonth(displayValue);

  useEffect(() => {
    setDisplayValue(formatDisplayValue(value));
  }, [value]);

  const handleChange = (event) => {
    const nextDisplayValue = maskMonth(event.target.value);
    setDisplayValue(nextDisplayValue);

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
    <div className={className}>
      <input
        inputMode="numeric"
        name={name}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        className={`w-full rounded-md border bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition-colors duration-150 placeholder:text-slate-500 focus:bg-slate-900 ${
          hasInvalidFullValue
            ? "border-red-400/70 focus:border-red-300"
            : "border-slate-700/80 focus:border-slate-400"
        }`}
      />
      {hasInvalidFullValue ? (
        <p className="mt-1 text-xs text-red-200">
          Informe um mês válido no formato MM/AAAA.
        </p>
      ) : null}
    </div>
  );
}
