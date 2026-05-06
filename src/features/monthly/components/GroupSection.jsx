import { ICON_TONE_CLASS_NAMES } from "../constants";

export default function GroupSection({
  icon,
  title,
  description,
  countLabel,
  tone = "default",
  children,
}) {
  const toneClassName = ICON_TONE_CLASS_NAMES[tone] ?? ICON_TONE_CLASS_NAMES.default;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          {icon ? (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClassName}`}
            >
              {icon}
            </span>
          ) : null}
          <div>
            <h4 className="font-semibold text-[var(--text-main)]">{title}</h4>
            {description ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            ) : null}
          </div>
        </div>

        {countLabel ? (
          <span
            className={`inline-flex w-fit items-center rounded-md border px-3 py-1.5 text-xs font-medium ${toneClassName}`}
          >
            {countLabel}
          </span>
        ) : null}
      </div>

      <div className="space-y-3">{children}</div>
    </section>
  );
}
