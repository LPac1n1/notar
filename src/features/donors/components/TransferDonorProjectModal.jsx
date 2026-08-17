import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import { logError } from "../../../services/logger";
import {
  assignDonorToProject,
  listProjects,
  transferDonorToProject,
} from "../../../services/projectService";
import { formatMonthYear } from "../../../utils/date";
import { getErrorMessage } from "../../../utils/error";

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * O último mês que fica com o projeto ANTERIOR.
 *
 * A janela antiga fecha em `effectiveMonth - 1`, porque `valid_to` é
 * inclusivo: fechar no próprio mês faria o mês da transferência pertencer aos
 * dois projetos e o crédito dele ser contado duas vezes. O texto tem de dizer
 * o mesmo mês que o banco grava — anunciar o mês efetivo aqui prometeria ao
 * operador um recorte diferente do que ele vai ver depois.
 */
function previousMonthLabel(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return "o mês anterior";

  const [year, month] = monthValue.split("-").map(Number);
  const previous = new Date(year, month - 2, 1);

  return formatMonthYear(
    `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-01`,
  );
}

/**
 * Transferência de um doador entre projetos, a partir de um mês.
 *
 * O mês é obrigatório e não é detalhe de formulário: ele decide onde cada
 * doação passada é contada. A planilha é mensal, então uma vigência no meio do
 * mês exigiria um rateio que o dado de origem não permite calcular.
 *
 * Quando o doador ainda não tem vínculo nenhum, a operação é outra: não há
 * janela para fechar, então o vínculo abre desde o início do histórico e todo
 * o crédito passado dele passa a somar para o projeto escolhido. Usar a
 * transferência aqui deixaria os meses anteriores sem projeto.
 */
export default function TransferDonorProjectModal({
  currentAssignment,
  donor,
  onClose,
  onTransferred,
}) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [effectiveMonth, setEffectiveMonth] = useState(currentMonthValue);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFirstAssignment = !currentAssignment;

  useEffect(() => {
    let cancelled = false;

    listProjects({ activeStatus: "active" })
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((err) => {
        logError("TransferDonorProject.loadProjects", err);
        if (!cancelled) {
          setError("Não foi possível carregar a lista de projetos.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () =>
      projects
        .filter((project) => project.id !== currentAssignment?.projectId)
        .map((project) => ({ value: project.id, label: project.name })),
    [projects, currentAssignment],
  );

  const selectedProject = projects.find((project) => project.id === projectId);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!projectId) {
      setError("Selecione o projeto de destino.");
      return;
    }

    try {
      setError("");
      setIsSubmitting(true);

      if (isFirstAssignment) {
        await assignDonorToProject({
          donorId: donor.id,
          projectId,
          reason: "vinculo-manual",
        });
      } else {
        await transferDonorToProject({
          donorId: donor.id,
          projectId,
          effectiveMonth,
        });
      }

      onTransferred(selectedProject?.name ?? "outro projeto");
    } catch (err) {
      logError("TransferDonorProject.submit", err);
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={isFirstAssignment ? "Vincular a um projeto" : "Transferir de projeto"}
      description={
        isFirstAssignment
          ? `${donor?.name} passa a pertencer ao projeto escolhido, com todo o histórico dele.`
          : `${donor?.name} deixa de pertencer a ${currentAssignment?.projectName || "o projeto atual"} a partir do mês informado.`
      }
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={handleSubmit}>
        <FeedbackMessage message={error} tone="error" />

        <SelectInput
          label="Projeto de destino"
          name="projectId"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          options={options}
          placeholder="Selecione o projeto"
          searchable
          searchPlaceholder="Buscar projeto..."
        />

        {isFirstAssignment ? null : (
          <div className="mt-3">
            <MonthInput
              label="A partir de"
              name="effectiveMonth"
              value={effectiveMonth}
              onChange={(event) => setEffectiveMonth(event.target.value)}
            />
          </div>
        )}

        <p className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--muted)]">
          {isFirstAssignment
            ? "Sem vínculo anterior, todo o crédito já conciliado deste doador passa a ser atribuído ao projeto escolhido."
            : `As doações até ${previousMonthLabel(effectiveMonth)} continuam somando para ${currentAssignment?.projectName || "o projeto atual"}. Só o que vier depois conta para o novo projeto.`}
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="subtle" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Salvando..."
              : isFirstAssignment
                ? "Vincular"
                : "Transferir"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
