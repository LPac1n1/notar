import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import SelectInput from "../../../components/ui/SelectInput";
import { logError } from "../../../services/logger";
import {
  linkDonorToProject,
  listDonorsWithoutProject,
} from "../../../services/projectService";
import { formatCpf } from "../../../utils/cpf";
import { getErrorMessage } from "../../../utils/error";

/**
 * Os doadores que o card "sem projeto" conta, com o vínculo resolvível aqui.
 *
 * O card existia mostrando só o número. Um doador sem vínculo não some da
 * plataforma: ele some de TODA lista de projeto e o crédito dele cai em "não
 * atribuído" — um problema real, que o painel apontava sem oferecer saída.
 *
 * Cobre dois estados: o doador sem vínculo nenhum e — o caso que de fato
 * chega aqui — o vínculo pendurado num projeto excluído. Em ambos a correção
 * vale desde o início do histórico, porque a ausência de projeto é uma lacuna
 * a preencher, não uma mudança a partir de agora: datar do mês corrente
 * deixaria o crédito passado desse doador sem projeto para sempre.
 */
export default function UnassignedDonorsModal({ onClose, onAssigned, projects }) {
  const [donors, setDonors] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [busyDonorId, setBusyDonorId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadDonors = useCallback(async () => {
    try {
      setDonors(await listDonorsWithoutProject());
    } catch (err) {
      logError("UnassignedDonors.load", err);
      setError("Não foi possível carregar os doadores sem projeto.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDonors();
  }, [loadDonors]);

  const options = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.name })),
    [projects],
  );

  const handleAssign = async (donor) => {
    if (!projectId) {
      setError("Selecione o projeto antes de vincular.");
      return;
    }

    try {
      setError("");
      setBusyDonorId(donor.id);
      await linkDonorToProject({
        donorId: donor.id,
        projectId,
      });
      await loadDonors();
      onAssigned();
    } catch (err) {
      logError("UnassignedDonors.assign", err);
      setError(getErrorMessage(err));
    } finally {
      setBusyDonorId("");
    }
  };

  return (
    <Modal
      title="Doadores sem projeto"
      description="Cadastros ativos que não aparecem na lista de nenhum projeto. Escolha o destino e vincule."
      onClose={onClose}
      size="md"
    >
      <FeedbackMessage message={error} tone="error" />

      <SelectInput
        label="Vincular ao projeto"
        name="projectId"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
        options={options}
        placeholder="Selecione o projeto"
        searchable
        searchPlaceholder="Buscar projeto..."
      />

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-[var(--muted)]">Carregando…</p>
        ) : donors.length === 0 ? (
          <EmptyState
            title="Nenhum doador sem projeto"
            description="Todo cadastro ativo já pertence a algum projeto."
          />
        ) : (
          <ul className="space-y-2">
            {donors.map((donor) => (
              <li
                key={donor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text-main)]">{donor.name}</p>
                  <p className="numeric mt-0.5 text-sm text-[var(--muted)]">
                    {formatCpf(donor.cpf)}
                  </p>
                </div>
                <Button
                  disabled={busyDonorId === donor.id}
                  onClick={() => handleAssign(donor)}
                >
                  {busyDonorId === donor.id ? "Vinculando..." : "Vincular"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
