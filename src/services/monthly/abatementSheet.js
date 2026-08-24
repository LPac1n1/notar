import { queryPrepared, startOfMonth } from "../db";
import { formatCpf } from "../../utils/cpf";
import { buildAbatementDescription } from "./abatementSheetDescription";
import { buildAbatementSheetSql } from "./abatementSheetSql";
import { getActiveProjectId } from "../activeProject.js";

export { buildAbatementDescription };

/**
 * Uma linha por CPF de doador com notas no mês, pronta para importar no
 * sistema que faz o abatimento.
 */
export async function listAbatementSheetRows({ referenceMonth } = {}) {
  const normalizedMonth = startOfMonth(referenceMonth);

  if (!normalizedMonth) {
    return [];
  }

  const rows = await queryPrepared(buildAbatementSheetSql(getActiveProjectId()), [
    normalizedMonth,
  ]);

  return rows.map((row) => {
    const donorName = row.donor_name ?? "";
    const groupHasAuxiliaries = Boolean(row.group_has_auxiliaries);

    return {
      cpf: formatCpf(row.cpf),
      cpfValue: row.cpf ?? "",
      donorName,
      // O que sai nas colunas NOME e CPF da planilha: do titular quando a
      // linha é de um auxiliar, da própria pessoa quando é de um titular.
      // `donorName` acima segue sendo o dono do CPF que gerou as notas, e é
      // ele que aparece na descrição.
      sheetName: row.sheet_name ?? donorName,
      sheetCpf: formatCpf(row.sheet_cpf ?? row.cpf),
      demand: row.demand ?? "",
      donorType: row.donor_type === "auxiliary" ? "auxiliary" : "holder",
      donorTypeLabel: row.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
      notesCount: Number(row.notes_count ?? 0),
      groupHasAuxiliaries,
      description: buildAbatementDescription({
        donorName,
        referenceMonth: normalizedMonth,
        groupHasAuxiliaries,
      }),
    };
  });
}
