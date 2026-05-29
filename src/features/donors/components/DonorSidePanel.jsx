import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../../components/ui/Button";
import Drawer from "../../../components/ui/Drawer";
import StatusBadge from "../../../components/ui/StatusBadge";
import CopyableValue from "../../../components/ui/CopyableValue";
import { LoadingIcon } from "../../../components/ui/icons";
import Sparkline from "../../../components/ui/Sparkline";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { getDonorProfile } from "../../../services/donorService";
import { getDonor6MonthHistory } from "../../../services/donor/donorHistory";
import { logError } from "../../../services/logger";
import { formatCpf } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";
import { formatCurrency, formatInteger } from "../../../utils/format";

function StatRow({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        {hint ? (
          <p className="text-[10px] text-[var(--muted)]">{hint}</p>
        ) : null}
      </div>
      <p className="font-mono text-sm font-semibold text-[var(--text-main)]">
        {value}
      </p>
    </div>
  );
}

/**
 * Side panel para "vou conferir esse doador rapidinho" — substitui o
 * full-page navigate pro DonorProfile como first-step. Mostra o
 * essencial (cadastro, demanda, agregados de abatimento, ranking de
 * meses recentes, sparkline 6 meses) e oferece "Abrir perfil completo"
 * pra contextos profundos.
 *
 * Carrega `getDonorProfile` em paralelo com `getDonor6MonthHistory` pra
 * paint inicial em ~1 round-trip. Subscreve `useDatabaseChangeEffect`
 * pros mesmos domínios que o DonorProfile, então edição reflete em
 * tempo real sem o usuário precisar fechar/reabrir.
 */
export default function DonorSidePanel({ donor, onClose, onEdit }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!donor?.id) return undefined;
    let cancelled = false;
    Promise.all([
      getDonorProfile(donor.id),
      getDonor6MonthHistory(donor.id),
    ])
      .then(([profileData, historyData]) => {
        if (cancelled) return;
        setProfile(profileData);
        setHistory(historyData);
      })
      .catch((err) => {
        logError("DonorSidePanel.load", err);
        if (!cancelled) {
          setError("Não foi possível carregar o doador.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [donor?.id]);

  // Refresh em background quando alguém edita o doador. O usuário pode
  // ter feito uma mudança em outra aba/sessão — Supabase sync recarrega.
  useDatabaseChangeEffect(
    async () => {
      if (!donor?.id) return;
      try {
        const next = await getDonorProfile(donor.id);
        setProfile(next);
      } catch (err) {
        logError("DonorSidePanel.refresh", err);
      }
    },
    { domains: ["donors", "monthly"] },
  );

  const goToFullProfile = () => {
    if (!donor?.id) return;
    onClose?.();
    navigate(`/doadores/${encodeURIComponent(donor.id)}`);
  };

  const sparkData = (history ?? []).map((point) => ({
    a: point.abatementAmount,
    b: point.creditValue,
  }));

  const totals = profile?.monthlySummaries?.reduce(
    (acc, row) => {
      const amount = Number(row.abatementAmount ?? 0);
      acc.totalAbatement += amount;
      if (row.abatementStatus === "applied") {
        acc.applied += amount;
        acc.appliedCount += 1;
      }
      if (row.abatementStatus === "pending") {
        acc.pending += amount;
        acc.pendingCount += 1;
      }
      return acc;
    },
    {
      totalAbatement: 0,
      applied: 0,
      pending: 0,
      appliedCount: 0,
      pendingCount: 0,
    },
  ) ?? {
    totalAbatement: 0,
    applied: 0,
    pending: 0,
    appliedCount: 0,
    pendingCount: 0,
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button
        variant="subtle"
        onClick={onClose}
        className="min-h-9 px-3 py-1.5 text-xs"
      >
        Fechar
      </Button>
      <div className="flex flex-wrap gap-2">
        {onEdit ? (
          <Button
            variant="subtle"
            onClick={() => onEdit(donor)}
            className="min-h-9 px-3 py-1.5 text-xs"
          >
            Editar
          </Button>
        ) : null}
        <Button
          variant="primary"
          onClick={goToFullProfile}
          className="min-h-9 px-3 py-1.5 text-xs"
        >
          Abrir perfil completo →
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer
      title={donor?.name || "Doador"}
      description={donor?.demand ? `Demanda: ${donor.demand}` : undefined}
      onClose={onClose}
      size="lg"
      footer={footer}
    >
      {error ? (
        <p className="rounded-md border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {!profile && !error ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <LoadingIcon className="h-4 w-4 animate-spin text-[var(--accent-strong)]" />
          Carregando dados do doador…
        </div>
      ) : null}

      {profile ? (
        <div className="space-y-5">
          {/* Identidade */}
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Cadastro
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={profile.donor.donorType} />
              <StatusBadge
                label={profile.donor.isActive ? "Ativo" : "Inativo"}
                tone={profile.donor.isActive ? "success" : "neutral"}
              />
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-[var(--muted)]">CPF:</span>
                <CopyableValue
                  copyLabel="Copiar CPF"
                  value={formatCpf(profile.donor.cpf)}
                >
                  <span className="font-mono">
                    {formatCpf(profile.donor.cpf)}
                  </span>
                </CopyableValue>
              </div>
              {profile.donor.demand ? (
                <p className="text-[var(--text-soft)]">
                  Demanda: {profile.donor.demand}
                </p>
              ) : (
                <p className="text-[var(--warning)]">Sem demanda definida</p>
              )}
              {profile.donor.donationStartDate ? (
                <p className="text-[var(--text-soft)]">
                  Doações desde{" "}
                  {formatMonthYear(profile.donor.donationStartDate)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Métricas agregadas */}
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Abatimento histórico
            </p>
            <div className="mt-2 divide-y divide-[var(--line)]">
              <StatRow
                label="Total realizado"
                value={formatCurrency(totals.applied)}
                hint={`${formatInteger(totals.appliedCount)} mês(es)`}
              />
              {totals.pending > 0 ? (
                <StatRow
                  label="Pendente"
                  value={formatCurrency(totals.pending)}
                  hint={`${formatInteger(totals.pendingCount)} mês(es)`}
                />
              ) : null}
              <StatRow
                label="Meses com nota"
                value={formatInteger(
                  (profile.monthlyHistory ?? []).filter(
                    (row) => row.notesCount > 0,
                  ).length,
                )}
              />
            </div>
          </div>

          {/* Sparkline 6 meses */}
          {history && history.length > 0 ? (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Últimos 6 meses
              </p>
              <div className="mt-2 flex items-end gap-3">
                <Sparkline
                  data={sparkData}
                  aLabel="Abatimento"
                  bLabel="Crédito NFP"
                />
                <div className="flex flex-col gap-0.5 text-[10px] leading-tight text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-sm bg-[var(--accent)]"
                    />
                    Abatido
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-sm bg-[var(--success)]"
                    />
                    Crédito NFP
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Meses recentes */}
          {profile.monthlyHistory && profile.monthlyHistory.length > 0 ? (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Últimos meses
              </p>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {profile.monthlyHistory.slice(0, 6).map((row) => (
                  <li
                    key={row.referenceMonth}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="text-[var(--text-soft)]">
                      {formatMonthYear(row.referenceMonth)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[var(--text-main)]">
                        {formatCurrency(row.abatementAmount)}
                      </span>
                      <StatusBadge
                        label={
                          row.abatementStatus === "applied"
                            ? "Realizado"
                            : "Pendente"
                        }
                        tone={
                          row.abatementStatus === "applied"
                            ? "success"
                            : "warning"
                        }
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
