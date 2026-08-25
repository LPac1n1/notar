import { query, queryPrepared, startOfMonth } from "../db";
import { getActiveProjectId } from "../activeProject.js";
import { maskCpf, maskName } from "../../utils/mask.js";
import {
  buildRaffleNumbersSql,
  buildRafflePeriodsSql,
} from "./raffleNumbersSql.js";

/**
 * Números da sorte: cada nota doada no período vira um número, na ordem em
 * que a compra foi feita.
 *
 * A lista é feita para ser exibida — por isso nome e CPF saem mascarados
 * daqui, e não na tela. Mascarar na borda de saída garante que qualquer
 * consumidor futuro (tela, CSV, impressão) receba o dado já protegido, em vez
 * de cada um ter de lembrar de aplicar a máscara.
 *
 * O valor da nota e o crédito que ela gerou não são consultados em momento
 * nenhum: não é omissão de exibição, é ausência no dado.
 */
export async function listRaffleNumbers({ period = "", scope = "month" } = {}) {
  const normalizedPeriod = startOfMonth(period);

  if (!normalizedPeriod) {
    return [];
  }

  const rows = await queryPrepared(
    buildRaffleNumbersSql(getActiveProjectId(), { scope }),
    [normalizedPeriod],
  );

  return rows.map((row) => ({
    number: Number(row.numero_sorte ?? 0),
    name: maskName(row.donor_name),
    cpf: maskCpf(row.cpf),
    noteDate: row.data_nota ?? "",
    referenceMonth: row.reference_month ?? "",
  }));
}

/** Meses com nota, do mais recente para o mais antigo. */
export async function listRafflePeriods() {
  const rows = await query(buildRafflePeriodsSql(getActiveProjectId()));

  return rows.map((row) => String(row.mes)).filter(Boolean);
}
