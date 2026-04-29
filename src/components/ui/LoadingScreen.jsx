import { motion as Motion } from "framer-motion";
import { LoadingIcon } from "./icons";

export default function LoadingScreen({
  title = "Carregando dados",
  description = "Preparando as informações do sistema para você.",
  compact = false,
}) {
  const containerClassName = `rounded-md border border-[var(--line)] bg-[var(--surface-strong)] ${compact ? "p-5" : "min-h-[260px] p-6 md:p-8"}`.trim();

  return (
    <Motion.div
      role="status"
      aria-live="polite"
      aria-busy="true"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={containerClassName}
    >
      <div className={`mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center ${compact ? "gap-3" : "gap-4"}`}>
        <div className="flex h-12 w-12 items-center justify-center rounded-md border border-[var(--line)] bg-[color:var(--surface-elevated)]">
          <Motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}
          >
            <LoadingIcon className="h-6 w-6 text-[var(--accent-strong)]" />
          </Motion.div>
        </div>

        <div className="space-y-2">
          <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--text-main)]">
            {title}
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </p>
        </div>

        <div className="grid w-full max-w-sm gap-2">
          {[1, 2, 3].map((item) => (
            <Motion.div
              key={item}
              className={`h-3 rounded-full bg-[color:var(--surface-muted)] ${item === 2 ? "w-10/12" : item === 3 ? "w-8/12" : ""}`.trim()}
              animate={{ opacity: [0.45, 0.95, 0.45], x: ["-4%", "4%", "-4%"] }}
              transition={{
                duration: 1.4,
                ease: "easeInOut",
                repeat: Infinity,
                delay: item * 0.12,
              }}
            />
          ))}
        </div>
      </div>
    </Motion.div>
  );
}
