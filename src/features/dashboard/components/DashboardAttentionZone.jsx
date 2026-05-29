import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import { WarningIcon } from "../../../components/ui/icons";

const SEVERITY_STYLES = {
  danger: {
    container:
      "border-[var(--danger-line)] bg-[var(--danger-soft)]",
    iconWrap:
      "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-line)]",
    title: "text-[var(--danger)]",
    buttonVariant: "danger",
  },
  warning: {
    container:
      "border-[var(--warning-line)] bg-[var(--warning-soft)]",
    iconWrap:
      "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning-line)]",
    title: "text-[var(--warning)]",
    buttonVariant: "primary",
  },
  info: {
    container: "border-[var(--line)] bg-[var(--surface-elevated)]",
    iconWrap:
      "bg-[var(--surface-strong)] text-[var(--muted-strong)] border border-[var(--line)]",
    title: "text-[var(--text-main)]",
    buttonVariant: "subtle",
  },
};

/**
 * One actionable card in the Atenção zone. Visual hierarchy is driven by
 * `severity` — danger items pop, info items recede. Always exactly one
 * primary CTA so the operator never has to choose.
 */
function AttentionCard({ item, onAction }) {
  const styles = SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className={`flex items-start gap-4 rounded-md border p-4 ${styles.container}`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${styles.iconWrap}`}
        aria-hidden="true"
      >
        <WarningIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${styles.title}`}>{item.title}</p>
        <p className="mt-1 text-sm text-[var(--text-soft)]">
          {item.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={styles.buttonVariant}
            className="min-h-9 px-3 py-1.5 text-xs"
            onClick={() => onAction(item.primaryAction)}
          >
            {item.primaryAction.label}
          </Button>
          {item.secondaryAction ? (
            <Button
              variant="subtle"
              className="min-h-9 px-3 py-1.5 text-xs"
              onClick={() => onAction(item.secondaryAction)}
            >
              {item.secondaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Zona 1 of the Dashboard — "o que precisa de você agora". Renders nothing
 * when the system is in a healthy state, which by design teaches the user
 * that emptiness = green light.
 *
 * The container itself has no header — the cards each carry their context.
 * A heading would imply this section is always there, which would dilute
 * the signal value of it appearing.
 */
export default function DashboardAttentionZone({ items }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) {
    return null;
  }

  const handleAction = (action) => {
    if (!action) return;
    if (action.kind === "navigate" && action.payload) {
      navigate(action.payload);
    }
  };

  return (
    <section aria-label="Atenção necessária" className="mb-6 space-y-3">
      {items.map((item) => (
        <AttentionCard key={item.id} item={item} onAction={handleAction} />
      ))}
    </section>
  );
}
