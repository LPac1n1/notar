import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import StatusBadge from "../components/ui/StatusBadge";
import { BackIcon } from "../components/ui/icons";
import { getDonorProfile } from "../services/donorService";
import { formatMonthYear } from "../utils/date";
import { getErrorMessage } from "../utils/error";
import { formatCurrency } from "../utils/format";
import { useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";

export default function DonorProfile() {
  const { donorId = "" } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const donorProfile = await getDonorProfile(donorId);
      setProfile(donorProfile);
    } catch (err) {
      console.error(
        "Erro ao carregar perfil do doador:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError("Nao foi possivel carregar o perfil do doador.");
    } finally {
      setIsLoading(false);
    }
  }, [donorId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useDatabaseChangeEffect(loadProfile);

  if (isLoading && !profile && !error) {
    return (
      <div>
        <PageHeader
          title="Perfil do doador"
          subtitle="Carregando cadastro, vínculos e histórico mensal."
          className="mb-6"
        />
        <LoadingScreen
          title="Carregando perfil"
          description="Buscando CPFs, abatimentos e vínculos informativos."
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <PageHeader
          title="Perfil do doador"
          subtitle="Não foi possível abrir este cadastro."
          className="mb-6"
        />
        <FeedbackMessage message={error} tone="error" />
        <Button variant="subtle" onClick={() => navigate("/doadores")}>
          Voltar para doadores
        </Button>
      </div>
    );
  }

  const { donor } = profile;

  return (
    <div>
      <PageHeader
        title={donor.name}
        subtitle="Perfil completo do doador, com abatimentos separados e vínculos informativos."
        className="mb-6"
      />
      <FeedbackMessage message={error} tone="error" />

      <div className="mb-6 flex flex-wrap gap-3">
        <Button
          variant="subtle"
          onClick={() => navigate("/doadores")}
          leftIcon={<BackIcon className="h-4 w-4" />}
        >
          Voltar para doadores
        </Button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Tipo</p>
          <div className="mt-2">
            <StatusBadge status={donor.donorType} />
          </div>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">CPF</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">{donor.cpf}</p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Demanda</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {donor.demand || "Nao informada"}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Início das doações</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {donor.donationStartDate || "Nao informado"}
          </p>
        </div>
      </div>

      {donor.donorType === "auxiliary" ? (
        <SectionCard title="Vinculado a" className="mb-6">
          {donor.holderDonorId ? (
            <button
              type="button"
              onClick={() => navigate(`/doadores/${donor.holderDonorId}`)}
              className="grid w-full gap-3 rounded-md border border-[var(--line-strong)] bg-[var(--surface-elevated)] p-4 text-left text-[var(--text-main)] transition-colors hover:border-[var(--accent)] md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="text-sm text-[var(--muted)]">Titular</p>
                <p className="mt-1 font-semibold">{donor.holderName}</p>
                <p className="text-sm text-[var(--muted)]">{donor.holderCpf}</p>
              </div>
              <div className="flex items-start md:justify-end">
                <StatusBadge status="holder" />
              </div>
            </button>
          ) : donor.holderName ? (
            <div className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm text-[var(--muted)]">Pessoa vinculada</p>
                <p className="mt-1 font-semibold text-[var(--text-main)]">
                  {donor.holderName}
                </p>
                {donor.holderCpf ? (
                  <p className="text-sm text-[var(--muted)]">{donor.holderCpf}</p>
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
      ) : (
        <SectionCard
          title="Auxiliares vinculados"
          className="mb-6"
        >
          {profile.auxiliaryDonors.length === 0 ? (
            <EmptyState
              title="Nenhum auxiliar vinculado"
              description="Quando um auxiliar for associado a este titular, ele aparecerá aqui."
            />
          ) : (
            <div className="space-y-3">
              {profile.auxiliaryDonors.map((auxiliary) => (
                <button
                  key={auxiliary.id}
                  type="button"
                  onClick={() => navigate(`/doadores/${auxiliary.id}`)}
                  className="grid w-full gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-left transition-colors hover:border-[var(--accent)] md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-[var(--text-main)]">
                      {auxiliary.name}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{auxiliary.cpf}</p>
                  </div>
                  <StatusBadge status="auxiliary" />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Notas históricas</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {profile.totals.totalNotes}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Total abatido</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {formatCurrency(profile.totals.totalAbatement)}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">Meses com abatimento</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {profile.totals.monthCount}
          </p>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-[var(--muted)]">CPFs de doação</p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {profile.totals.linkedCpfCount}
          </p>
        </div>
      </div>

      <SectionCard
        title="CPFs de doação"
        description="CPFs usados para localizar as notas nas planilhas importadas."
        className="mb-6"
      >
        <div className="space-y-3">
          {profile.sources.map((source) => (
            <div
              key={source.id}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4"
            >
              <p className="font-semibold text-[var(--text-main)]">{source.name}</p>
              <p className="text-sm text-[var(--muted)]">{source.cpf}</p>
              <p className="text-sm text-[var(--muted)]">
                Início: {source.donationStartDate || "Nao informado"} •{" "}
                {source.totalNotes} nota(s)
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Histórico mensal"
        description="Meses em que este doador teve abatimento calculado."
      >
        {profile.monthlyHistory.length === 0 ? (
          <EmptyState
            title="Sem histórico mensal"
            description="Quando uma importação encontrar o CPF deste doador, o histórico aparecerá aqui."
          />
        ) : (
          <div className="space-y-3">
            {profile.monthlyHistory.map((item) => (
              <div
                key={item.referenceMonth}
                className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:grid-cols-4"
              >
                <div>
                  <p className="text-sm text-[var(--muted)]">Mês</p>
                  <p className="font-medium text-[var(--text-main)]">
                    {formatMonthYear(item.referenceMonth)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Notas</p>
                  <p className="font-medium text-[var(--text-main)]">
                    {item.notesCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)]">Abatimento</p>
                  <p className="font-medium text-[var(--text-main)]">
                    {formatCurrency(item.abatementAmount)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-[var(--muted)]">Status</p>
                  <StatusBadge status={item.abatementStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
