import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import { runMigrations } from "../src/services/db/migrations.js";
import {
  BACKFILL_DONATION_START_SQL,
  FIRST_DONATION_MONTH_BY_CPF_SQL,
} from "../src/services/donor/donationStartSql.js";

/**
 * Descoberta automática do início das doações.
 *
 * A data sempre esteve nas planilhas; o sistema é que pedia para alguém
 * procurá-la e redigitá-la. Estas consultas passaram a fazer isso sozinhas — no
 * cadastro, a partir do CPF, e ao fim de cada importação, para quem ficou sem
 * data.
 *
 * O SQL testado é o de produção, importado do módulo que a aplicação usa.
 */

async function bootstrap() {
  const handle = await createTestConnection();
  const conn = handle.conn ?? handle;
  await runMigrations(conn);
  return { conn, close: handle.close ?? (async () => {}) };
}

async function seedDonor(conn, { id, cpf, startDate = null }) {
  await conn.query(`
    INSERT INTO donors (id, name, cpf, demand, donor_type, is_active, donation_start_date)
    VALUES ('${id}', 'DOADOR ${id}', '${cpf}', 'CESTAS', 'holder', TRUE,
            ${startDate ? `DATE '${startDate}'` : "NULL"})
  `);
  await conn.query(`
    INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active)
    VALUES ('lnk-${id}', '${id}', 'DOADOR ${id}', '${cpf}', 'holder', TRUE)
  `);
}

async function seedImport(conn, { id, month, status = "processed" }) {
  await conn.query(`
    INSERT INTO imports (id, file_name, reference_month, status)
    VALUES ('${id}', '${id}.csv', DATE '${month}', '${status}')
  `);
}

async function seedCpfRow(conn, { id, importId, month, cpf, notes = 1, invalid = 0 }) {
  await conn.query(`
    INSERT INTO import_cpf_summary
      (id, import_id, reference_month, cpf, notes_count, invalid_notes_count)
    VALUES ('${id}', '${importId}', DATE '${month}', '${cpf}', ${notes}, ${invalid})
  `);
}

async function startDateOf(conn, donorId) {
  const rows = (
    await conn.query(
      `SELECT CAST(donation_start_date AS VARCHAR) AS d FROM donors WHERE id = '${donorId}'`,
    )
  ).toArray();
  return rows[0]?.d ?? null;
}

test("o primeiro mês ignora importação que falhou e nota inválida", async () => {
  const { conn, close } = await bootstrap();

  try {
    await seedImport(conn, { id: "ok-mar", month: "2025-03-01" });
    await seedImport(conn, { id: "ok-mai", month: "2025-05-01" });
    // Uma planilha que falhou no meio deixa linhas que não são doação
    // confirmada; usá-las anteciparia o início para janeiro.
    await seedImport(conn, { id: "falhou", month: "2025-01-01", status: "error" });
    // Fevereiro só tem nota que a própria NFP marcou como não encontrada.
    await seedImport(conn, { id: "so-invalida", month: "2025-02-01" });

    await seedCpfRow(conn, { id: "c1", importId: "ok-mar", month: "2025-03-01", cpf: "111" });
    await seedCpfRow(conn, { id: "c2", importId: "ok-mai", month: "2025-05-01", cpf: "111" });
    await seedCpfRow(conn, { id: "c3", importId: "falhou", month: "2025-01-01", cpf: "111" });
    await seedCpfRow(conn, {
      id: "c4",
      importId: "so-invalida",
      month: "2025-02-01",
      cpf: "111",
      notes: 0,
      invalid: 7,
    });

    const stmt = await conn.prepare(FIRST_DONATION_MONTH_BY_CPF_SQL);
    const encontrado = (await stmt.query("111")).toArray()[0]?.first_month;
    await stmt.close();

    assert.equal(encontrado, "2025-03-01");
  } finally {
    await close();
  }
});

test("CPF que nunca doou não devolve mês nenhum", async () => {
  const { conn, close } = await bootstrap();

  try {
    const stmt = await conn.prepare(FIRST_DONATION_MONTH_BY_CPF_SQL);
    const rows = (await stmt.query("99999999999")).toArray();
    await stmt.close();

    // Precisa ser nulo, e não uma data qualquer: doador novo é caso legítimo,
    // e chutar faria o cadastro nascer com histórico que não existe.
    assert.equal(rows[0]?.first_month ?? null, null);
  } finally {
    await close();
  }
});

test("o preenchimento pós-importação respeita a data já existente", async () => {
  const { conn, close } = await bootstrap();

  try {
    await seedImport(conn, { id: "abr", month: "2025-04-01" });

    await seedDonor(conn, { id: "sem-data", cpf: "111" });
    await seedDonor(conn, { id: "com-data", cpf: "222", startDate: "2024-01-01" });

    await seedCpfRow(conn, { id: "c1", importId: "abr", month: "2025-04-01", cpf: "111" });
    await seedCpfRow(conn, { id: "c2", importId: "abr", month: "2025-04-01", cpf: "222" });

    await conn.query(BACKFILL_DONATION_START_SQL);

    assert.equal(await startDateOf(conn, "sem-data"), "2025-04-01");
    // Sobrescrever aqui apagaria uma decisão do usuário sem ele pedir.
    assert.equal(await startDateOf(conn, "com-data"), "2024-01-01");

    // Repetir não pode mudar nada — a importação seguinte roda de novo.
    await conn.query(BACKFILL_DONATION_START_SQL);
    assert.equal(await startDateOf(conn, "sem-data"), "2025-04-01");
    assert.equal(await startDateOf(conn, "com-data"), "2024-01-01");
  } finally {
    await close();
  }
});

test("o início considera também os CPFs auxiliares do doador", async () => {
  const { conn, close } = await bootstrap();

  try {
    await seedImport(conn, { id: "fev", month: "2025-02-01" });
    await seedImport(conn, { id: "jun", month: "2025-06-01" });

    await seedDonor(conn, { id: "titular", cpf: "111" });
    // O auxiliar doa pelo mesmo doador, e começou ANTES do titular.
    await conn.query(`
      INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active)
      VALUES ('lnk-aux', 'titular', 'AUXILIAR', '333', 'auxiliary', TRUE)
    `);

    await seedCpfRow(conn, { id: "c1", importId: "jun", month: "2025-06-01", cpf: "111" });
    await seedCpfRow(conn, { id: "c2", importId: "fev", month: "2025-02-01", cpf: "333" });

    await conn.query(BACKFILL_DONATION_START_SQL);

    // Fevereiro, do auxiliar: a primeira doação do grupo é o início do doador.
    assert.equal(await startDateOf(conn, "titular"), "2025-02-01");
  } finally {
    await close();
  }
});
