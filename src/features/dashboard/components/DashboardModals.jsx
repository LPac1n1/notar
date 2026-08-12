import Button from "../../../components/ui/Button";
import CopyableValue from "../../../components/ui/CopyableValue";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
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
import { describeInactivity } from "../../../services/monthly/inactivityStreaks";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";
import DetailList from "./DetailList";
import InconsistencyRow from "./InconsistencyRow";
import { DemandFix, StartDateFix } from "./InconsistencyFixes";
import MetricCard from "./MetricCard";

/**
 * All Dashboard drill-down modals consolidated in one place.
 *
 * The "Pontos para revisar" branches are not read-only: each row carries the
 * actions that actually clear the item (fix the offending field inline, open
 * the profile, delete, deactivate, jump to Importações). The mutations
 * themselves live in `useDashboardActions` — this module only wires the
 * callbacks to rows, so the file stays declarative.
 *
 * The Dashboard page picks which one to render via `activeModal`; this module
 * keeps the JSX out of `Dashboard.jsx` so the page file focuses on layout
 * rather than per-modal copy and grids.
 */
export default function DashboardModals({
  activeModal,
  actions = null,
  dashboard,
  totals,
  latestMonth,
  inconsistencies,
  onClose,
  onOpenImports,
  openDonorProfile,
}) {
  if (!activeModal) {
    return null;
  }

  const demandNames = (dashboard?.activeDemands ?? []).map(
    (demand) => demand.demandName,
  );

  // Faixa de feedback compartilhada por todos os modais acionáveis. Fica no
  // topo do corpo do modal (e não como toast de página) porque a ação foi
  // disparada aqui dentro — um toast flutuante disputaria o empilhamento com
  // o overlay. Daí o `persistent`, que força o formato de faixa inline.
  const feedback = actions ? (
    <>
      <FeedbackMessage
        message={actions.actionError}
        persistent
        tone="error"
      />
      <FeedbackMessage
        actionLabel={actions.actionSuccessAction?.label ?? ""}
        message={actions.actionSuccessMessage}
        onAction={actions.actionSuccessAction?.onAction}
        persistent
        tone="success"
      />
    </>
  ) : null;

  const profileAction = (donorId) => (
    <Button
      variant="subtle"
      className="px-3 py-1.5 text-xs"
      onClick={() => openDonorProfile(donorId)}
    >
      Ver perfil
    </Button>
  );

  // Importação quebrada não tem correção inline: o conserto é reenviar a
  // planilha certa. Então a ação daqui é levar até a tela que faz isso.
  const importsAction = onOpenImports ? (
    <Button
      variant="subtle"
      className="px-3 py-1.5 text-xs"
      onClick={onOpenImports}
    >
      Ir para Importações
    </Button>
  ) : null;

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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
        description="Casos em que um CPF vinculado apareceu antes do mês de início informado. O campo já vem preenchido com o mês da doação — salvar recua o início para cobri-la."
        icon={<WarningIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        {feedback}
        <DetailList emptyMessage="Nenhuma inconsistência desse tipo encontrada.">
          {inconsistencies.donationStartConflictRows.map((item) => {
            const rowId = `${item.cpf}-${item.referenceMonth}`;

            return (
              <InconsistencyRow
                key={rowId}
                title={
                  <p className="font-medium text-[var(--text-main)]">
                    <CopyableValue copyLabel="Copiar nome" value={item.sourceName}>
                      <span>{item.sourceName}</span>
                    </CopyableValue>
                  </p>
                }
                meta={
                  <>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <CopyableCpf value={item.cpf} />
                      <span>• Vinculado ao doador</span>
                      <CopyableDonorName
                        className="text-[var(--text-soft)]"
                        name={item.donorName}
                        onClick={() => openDonorProfile(item.donorId)}
                      />
                    </span>
                    <span className="mt-1.5 block">
                      Apareceu em {formatMonthYear(item.referenceMonth)}, mas o início é {formatMonthYear(item.donationStartDate)}.
                    </span>
                  </>
                }
                fix={
                  actions ? (
                    <StartDateFix
                      actionLabel="Corrigir início"
                      initialValue={String(item.referenceMonth ?? "").slice(0, 7)}
                      isBusy={actions.busyRowId === rowId}
                      label="Novo início das doações"
                      onSubmit={(month) =>
                        actions.setDonationStartDate(rowId, item.donorId, month)
                      }
                    />
                  ) : null
                }
                actions={profileAction(item.donorId)}
              />
            );
          })}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-without-demand") {
    return (
      <Modal
        title="Doadores sem demanda"
        description="Cadastros ativos que ainda não têm demanda vinculada. Escolha a demanda abaixo para resolver, ou exclua o cadastro."
        icon={<DemandIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        {feedback}
        <DetailList emptyMessage="Nenhum doador sem demanda encontrado.">
          {inconsistencies.donorWithoutDemandRows.map((item) => (
            <InconsistencyRow
              key={item.donorId}
              title={
                <CopyableDonorName
                  name={item.donorName}
                  onClick={() => openDonorProfile(item.donorId)}
                />
              }
              meta={<CopyableCpf value={item.cpf} />}
              fix={
                actions ? (
                  <DemandFix
                    demands={demandNames}
                    isBusy={actions.busyRowId === item.donorId}
                    onSubmit={(demand) =>
                      actions.setDonorDemand(item.donorId, item.donorId, demand)
                    }
                  />
                ) : null
              }
              actions={profileAction(item.donorId)}
              onDelete={
                actions
                  ? () =>
                      actions.removeDonor(item.donorId, item.donorId, item.donorName)
                  : undefined
              }
              deleteLabel="Excluir doador"
              deleteHint={`Excluir ${item.donorName}?`}
              isBusy={actions?.busyRowId === item.donorId}
            />
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-without-start") {
    return (
      <Modal
        title="Doadores sem início das doações"
        description="CPFs vinculados que ainda não têm mês de início informado. Informe o mês abaixo para resolver, ou exclua o cadastro."
        icon={<MonthlyIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        {feedback}
        <DetailList emptyMessage="Nenhum doador sem início encontrado.">
          {inconsistencies.donorWithoutStartDateRows.map((item) => (
            <InconsistencyRow
              key={item.sourceId}
              title={
                <p className="font-medium text-[var(--text-main)]">
                  <CopyableValue copyLabel="Copiar nome" value={item.sourceName}>
                    <span>{item.sourceName}</span>
                  </CopyableValue>
                </p>
              }
              meta={
                <>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <CopyableCpf value={item.cpf} />
                    <span>• {item.sourceType === "holder" ? "Titular" : "Auxiliar"}</span>
                    <span>• Demanda: {item.demand || "Não informada"}</span>
                  </span>
                </>
              }
              fix={
                actions ? (
                  <StartDateFix
                    isBusy={actions.busyRowId === item.sourceId}
                    onSubmit={(month) =>
                      actions.setDonationStartDate(item.sourceId, item.donorId, month)
                    }
                  />
                ) : null
              }
              actions={profileAction(item.donorId)}
              onDelete={
                actions
                  ? () =>
                      actions.removeDonor(item.sourceId, item.donorId, item.donorName)
                  : undefined
              }
              deleteLabel="Excluir doador"
              deleteHint={`Excluir ${item.donorName}?`}
              isBusy={actions?.busyRowId === item.sourceId}
            />
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
        size="lg"
      >
        {feedback}
        <DetailList emptyMessage="Nenhuma importação vazia encontrada.">
          {inconsistencies.emptyImportRows.map((item) => (
            <InconsistencyRow
              key={item.importId}
              title={
                <p className="font-medium text-[var(--text-main)]">
                  {formatMonthYear(item.referenceMonth)}
                </p>
              }
              meta={
                <>
                  <span className="block break-all">{item.fileName}</span>
                  <span className="mt-1 block text-[var(--warning)]">
                    Nenhuma linha válida foi consolidada.
                  </span>
                </>
              }
              actions={importsAction}
              onDelete={
                actions
                  ? () =>
                      actions.removeImport(
                        item.importId,
                        item.importId,
                        formatMonthYear(item.referenceMonth),
                      )
                  : undefined
              }
              deleteLabel="Excluir importação"
              deleteHint="Excluir esta importação?"
              isBusy={actions?.busyRowId === item.importId}
            />
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
        size="lg"
      >
        {feedback}
        <DetailList emptyMessage="Nenhuma importação com erro encontrada.">
          {inconsistencies.importErrorRows.map((item) => (
            <InconsistencyRow
              key={item.importId}
              title={
                <p className="font-medium text-[var(--text-main)]">
                  {item.referenceMonth ? formatMonthYear(item.referenceMonth) : "Mês não identificado"}
                </p>
              }
              meta={
                <>
                  <span className="block break-all">{item.fileName}</span>
                  {item.notes ? (
                    <span className="mt-1 block text-[var(--danger)]">{item.notes}</span>
                  ) : null}
                </>
              }
              actions={importsAction}
              onDelete={
                actions
                  ? () =>
                      actions.removeImport(
                        item.importId,
                        item.importId,
                        item.referenceMonth
                          ? formatMonthYear(item.referenceMonth)
                          : "mês não identificado",
                      )
                  : undefined
              }
              deleteLabel="Excluir importação"
              deleteHint="Excluir esta importação?"
              isBusy={actions?.busyRowId === item.importId}
            />
          ))}
        </DetailList>
      </Modal>
    );
  }

  if (activeModal === "inconsistency-inactive-donors") {
    return (
      <Modal
        title="Doadores que pararam de doar"
        description="Doadores ativos sem nenhuma nota nos últimos meses importados. Use como lista de contato para confirmar se o CPF segue cadastrado nos estabelecimentos — e, se não seguir, desative o doador aqui mesmo."
        icon={<WarningIcon className="h-5 w-5" />}
        onClose={onClose}
        size="lg"
      >
        {feedback}
        <DetailList emptyMessage="Todos os doadores ativos enviaram notas recentemente.">
          {inconsistencies.inactiveDonors?.map((item) => (
            <InconsistencyRow
              key={item.donorId}
              title={
                <CopyableDonorName
                  name={item.donorName}
                  onClick={() => openDonorProfile(item.donorId)}
                />
              }
              badge={
                <span
                  className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${
                    describeInactivity(item).tone === "danger"
                      ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]"
                      : "border-[var(--warning-line)] bg-[color:var(--warning-soft)] text-[var(--warning)]"
                  }`}
                >
                  {describeInactivity(item).label}
                </span>
              }
              meta={
                <>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <CopyableCpf value={item.cpf} />
                    <span>• {item.donorType === "auxiliary" ? "Auxiliar" : "Titular"}</span>
                    <span>• Demanda: {item.demand || "Não informada"}</span>
                  </span>
                  <span className="mt-1.5 block">
                    {item.hasNeverDonated
                      ? "Nenhuma nota registrada desde o início das doações informado."
                      : `Última doação em ${formatMonthYear(item.lastDonationMonth)}.`}
                  </span>
                </>
              }
              fix={
                actions ? (
                  <StartDateFix
                    actionLabel="Desativar"
                    isBusy={actions.busyRowId === item.donorId}
                    label="Desativar a partir de"
                    onSubmit={(month) =>
                      actions.deactivate(item.donorId, item.donorId, item.donorName, month)
                    }
                  />
                ) : null
              }
              actions={profileAction(item.donorId)}
              onDelete={
                actions
                  ? () =>
                      actions.removeDonor(item.donorId, item.donorId, item.donorName)
                  : undefined
              }
              deleteLabel="Excluir doador"
              deleteHint={`Excluir ${item.donorName}?`}
              isBusy={actions?.busyRowId === item.donorId}
            />
          ))}
        </DetailList>
      </Modal>
    );
  }

  return null;
}
