import CopyableValue from "../../../components/ui/CopyableValue";
import SectionCard from "../../../components/ui/SectionCard";
import { formatInteger } from "../../../utils/format";

export default function DonorCpfSourcesSection({ sources }) {
  return (
    <SectionCard
      title="CPFs de doação"
      description="CPFs usados para localizar as notas nas planilhas importadas."
      className="mb-6"
    >
      <div className="space-y-3">
        {sources.map((source) => (
          <div
            key={source.id}
            className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
          >
            <CopyableValue copyLabel="Copiar nome" value={source.name}>
              <span className="font-semibold text-[var(--text-main)]">
                {source.name}
              </span>
            </CopyableValue>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
              <CopyableValue copyLabel="Copiar CPF" value={source.cpf}>
                <span>{source.cpf}</span>
              </CopyableValue>
            </div>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Início: {source.donationStartDate || "Não informado"} •{" "}
              {formatInteger(source.totalNotes)} nota(s)
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
