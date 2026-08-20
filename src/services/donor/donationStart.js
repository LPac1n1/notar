import { execute, queryPrepared } from "../db";
import { normalizeCpf } from "../../utils/cpf";
import {
  BACKFILL_DONATION_START_SQL,
  FIRST_DONATION_MONTH_BY_CPF_SQL,
} from "./donationStartSql.js";

/**
 * Descoberta automática do início das doações.
 *
 * A data já estava nas planilhas: se um CPF aparece doando desde março, o
 * início dele é março. Pedir que alguém procure isso à mão em cada importação
 * e digite de novo é trabalho que o sistema pode fazer sozinho — e que ninguém
 * faz de forma confiável, tanto que o painel tem um cartão inteiro dedicado a
 * "doadores sem início".
 *
 * O SQL mora em `donationStartSql.js` para o teste exercitar a consulta real.
 */

/**
 * Primeiro mês em que este CPF aparece doando, ou `null` se ele nunca apareceu.
 *
 * Devolve `null` — e não uma data qualquer — de propósito: um CPF ausente das
 * planilhas é informação legítima (doador novo), e chutar uma data faria o
 * cadastro nascer com um histórico que não existe.
 */
export async function findFirstDonationMonthForCpf(cpf) {
  const normalizedCpf = normalizeCpf(cpf);

  if (normalizedCpf.length !== 11) {
    return null;
  }

  const rows = await queryPrepared(FIRST_DONATION_MONTH_BY_CPF_SQL, [
    normalizedCpf,
  ]);

  return rows[0]?.first_month ?? null;
}

/**
 * Preenche o início das doações de todo doador que ainda não tem um.
 *
 * Chamado ao fim de cada importação. Nunca sobrescreve data existente — o
 * `WHERE` cobre só linhas nulas —, então repetir é inofensivo e o que o
 * usuário digitou continua valendo.
 *
 * A contagem sai de uma consulta ANTES da atualização porque `execute` não
 * devolve linhas afetadas; é o número que a mensagem pós-importação usa para
 * dizer o que aconteceu sem o usuário ter de conferir doador por doador.
 */
export async function backfillDonationStartDates({ emitChange = true } = {}) {
  const pending = await queryPrepared(
    `
      SELECT count(*) AS total
      FROM donors
      WHERE donors.donation_start_date IS NULL
        AND EXISTS (
          SELECT 1
          FROM donor_cpf_links
          INNER JOIN import_cpf_summary
            ON import_cpf_summary.cpf = donor_cpf_links.cpf
          INNER JOIN imports
            ON imports.id = import_cpf_summary.import_id
          WHERE donor_cpf_links.donor_id = donors.id
            AND donor_cpf_links.is_active = TRUE
            AND imports.status = 'processed'
            AND import_cpf_summary.notes_count > 0
        )
    `,
    [],
  );

  const filled = Number(pending[0]?.total ?? 0);

  if (filled === 0) {
    return { filled: 0 };
  }

  await execute(BACKFILL_DONATION_START_SQL, {
    domains: ["donors"],
    source: "donation-start-backfill",
    flush: emitChange,
  });

  return { filled };
}
