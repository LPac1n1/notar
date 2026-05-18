import CopyableValue from "../../../components/ui/CopyableValue";
import EmptyState from "../../../components/ui/EmptyState";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";

export default function DonorLinkedSection({
  donor,
  auxiliaryDonors,
  onNavigateToRelated,
}) {
  if (donor.donorType === "auxiliary") {
    return (
      <SectionCard title="Vinculado a" className="mb-6">
        {donor.holderDonorId ? (
          <div className="grid gap-3 rounded-md border border-[var(--line-strong)] bg-[var(--surface-elevated)] p-4 text-[var(--text-main)] md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm text-[var(--muted)]">Titular</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <CopyableValue copyLabel="Copiar nome" value={donor.holderName}>
                  <button
                    type="button"
                    onClick={() => onNavigateToRelated(donor.holderDonorId)}
                    className="text-left font-semibold underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                  >
                    {donor.holderName}
                  </button>
                </CopyableValue>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                <CopyableValue copyLabel="Copiar CPF" value={donor.holderCpf}>
                  <span>{donor.holderCpf}</span>
                </CopyableValue>
              </div>
            </div>
            <div className="flex items-start md:justify-end">
              <StatusBadge status="holder" />
            </div>
          </div>
        ) : donor.holderName ? (
          <div className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm text-[var(--muted)]">Pessoa vinculada</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <CopyableValue copyLabel="Copiar nome" value={donor.holderName}>
                  <span className="font-semibold text-[var(--text-main)]">
                    {donor.holderName}
                  </span>
                </CopyableValue>
              </div>
              {donor.holderCpf ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableValue copyLabel="Copiar CPF" value={donor.holderCpf}>
                    <span>{donor.holderCpf}</span>
                  </CopyableValue>
                </div>
              ) : null}
              <p className="mt-2 text-sm text-[var(--muted)]">
                Esta pessoa foi cadastrada apenas para referência e ainda não
                possui papel de doador ativo.
              </p>
            </div>
            <div className="flex items-start md:justify-end">
              <StatusBadge label="Pessoa de referência" tone="neutral" />
            </div>
          </div>
        ) : (
          <EmptyState
            title="Sem pessoa vinculada"
            description="Este auxiliar está cadastrado sem vínculo informativo com outra pessoa."
          />
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Auxiliares vinculados" className="mb-6">
      {auxiliaryDonors.length === 0 ? (
        <EmptyState
          title="Nenhum auxiliar vinculado"
          description="Quando um auxiliar for associado a este titular, ele aparecerá aqui."
        />
      ) : (
        <div className="space-y-3">
          {auxiliaryDonors.map((auxiliary) => (
            <div
              key={auxiliary.id}
              className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto]"
            >
              <div>
                <CopyableValue copyLabel="Copiar nome" value={auxiliary.name}>
                  <button
                    type="button"
                    onClick={() => onNavigateToRelated(auxiliary.id)}
                    className="text-left font-semibold text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                  >
                    {auxiliary.name}
                  </button>
                </CopyableValue>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CopyableValue copyLabel="Copiar CPF" value={auxiliary.cpf}>
                    <span>{auxiliary.cpf}</span>
                  </CopyableValue>
                </div>
              </div>
              <StatusBadge status="auxiliary" />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
