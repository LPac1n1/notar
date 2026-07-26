import CopyableValue from "../../../components/ui/CopyableValue";
import Modal from "../../../components/ui/Modal";
import {
  DemandIcon,
  DonorIcon,
  ImportIcon,
  MonthlyIcon,
  SearchIcon,
  WarningIcon,
} from "../../../components/ui/icons";
import CopyableCpf from "../../donors/components/CopyableCpf";
import CopyableDonorName from "../../donors/components/CopyableDonorName";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import DetailList from "./DetailList";
import MetricCard from "./MetricCard";

/**
 * All Dashboard drill-down modals consolidated in one place. Each branch is a
 * thin presentational component that reads from the dashboard payload and
 * forwards interactions back to the parent (close + open-donor-profile).
 *
 * The Dashboard page picks which one to render via `activeModal`; this module
 * keeps the JSX out of `Dashboard.jsx` so the page file focuses on layout
 * rather than per-modal copy and grids.
 */
export default function DashboardModals({
  activeModal,
  dashboard,
  totals,
  latestMonth,
  inconsistencies,
  onClose,
  openDonorProfile,
}) {
  if (!activeModal) {
    return null;
  }

  if (activeModal === "active-donors") {
    return (
      <Modal
        title="Doadores ativos"
        description={`${formatInteger(totals.donorCount)} doador(es) ativo(s) no sistema.`}
        icon={<DonorIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        <DetailList emptyMessage="Nenhum doador ativo cadastrado no momento.">
          {dashboard?.activeDonors?.map((donor) => (
            <div
              key={donor.donorId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <CopyableDonorName
                name={donor.donorName}
                onClick={() => openDonorProfile(donor.donorId)}
              />
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                <CopyableCpf value={donor.cpf} />
                <span>• Demanda: {donor.demand || "Não informada"}</span>
              </p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Início: {donor.donationStartDate ? formatMonthYear(donor.donationStartDate) : "Não informado"}
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "active-demands") {
    return (
      <Modal
        title="Demandas ativas"
        description={`${formatInteger(totals.demandCount)} demanda(s) ativa(s) no sistema.`}
        icon={<DemandIcon className="h-5 w-5" />}
        onClose={onClose}
        size="sm"
      >
        <DetailList emptyMessage="Nenhuma demanda ativa cadastrada no momento.">
          {dashboard?.activeDemands?.map((demand) => (
            <div
              key={demand.demandId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">{demand.demandName}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {formatInteger(demand.donorCount)} doador(es) vinculados
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "imports") {
    return (
      <Modal
        title="Importações processadas"
        description={`${formatInteger(totals.importCount)} importação(ões) no total, com ${formatInteger(totals.processedImportCount)} processada(s).`}
        icon={<ImportIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        <DetailList emptyMessage="Nenhuma importação processada ainda.">
          {dashboard?.recentImports?.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">
                {formatMonthYear(item.referenceMonth)}
              </p>
              <p className="mt-1 break-all text-sm text-[var(--muted)]">
                {item.fileName}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {formatInteger(item.matchedRows)} linha(s) compatíveis • {formatInteger(item.matchedDonors)} doador(es) que doaram
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Valor por nota: {formatCurrency(item.valuePerNote)}
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "latest-month" && latestMonth) {
    return (
      <Modal
        title={`Último mês importado: ${formatMonthYear(latestMonth.referenceMonth)}`}
        description="Resumo consolidado do mês mais recente processado."
        icon={<MonthlyIcon className="h-5 w-5" />}
        onClose={onClose}
        size="xl"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Notas no mês" value={formatInteger(latestMonth.totalNotes)} />
          <MetricCard label="Valor por nota" value={formatCurrency(latestMonth.valuePerNote)} />
          <MetricCard label="Total a abater" value={formatCurrency(latestMonth.totalAbatement)} />
          <MetricCard label="Pendentes" value={formatInteger(latestMonth.pendingCount)} />
          <MetricCard label="Realizados" value={formatInteger(latestMonth.appliedCount)} />
        </div>

        <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-soft)]">
          <p className="break-all">
            Arquivo: <span className="font-medium text-[var(--text-main)]">{latestMonth.fileName}</span>
          </p>
          <p className="mt-1">
            Importado em <span className="font-medium text-[var(--text-main)]">{formatDatePtBR(latestMonth.importedAt)}</span>
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {dashboard?.demandBreakdown?.length ? (
            dashboard.demandBreakdown.map((item) => (
              <div
                key={item.demand}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-[var(--text-main)]">{item.demand}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {formatInteger(item.donorCount)} doador(es) • {formatInteger(item.totalNotes)} nota(s)
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--text-main)]">
                    {formatCurrency(item.totalAbatement)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
              Nenhuma consolidação por demanda disponível para este mês.
            </div>
          )}
        </div>
      </Modal>
    );
  }

  if (activeModal === "latest-pending" && latestMonth) {
    return (
      <Modal
        title="Abatimentos pendentes"
        description={`Itens pendentes em ${formatMonthYear(latestMonth.referenceMonth)}.`}
        icon={<WarningIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        <DetailList emptyMessage="Nenhum abatimento pendente neste mês.">
          {dashboard?.latestMonthPendingSummaries?.map((item) => (
            <div
              key={item.donorId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <CopyableDonorName
                name={item.donorName}
                onClick={() => openDonorProfile(item.donorId)}
              />
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                <CopyableCpf value={item.cpf} />
                <span>• {item.demand}</span>
              </p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                {formatInteger(item.notesCount)} nota(s) • {formatCurrency(item.abatementAmount)}
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "latest-unregistered" && latestMonth) {
    return (
      <Modal
        title="CPFs não cadastrados no último mês"
        description={`CPFs encontrados em ${formatMonthYear(latestMonth.referenceMonth)} sem doador correspondente.`}
        icon={<SearchIcon className="h-5 w-5" />}
        onClose={onClose}
        size="xl"
      >
        <DetailList emptyMessage="Nenhum CPF não cadastrado neste mês.">
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard?.latestMonthUnregisteredCpfSamples?.map((item) => (
              <div
                key={item.cpf}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
              >
                <p className="font-medium text-[var(--text-main)]">
                  <CopyableCpf value={item.cpf} />
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatInteger(item.notesCount)} nota(s) no mês
                </p>
              </div>
            ))}
          </div>
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-before-start") {
    return (
      <Modal
        title="Doações antes do início cadastrado"
        description="Casos em que um CPF vinculado apareceu antes do mês de início informado."
        icon={<WarningIcon className="h-5 w-5" />}
        onClose={onClose}
      >
        <DetailList emptyMessage="Nenhuma inconsistência desse tipo encontrada.">
          {inconsistencies.donationStartConflictSamples.map((item) => (
            <div
              key={`${item.cpf}-${item.referenceMonth}`}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">
                <CopyableValue copyLabel="Copiar nome" value={item.sourceName}>
                  <span>{item.sourceName}</span>
                </CopyableValue>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                <CopyableCpf value={item.cpf} />
                <span>• Vinculado ao doador</span>
                <CopyableDonorName
                  className="text-[var(--text-soft)]"
                  name={item.donorName}
                  onClick={() => openDonorProfile(item.donorId)}
                />
              </p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Apareceu em {formatMonthYear(item.referenceMonth)}, mas o início é {formatMonthYear(item.donationStartDate)}.
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-without-demand") {
    return (
      <Modal
        title="Doadores sem demanda"
        description="Cadastros ativos que ainda não têm demanda vinculada."
        icon={<DemandIcon className="h-5 w-5" />}
        onClose={onClose}
      >
        <DetailList emptyMessage="Nenhum doador sem demanda encontrado.">
          {inconsistencies.donorWithoutDemandSamples.map((item) => (
            <div
              key={item.donorId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <CopyableDonorName
                name={item.donorName}
                onClick={() => openDonorProfile(item.donorId)}
              />
              <p className="mt-2 text-sm text-[var(--muted)]">
                <CopyableCpf value={item.cpf} />
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-without-start") {
    return (
      <Modal
        title="Doadores sem início das doações"
        description="CPFs vinculados que ainda não têm mês de início informado."
        icon={<MonthlyIcon className="h-5 w-5" />}
        onClose={onClose}
      >
        <DetailList emptyMessage="Nenhum doador sem início encontrado.">
          {inconsistencies.donorWithoutStartDateSamples.map((item) => (
            <div
              key={item.sourceId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">
                <CopyableValue copyLabel="Copiar nome" value={item.sourceName}>
                  <span>{item.sourceName}</span>
                </CopyableValue>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
                <CopyableCpf value={item.cpf} />
                <span>• {item.sourceType === "holder" ? "Titular" : "Auxiliar"}</span>
              </p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Doador{" "}
                <CopyableDonorName
                  className="text-[var(--text-soft)]"
                  name={item.donorName}
                  onClick={() => openDonorProfile(item.donorId)}
                />
                {" "}• Demanda: {item.demand || "Não informada"}
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-empty-imports") {
    return (
      <Modal
        title="Importações vazias"
        description="Planilhas processadas sem nenhuma linha consolidada. Vale conferir se o arquivo, aba ou coluna de CPF estavam corretos."
        icon={<ImportIcon className="h-5 w-5" />}
        onClose={onClose}
      >
        <DetailList emptyMessage="Nenhuma importação vazia encontrada.">
          {inconsistencies.emptyImportSamples.map((item) => (
            <div
              key={item.importId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">
                {formatMonthYear(item.referenceMonth)}
              </p>
              <p className="mt-1 break-all text-sm text-[var(--muted)]">
                {item.fileName}
              </p>
              <p className="mt-1 text-sm text-[var(--warning)]">
                Nenhuma linha válida foi consolidada.
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-import-errors") {
    return (
      <Modal
        title="Importações com erro"
        description="Planilhas que falharam durante o processamento e continuam sem dados consolidados."
        icon={<ImportIcon className="h-5 w-5" />}
        onClose={onClose}
      >
        <DetailList emptyMessage="Nenhuma importação com erro encontrada.">
          {inconsistencies.importErrorSamples.map((item) => (
            <div
              key={item.importId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-medium text-[var(--text-main)]">
                {item.referenceMonth ? formatMonthYear(item.referenceMonth) : "Mês não identificado"}
              </p>
              <p className="mt-1 break-all text-sm text-[var(--muted)]">
                {item.fileName}
              </p>
              {item.notes ? (
                <p className="mt-1 text-sm text-[var(--danger)]">{item.notes}</p>
              ) : null}
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-exceeded-abatement") {
    return (
      <Modal
        title="Abatimento acima do crédito"
        description="Doadores cujo total abatido (realizado) já ultrapassa o crédito real que a NFP liberou para eles até o momento."
        icon={<WarningIcon className="h-5 w-5" />}
        onClose={onClose}
      >
        <DetailList emptyMessage="Nenhum doador com abatimento acima do crédito.">
          {inconsistencies.exceededAbatementSamples.map((item) => (
            <div
              key={item.donorId}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <CopyableDonorName
                name={item.donorName}
                onClick={() => openDonorProfile(item.donorId)}
              />
              <p className="mt-2 text-sm text-[var(--muted)]">
                Abatido: {formatCurrency(item.totalApplied)} · Crédito real:{" "}
                {formatCurrency(item.totalCredit)}
              </p>
              <p className="mt-1 text-sm text-[var(--danger)]">
                {formatCurrency(item.totalApplied - item.totalCredit)} a mais
                que o crédito gerado.
              </p>
            </div>
          ))}
        </DetailList>
      </Modal>
    );
  }

  return null;
}
