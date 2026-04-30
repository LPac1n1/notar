import CopyableValue from "../../../components/ui/CopyableValue";

export default function CopyableDonorName({ className = "", name, onClick }) {
  return (
    <CopyableValue copyLabel="Copiar nome" value={name}>
      <button
        type="button"
        onClick={onClick}
        className={`text-left font-medium text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline ${className}`.trim()}
      >
        {name}
      </button>
    </CopyableValue>
  );
}
