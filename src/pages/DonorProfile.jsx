import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import LoadingScreen from "../components/ui/LoadingScreen";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import StatusBadge from "../components/ui/StatusBadge";
import { getDonorProfile } from "../services/donorService";
import { formatMonthYear } from "../utils/date";
import { getErrorMessage } from "../utils/error";
import { formatCurrency } from "../utils/format";

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
        <Button variant="subtle" onClick={() => navigate("/doadores")}>
          Voltar para doadores
        </Button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Tipo</p>
          <div className="mt-2">
            <StatusBadge status={donor.donorType} />
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">CPF</p>
          <p className="mt-1 font-semibold text-slate-100">{donor.cpf}</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Demanda</p>
          <p className="mt-1 font-semibold text-slate-100">
            {donor.demand || "Nao informada"}
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Início das doações</p>
          <p className="mt-1 font-semibold text-slate-100">
            {donor.donationStartDate || "Nao informado"}
          </p>
        </div>
      </div>

      {donor.donorType === "auxiliary" ? (
        <SectionCard title="Vínculo informativo" className="mb-6">
          {donor.holderDonorId ? (
            <button
              type="button"
              onClick={() => navigate(`/doadores/${donor.holderDonorId}`)}
              className="rounded-md border border-slate-700 bg-slate-900/70 p-4 text-left text-slate-100 transition-colors hover:border-slate-500"
            >
              <p className="text-sm text-slate-400">Titular vinculado</p>
              <p className="mt-1 font-semibold">{donor.holderName}</p>
              <p className="text-sm text-slate-400">{donor.holderCpf}</p>
            </button>
          ) : (
            <EmptyState
              title="Sem titular vinculado"
              description="Este auxiliar está cadastrado sem vínculo informativo com um titular."
            />
          )}
        </SectionCard>
      ) : (
        <SectionCard
          title="Auxiliares vinculados"
          description="Estes auxiliares são apenas vínculos informativos. Cada um tem abatimento próprio."
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
                  className="flex w-full flex-col gap-1 rounded-md border border-slate-800 bg-slate-900/70 p-4 text-left transition-colors hover:border-slate-500 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-100">
                      {auxiliary.name}
                    </p>
                    <p className="text-sm text-slate-400">{auxiliary.cpf}</p>
                  </div>
                  <StatusBadge status="auxiliary" />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Notas históricas</p>
          <p className="mt-1 font-semibold text-slate-100">
            {profile.totals.totalNotes}
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Total abatido</p>
          <p className="mt-1 font-semibold text-slate-100">
            {formatCurrency(profile.totals.totalAbatement)}
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Meses com abatimento</p>
          <p className="mt-1 font-semibold text-slate-100">
            {profile.totals.monthCount}
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">CPFs de doação</p>
          <p className="mt-1 font-semibold text-slate-100">
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
              className="rounded-md border border-slate-800 bg-slate-900/70 p-4"
            >
              <p className="font-semibold text-slate-100">{source.name}</p>
              <p className="text-sm text-slate-400">{source.cpf}</p>
              <p className="text-sm text-slate-400">
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
                className="grid gap-3 rounded-md border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-4"
              >
                <div>
                  <p className="text-sm text-slate-400">Mês</p>
                  <p className="font-medium text-slate-100">
                    {formatMonthYear(item.referenceMonth)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Notas</p>
                  <p className="font-medium text-slate-100">
                    {item.notesCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Abatimento</p>
                  <p className="font-medium text-slate-100">
                    {formatCurrency(item.abatementAmount)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-slate-400">Status</p>
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
