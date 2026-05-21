import { motion as Motion, useReducedMotion } from "framer-motion";
import { EmptyIcon } from "./icons";

export default function EmptyState({ title, description, action }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0.08 : 0.2 }}
      className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-strong)] p-6 text-center"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)] text-[var(--accent)]">
        <EmptyIcon className="h-6 w-6" />
      </div>
      <p className="mb-2 font-display text-xl font-semibold text-[var(--text-main)]">
        {title}
      </p>
      <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Motion.div>
  );
}
