import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import TransferDonorProjectModal from "./TransferDonorProjectModal";
import { useDataResource } from "../../../hooks/useDataResource";
import { useDatabaseChangeEffect } from "../../../hooks/useDatabaseChangeEffect";
import { listDonorAssignments } from "../../../services/projectService";
import { formatMonthYear } from "../../../utils/date";

const EMPTY = [];

/**
 * O projeto do doador e a linha do tempo dos vínculos.
 *
 * A vigência é o que garante que uma transferência não reescreve o passado: a
 * janela anterior fica fechada e as doações daqueles meses continuam somando
 * para o projeto antigo. Mostrar a linha do tempo é o que torna essa garantia
 * verificável pelo operador — sem ela, "transferi e o histórico ficou" é uma
 * promessa que ele teria de aceitar no escuro.
 */
export default function DonorProjectSection({ donor }) {
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const donorId = donor?.id ?? "";
  const loader = useCallback(
    (currentFilters) => listDonorAssignments(currentFilters?.donorId ?? ""),
    [],
  );
  const filters = useMemo(() => ({ donorId }), [donorId]);

  const { data, error, reload } = useDataResource({
    loader,
    filters,
    errorMessage: "Não foi possível carregar o projeto deste doador.",
    scope: "DonorProjectSection",
    initialData: EMPTY,
  });

  useDatabaseChangeEffect(reload, { domains: ["projects", "donors"] });

  const assignments = data ?? EMPTY;
  const current = assignments.find((item) => item.isOpen) ?? null;
  // Encerrados do mais recente para o mais antigo: a pergunta que se faz aqui
  // é "de onde ele veio", e a resposta mais provável é o vínculo anterior.
  const closed = assignments.filter((item) => !item.isOpen).reverse();

  return (
    <SectionCard
      title="Projeto"
      description="A qual projeto este doador pertence e desde quando."
      className="mb-6"
    >
      <FeedbackMessage message={error} tone="error" />
      <FeedbackMessage
        message={successMessage}
        persistent={false}
        tone="success"
      />

      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
          <div className="min-w-0">
            <p className="font-semibold text-[var(--text-main)]">
              {current.projectName || "Projeto removido"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {current.validFrom
                ? `Desde ${formatMonthYear(current.validFrom)}`
                : "Desde o início do histórico"}
            </p>
          </div>
          <Button variant="subtle" onClick={() => setIsTransferOpen(true)}>
            Transferir de projeto
          </Button>
        </div>
      ) : (
        <EmptyState
          title="Sem projeto vinculado"
          description="Este doador não aparece na lista de nenhum projeto. Vincule-o para que o crédito gerado seja atribuído."
          action={
            <Button onClick={() => setIsTransferOpen(true)}>
              Vincular a um projeto
            </Button>
          }
        />
      )}

      {closed.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-[var(--text-soft)]">
            Vínculos anteriores
          </p>
          <ul className="space-y-2">
            {closed.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <StatusBadge status="inactive" label="Encerrado" />
                <span className="font-medium text-[var(--text-main)]">
                  {assignment.projectName || "Projeto removido"}
                </span>
                <span className="text-[var(--muted)]">
                  {assignment.validFrom
                    ? formatMonthYear(assignment.validFrom)
                    : "Início do histórico"}
                  {" até "}
                  {assignment.validTo
                    ? formatMonthYear(assignment.validTo)
                    : "hoje"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">
            As doações destes meses continuam somando para o projeto da época.
          </p>
        </div>
      ) : null}

      <AnimatePresence>
        {isTransferOpen ? (
          <TransferDonorProjectModal
            currentAssignment={current}
            donor={donor}
            onClose={() => setIsTransferOpen(false)}
            onTransferred={(projectName) => {
              setIsTransferOpen(false);
              setSuccessMessage(`Doador transferido para ${projectName}.`);
              reload();
            }}
          />
        ) : null}
      </AnimatePresence>
    </SectionCard>
  );
}
