import { useCallback, useState } from "react";
import { useMutationAction } from "../../../hooks/useMutationAction";
import {
  deactivateDonor,
  deleteDonor,
  listDonors,
  updateDonor,
} from "../../../services/donorService";
import { deleteImport } from "../../../services/importService";
import { restoreTrashItem } from "../../../services/trashService";
import { formatMonthYear } from "../../../utils/date";

/**
 * Ações que resolvem, direto do dashboard, cada tipo de item listado em
 * "Pontos para revisar".
 *
 * As correções de doador reaproveitam `updateDonor` em vez de escrever no
 * banco por conta própria: é lá que moram as regras de negócio (CPF único,
 * início não pode ser posterior ao histórico de atividade já registrado,
 * demanda obrigatória para titular) e o espelhamento da data de início em
 * `donor_cpf_links`. Por isso cada correção primeiro RECARREGA o doador
 * inteiro e só então troca o campo em questão — `updateDonor` exige o
 * registro completo, e montar um payload parcial apagaria os outros campos.
 *
 * `busyRowId` é por linha (e não um booleano de página) porque a lista
 * inteira fica visível no modal: travar tudo enquanto uma linha salva daria
 * a impressão de que o modal congelou.
 */
export function useDashboardActions({ reload }) {
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState(null);
  const [busyRowId, setBusyRowId] = useState("");

  const runMutation = useMutationAction({
    setError,
    setSuccessMessage,
    setSuccessAction,
    reload,
  });

  const runRowMutation = useCallback(
    async (rowId, options) => {
      setBusyRowId(rowId);
      try {
        return await runMutation(options);
      } finally {
        setBusyRowId("");
      }
    },
    [runMutation],
  );

  const loadDonor = useCallback(async (donorId) => {
    const [donor] = await listDonors({ donorId, activeStatus: "all" });

    if (!donor) {
      throw new Error("Doador não encontrado. Ele pode ter sido excluído.");
    }

    return donor;
  }, []);

  // Reaplica o doador inteiro trocando apenas `patch`. Ver comentário do topo.
  const patchDonor = useCallback(
    async (donorId, patch) => {
      const donor = await loadDonor(donorId);

      await updateDonor({
        id: donor.id,
        name: donor.name,
        cpf: donor.cpfValue,
        demand: donor.demand,
        donationStartDate: donor.donationStartDateValue,
        donorType: donor.donorType,
        holderPersonId: donor.holderPersonId,
        holderDonorId: donor.holderDonorId,
        ...patch,
      });
    },
    [loadDonor],
  );

  const setDonationStartDate = useCallback(
    (rowId, donorId, month) =>
      runRowMutation(rowId, {
        scope: "Dashboard.setDonationStartDate",
        run: () => patchDonor(donorId, { donationStartDate: month }),
        successMessage: `Início das doações definido para ${formatMonthYear(month)}.`,
        errorMessage: "Não foi possível definir o início das doações.",
        logContext: { donorId, month },
      }),
    [patchDonor, runRowMutation],
  );

  const setDonorDemand = useCallback(
    (rowId, donorId, demand) =>
      runRowMutation(rowId, {
        scope: "Dashboard.setDonorDemand",
        run: () => patchDonor(donorId, { demand }),
        successMessage: `Demanda "${demand}" vinculada ao doador.`,
        errorMessage: "Não foi possível vincular a demanda.",
        logContext: { donorId, demand },
      }),
    [patchDonor, runRowMutation],
  );

  const removeDonor = useCallback(
    (rowId, donorId, donorName) =>
      runRowMutation(rowId, {
        scope: "Dashboard.removeDonor",
        run: () => deleteDonor(donorId),
        successMessage: `${donorName} foi enviado para a lixeira.`,
        errorMessage: "Não foi possível excluir o doador.",
        buildUndo: (trashItemId) =>
          trashItemId ? () => restoreTrashItem(trashItemId).then(reload) : null,
        logContext: { donorId },
      }),
    [reload, runRowMutation],
  );

  /**
   * Converte um titular em pessoa de referência: remove o cadastro de DOADOR
   * e mantém a pessoa, que continua servindo de vínculo para os auxiliares.
   *
   * Reusa `deleteDonor` de propósito, e não um caminho novo: ele já faz
   * exatamente essa distinção — solta o `holder_donor_id` dos auxiliares e só
   * apaga a linha em `people` quando NENHUM auxiliar ativo continua
   * apontando para ela. Com auxiliar ativo, a pessoa sobrevive; é o mesmo
   * estado que a tela de Doadores mostra como "Pessoa de referência".
   *
   * Por isso a ação só é oferecida quando existe auxiliar ativo — sem ele,
   * a mesma chamada apagaria a pessoa junto, e o rótulo estaria mentindo.
   */
  const convertToReferencePerson = useCallback(
    (rowId, donorId, donorName) =>
      runRowMutation(rowId, {
        scope: "Dashboard.convertToReferencePerson",
        run: () => deleteDonor(donorId),
        successMessage: `${donorName} agora é uma pessoa de referência — o vínculo dos auxiliares foi mantido.`,
        errorMessage: "Não foi possível converter o doador em pessoa.",
        buildUndo: (trashItemId) =>
          trashItemId ? () => restoreTrashItem(trashItemId).then(reload) : null,
        logContext: { donorId },
      }),
    [reload, runRowMutation],
  );

  const deactivate = useCallback(
    (rowId, donorId, donorName, month) =>
      runRowMutation(rowId, {
        scope: "Dashboard.deactivateDonor",
        run: () => deactivateDonor(donorId, month),
        successMessage: `${donorName} desativado a partir de ${formatMonthYear(month)}.`,
        errorMessage: "Não foi possível desativar o doador.",
        logContext: { donorId, month },
      }),
    [runRowMutation],
  );

  const removeImport = useCallback(
    (rowId, importId, label) =>
      runRowMutation(rowId, {
        scope: "Dashboard.removeImport",
        run: () => deleteImport(importId),
        successMessage: `Importação de ${label} enviada para a lixeira.`,
        errorMessage: "Não foi possível excluir a importação.",
        buildUndo: (trashItemId) =>
          trashItemId ? () => restoreTrashItem(trashItemId).then(reload) : null,
        logContext: { importId },
      }),
    [reload, runRowMutation],
  );

  const clearFeedback = useCallback(() => {
    setError("");
    setSuccessMessage("");
    setSuccessAction(null);
  }, []);

  return {
    actionError: error,
    actionSuccessMessage: successMessage,
    actionSuccessAction: successAction,
    busyRowId,
    clearFeedback,
    convertToReferencePerson,
    deactivate,
    removeDonor,
    removeImport,
    setDonationStartDate,
    setDonorDemand,
  };
}
