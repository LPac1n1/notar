import { CheckIcon, WarningIcon } from "./icons";

/**
 * Visual confirmation of column auto-detection. Used right after a planilha
 * preview to surface what the parser actually claimed for each schema
 * field — exposes a silently-missing header before the user commits to a
 * 30k+ row INSERT.
 *
 * @param {object} props
 * @param {Array<{ key: string, label: string, required?: boolean, detectedColumn: string }>} props.fields
 *   Each field has a stable `key`, a human `label` (Portuguese), an optional
 *   `required` flag (true when the import is rejected without it), and the
 *   `detectedColumn` (file header that the parser matched, or empty when
 *   none).
 * @param {string} [props.title] — Header for the panel.
 */
export default function DetectedColumnsChecklist({
  fields,
  title = "Colunas detectadas",
}) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </p>
      <ul className="grid gap-1 md:grid-cols-2">
        {fields.map((field) => {
          const detected = Boolean(field.detectedColumn);
          const isRequiredMissing = field.required && !detected;
          return (
            <li
              key={field.key}
              className="flex items-center gap-2 text-xs"
            >
              {detected ? (
                <CheckIcon
                  className="h-3.5 w-3.5 shrink-0 text-[var(--success)]"
                  aria-hidden="true"
                />
              ) : (
                <WarningIcon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isRequiredMissing
                      ? "text-[var(--danger)]"
                      : "text-[var(--warning)]"
                  }`}
                  aria-hidden="true"
                />
              )}
              <span className="text-[var(--text-soft)]">
                {field.label}
                {field.required ? (
                  <span className="ml-1 text-[var(--muted)]">(obrigatória)</span>
                ) : null}
              </span>
              <span className="ml-auto truncate font-mono text-[10px] text-[var(--muted)]">
                {detected ? field.detectedColumn : "não encontrada"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
