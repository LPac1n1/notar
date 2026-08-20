import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import { runMigrations } from "../src/services/db/migrations.js";
import {
  buildEstablishmentMonthlySql,
  buildEstablishmentRankingSql,
  buildEstablishmentTotalsSql,
} from "../src/services/establishment/establishmentSql.js";
import {
  DONOR_DONATION_TOTALS_SQL,
  DONOR_TOP_ESTABLISHMENTS_SQL,
} from "../src/services/donor/donationHistorySql.js";

/**
 * Histórico do doador e inteligência de estabelecimentos.
 *
 * Os dois recursos juntam as MESMAS duas planilhas: a compra vem das doações e
 * o crédito vem dos créditos, ligados por `credit_reconciliation`. O nome do
 * estabelecimento só existe do lado dos créditos.
 *
 * A base é montada de propósito para que a rede MAIS FREQUENTADA não seja a
 * que MAIS RENDE — se as duas coincidissem, um código que confundisse as duas
 * perguntas passaria no teste:
 *
 *   MERCADO   6 compras de R$ 100,00, R$ 1,00 de crédito cada → R$  6,00
 *   FARMACIA  2 compras de R$  50,00, R$ 10,00 de crédito cada → R$ 20,00
 */

const PROJETO = "prj-demandas-moradia";

async function bootstrap() {
  const handle = await createTestConnection();
  const conn = handle.conn ?? handle;
  await runMigrations(conn);
  await seed(conn);
  return { conn, close: handle.close ?? (async () => {}) };
}

async function seed(conn) {
  await conn.query(`
    INSERT INTO donors (id, name, cpf, demand, donor_type, is_active) VALUES
      ('d1', 'ANA', '111', 'CESTAS', 'holder', TRUE),
      ('d2', 'BIA', '222', 'CESTAS', 'holder', TRUE)
  `);
  await conn.query(`
    INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active) VALUES
      ('l1', 'd1', 'ANA', '111', 'holder', TRUE),
      ('l2', 'd2', 'BIA', '222', 'holder', TRUE)
  `);
  // Só ANA pertence ao projeto — é o que separa o recorte do total.
  await conn.query(`
    INSERT INTO donor_project_assignments
      (id, donor_id, project_id, valid_from, valid_to, reason)
    VALUES ('a1', 'd1', '${PROJETO}', DATE '1900-01-01', DATE '9999-12-01', 'teste')
  `);

  const compras = [];
  for (let i = 0; i < 6; i += 1) {
    const cpf = i % 2 === 0 ? "111" : "222";
    const mes = `2025-0${(i % 3) + 1}-01`;
    compras.push(
      `('n${i}', 'imp', '${cpf}', DATE '${mes}', '${i}', 100, DATE '${mes}', 'CNPJ-MERCADO', TRUE, 10000)`,
    );
  }
  for (let i = 6; i < 8; i += 1) {
    compras.push(
      `('n${i}', 'imp', '111', DATE '2025-01-01', '${i}', 50, DATE '2025-01-05', 'CNPJ-FARMACIA', TRUE, 5000)`,
    );
  }
  // Nota que a NFP marcou como não encontrada: não é compra.
  compras.push(
    `('nx', 'imp', '111', DATE '2025-01-01', '99', 9999, DATE '2025-01-05', 'CNPJ-MERCADO', FALSE, 999900)`,
  );
  await conn.query(`
    INSERT INTO donation_notes
      (id, import_id, cpf, reference_month, numero_nota, valor_nota, data_nota,
       cnpj_estabelecimento, is_valid, valor_cents)
    VALUES ${compras.join(", ")}
  `);

  const creditos = [];
  for (let i = 0; i < 6; i += 1) {
    creditos.push(
      `('c${i}', 'ci', 'CNPJ-MERCADO', 'MERCADO', '${i}', DATE '2025-01-01', 100, 1.00, TRUE)`,
    );
  }
  for (let i = 6; i < 8; i += 1) {
    creditos.push(
      `('c${i}', 'ci', 'CNPJ-FARMACIA', 'FARMACIA', '${i}', DATE '2025-01-05', 50, 10.00, TRUE)`,
    );
  }
  await conn.query(`
    INSERT INTO credit_notes
      (id, credit_import_id, cnpj_estabelecimento, emitente, numero_nota,
       data_emissao, valor_nf, credito, is_valid)
    VALUES ${creditos.join(", ")}
  `);

  const pares = [];
  for (let i = 0; i < 8; i += 1) {
    pares.push(`('r${i}', 'c${i}', 'n${i}', 'matched')`);
  }
  await conn.query(`
    INSERT INTO credit_reconciliation (id, credit_note_id, donation_note_id, match_status)
    VALUES ${pares.join(", ")}
  `);
}

