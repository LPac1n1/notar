import { queryPrepared, startOfMonth } from "../db";
import { formatCpf } from "../../utils/cpf";
import { buildAbatementDescription } from "./abatementSheetDescription";
import { ABATEMENT_SHEET_SQL } from "./abatementSheetSql";

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

  const rows = await queryPrepared(ABATEMENT_SHEET_SQL, [normalizedMonth]);

  return rows.map((row) => {
    const donorName = row.donor_name ?? "";
    const groupHasAuxiliaries = Boolean(row.group_has_auxiliaries);

    return {
      cpf: formatCpf(row.cpf),
      cpfValue: row.cpf ?? "",
      donorName,
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