function rows(result) {
  return result.toArray().map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "bigint" ? Number(value) : value,
      ]),
    ),
  );
}

test("o ranking ordena por crédito, e não por número de compras", async () => {
  const { conn, close } = await bootstrap();

  try {
    const ranking = rows(await conn.query(buildEstablishmentRankingSql({})));

    // FARMACIA tem UM TERÇO das compras do MERCADO e ainda assim vem primeiro:
    // a pergunta é onde rende mais, não onde se compra mais.
    assert.equal(ranking[0].estabelecimento, "FARMACIA");
    assert.equal(ranking[0].total_credito, 20);
    assert.equal(ranking[0].compras, 2);

    assert.equal(ranking[1].estabelecimento, "MERCADO");
    assert.equal(ranking[1].total_credito, 6);
    assert.equal(ranking[1].compras, 6);

    // A nota inválida de R$ 9.999,00 não pode entrar no total gasto.
    assert.equal(ranking[1].total_gasto, 600);

    // Duas pessoas diferentes compram no mercado; só uma na farmácia.
    assert.equal(ranking[1].doadores, 2);
    assert.equal(ranking[0].doadores, 1);
  } finally {
    await close();
  }
});

test("a participação dos estabelecimentos soma o total", async () => {
  const { conn, close } = await bootstrap();

  try {
    const ranking = rows(await conn.query(buildEstablishmentRankingSql({})));
    const soma = ranking.reduce((total, item) => total + item.participacao, 0);

    // Sai por função de janela na mesma consulta; um total calculado à parte
    // poderia descrever outro conjunto e a soma não fecharia.
    assert.ok(
      Math.abs(soma - 1) < 1e-9,
      `a participação somou ${soma} em vez de 1`,
    );
  } finally {
    await close();
  }
});

test("o recorte por projeto conta só quem pertencia a ele no mês da nota", async () => {
  const { conn, close } = await bootstrap();

  try {
    const geral = rows(await conn.query(buildEstablishmentTotalsSql({})));
    const doProjeto = rows(
      await conn.query(buildEstablishmentTotalsSql({ projectId: PROJETO })),
    );

    assert.equal(geral[0].compras, 8);
    // BIA não pertence ao projeto: as 3 compras dela saem da conta.
    assert.equal(doProjeto[0].compras, 5);
    assert.equal(geral[0].total_credito, 26);
    assert.equal(doProjeto[0].total_credito, 23);
  } finally {
    await close();
  }
});

test("a evolução de um estabelecimento sai por CNPJ", async () => {
  const { conn, close } = await bootstrap();

  try {
    const stmt = await conn.prepare(buildEstablishmentMonthlySql({}));
    const meses = rows(await stmt.query("CNPJ-MERCADO"));
    await stmt.close();

    assert.equal(meses.length, 3);
    assert.deepEqual(
      meses.map((item) => item.reference_month),
      ["2025-01-01", "2025-02-01", "2025-03-01"],
    );
    assert.equal(meses[0].compras, 2);
  } finally {
    await close();
  }
});

test("o histórico do doador separa onde mais comprou de onde mais rendeu", async () => {
  const { conn, close } = await bootstrap();

  try {
    const stmtTop = await conn.prepare(DONOR_TOP_ESTABLISHMENTS_SQL);
    const porDoador = rows(await stmtTop.query("d1"));
    await stmtTop.close();

    // A consulta sai ordenada por compras: MERCADO na frente.
    assert.equal(porDoador[0].estabelecimento, "MERCADO");
    assert.equal(porDoador[0].compras, 3);
    // E o campeão de crédito é o outro — a diferença que a tela precisa mostrar.
    const porCredito = [...porDoador].sort(
      (a, b) => b.total_credito - a.total_credito,
    );
    assert.equal(porCredito[0].estabelecimento, "FARMACIA");
    assert.equal(porCredito[0].total_credito, 20);
  } finally {
    await close();
  }
});

test("os indicadores do doador ignoram a nota não encontrada", async () => {
  const { conn, close } = await bootstrap();

  try {
    const stmt = await conn.prepare(DONOR_DONATION_TOTALS_SQL);
    const totais = rows(await stmt.query("d1"))[0];
    await stmt.close();

    // ANA: 3 compras de R$ 100,00 no mercado e 2 de R$ 50,00 na farmácia.
    // A nota inválida de R$ 9.999,00 não entra, senão o ticket médio saltaria
    // de R$ 80,00 para mais de R$ 1.700,00.
    assert.equal(totais.compras, 5);
    assert.equal(totais.total_gasto, 400);
    assert.equal(totais.ticket_medio, 80);
    assert.equal(totais.total_credito, 23);
    assert.equal(totais.maior_compra, 100);
    assert.equal(totais.maior_credito, 10);
    assert.equal(totais.estabelecimentos, 2);
  } finally {
    await close();
  }
});
