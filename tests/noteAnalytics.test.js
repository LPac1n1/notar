import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import { runMigrations } from "../src/services/db/migrations.js";
import {
  DEFAULT_NOTE_SORT,
  NOTE_SORT_COLUMNS,
  NOTE_VALUE_BANDS,
  buildNoteCountSql,
  buildNoteFilters,
  buildNoteRowsSql,
  buildNoteTotalsSql,
  buildNoteValueBandsSql,
  buildTopNoteEstablishmentsSql,
} from "../src/services/notes/noteAnalyticsSql.js";

/**
 * Inteligência sobre as notas fiscais.
 *
 * A base é montada para que as perguntas tenham respostas DIFERENTES entre si.
 * Se a nota de maior crédito fosse também a de maior valor e do estabelecimento
 * mais frequente, um código que confundisse as três passaria no teste:
 *
 *   MERCADO   6 compras de R$ 100,00 → R$ 1,00 cada (retorno de 1%)
 *   FARMACIA  1 compra  de R$  40,00 → R$ 12,00     (retorno de 30%)
 *   ATACADO   1 compra  de R$ 800,00 → R$  4,00     (retorno de 0,5%)
 *
 * Maior crédito é da FARMACIA; maior compra é do ATACADO; mais frequente é o
 * MERCADO. Nenhuma das três coincide.
 *
 * ATENÇÃO: o bundle node-blocking do harness é o MVP, que estoura com
 * `_setThrew is not defined` em `LIKE '%' || ? || '%'` dentro de prepared
 * statement. A busca por texto é verificada pelo SQL/params gerados (aqui) e
 * pelo comportamento no navegador — mesma decisão de `textSearch.test.js`.
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
    compras.push(
      `('n${i}', 'imp', '${cpf}', DATE '2025-01-01', '${i}', 100, DATE '2025-01-0${(i % 9) + 1}', 'CNPJ-MERCADO', 'Calculado', TRUE, 10000)`,
    );
  }
  compras.push(
    `('nf', 'imp', '111', DATE '2025-01-01', '90', 40, DATE '2025-01-15', 'CNPJ-FARMACIA', 'Calculado', TRUE, 4000)`,
  );
  compras.push(
    `('na', 'imp', '111', DATE '2025-02-01', '91', 800, DATE '2025-02-10', 'CNPJ-ATACADO', 'Calculado', TRUE, 80000)`,
  );
  // Linha que a NFP marcou como documento não encontrado: existe no arquivo,
  // mas não é compra.
  compras.push(
    `('nx', 'imp', '111', DATE '2025-01-01', '99', 9999, DATE '2025-01-20', 'CNPJ-MERCADO', 'Nao encontrado', FALSE, 999900)`,
  );

  await conn.query(`
    INSERT INTO donation_notes
      (id, import_id, cpf, reference_month, numero_nota, valor_nota, data_nota,
       cnpj_estabelecimento, status_pedido, is_valid, valor_cents)
    VALUES ${compras.join(", ")}
  `);

  const creditos = [];
  for (let i = 0; i < 6; i += 1) {
    creditos.push(
      `('c${i}', 'ci', 'CNPJ-MERCADO', 'MERCADO CENTRAL', '${i}', DATE '2025-01-01', 100, 1.00, TRUE)`,
    );
  }
  creditos.push(
    `('cf', 'ci', 'CNPJ-FARMACIA', 'FARMACIA POPULAR', '90', DATE '2025-01-15', 40, 12.00, TRUE)`,
  );
  creditos.push(
    `('ca', 'ci', 'CNPJ-ATACADO', 'ATACADO GRANDE', '91', DATE '2025-02-10', 800, 4.00, TRUE)`,
  );
  await conn.query(`
    INSERT INTO credit_notes
      (id, credit_import_id, cnpj_estabelecimento, emitente, numero_nota,
       data_emissao, valor_nf, credito, is_valid)
    VALUES ${creditos.join(", ")}
  `);

  const pares = [];
  for (let i = 0; i < 6; i += 1) pares.push(`('r${i}', 'c${i}', 'n${i}', 'matched')`);
  pares.push("('rf', 'cf', 'nf', 'matched')");
  pares.push("('ra', 'ca', 'na', 'matched')");
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

async function run(conn, sql, filters = {}) {
  const { params } = buildNoteFilters(filters);

  if (!params.length) {
    return rows(await conn.query(sql));
  }

  const statement = await conn.prepare(sql);
  const result = await statement.query(...params);
  await statement.close();
  return rows(result);
}

test("cada nota aparece uma vez só, sem duplicar pelos vínculos", async () => {
  const { conn, close } = await bootstrap();

  try {
    const contagem = await run(conn, buildNoteCountSql({}));
    // 8 compras válidas; a linha inválida fica de fora do recorte padrão.
    assert.equal(contagem[0].total, 8);

    const todas = await run(conn, buildNoteCountSql({ filters: { status: "all" } }), {
      status: "all",
    });
    assert.equal(todas[0].total, 9);

    // A garantia que importa: um JOIN a mais em vínculo ou pareamento
    // multiplicaria a nota e inflaria toda soma da tela sem sinal nenhum.
    const listagem = await run(conn, buildNoteRowsSql({ limit: 100 }));
    assert.equal(listagem.length, 8);
    assert.equal(new Set(listagem.map((item) => item.id)).size, 8);
  } finally {
    await close();
  }
});

test("maior crédito, maior compra e mais frequente são notas diferentes", async () => {
  const { conn, close } = await bootstrap();

  try {
    const porCredito = await run(conn, buildNoteRowsSql({ sort: "credito", limit: 100 }));
    assert.equal(porCredito[0].estabelecimento, "FARMACIA POPULAR");
    assert.equal(porCredito[0].credito, 12);

    const porValor = await run(conn, buildNoteRowsSql({ sort: "valor", limit: 100 }));
    assert.equal(porValor[0].estabelecimento, "ATACADO GRANDE");
    assert.equal(porValor[0].valor_nota, 800);

    // Retorno é crédito sobre valor: a farmácia devolve 30% e o atacado 0,5%.
    const porRetorno = await run(conn, buildNoteRowsSql({ sort: "retorno", limit: 100 }));
    assert.equal(porRetorno[0].estabelecimento, "FARMACIA POPULAR");
    assert.ok(Math.abs(porRetorno[0].retorno - 0.3) < 1e-9);

    const menorRetorno = await run(
      conn,
      buildNoteRowsSql({ sort: "retorno", direction: "asc", limit: 100 }),
    );
    assert.equal(menorRetorno[0].estabelecimento, "ATACADO GRANDE");
  } finally {
    await close();
  }
});

test("ordenação inválida cai no padrão em vez de entrar no SQL", async () => {
  const { conn, close } = await bootstrap();

  try {
    const sql = buildNoteRowsSql({ sort: "'; DROP TABLE donation_notes; --" });
    assert.ok(
      sql.includes(NOTE_SORT_COLUMNS[DEFAULT_NOTE_SORT]),
      "a coluna padrão deveria ter sido usada",
    );
    assert.ok(!sql.includes("DROP TABLE"));

    // E a tabela continua de pé depois de executar.
    const listagem = await run(conn, sql);
    assert.equal(listagem.length, 8);
  } finally {
    await close();
  }
});

test("os indicadores ignoram a nota não encontrada", async () => {
  const { conn, close } = await bootstrap();

  try {
    const totais = (await run(conn, buildNoteTotalsSql({})))[0];

    // 6 × R$ 100 + R$ 40 + R$ 800 = R$ 1.440. Com a nota inválida seriam
    // R$ 11.439 e o valor médio saltaria de R$ 180 para mais de R$ 1.200.
    assert.equal(totais.notas, 8);
    assert.equal(totais.total_gasto, 1440);
    assert.equal(totais.total_credito, 22);
    assert.equal(totais.valor_medio, 180);
    assert.equal(totais.maior_compra, 800);
    assert.equal(totais.maior_credito, 12);
    assert.equal(totais.estabelecimentos, 3);
    assert.equal(totais.doadores, 2);
    // Retorno médio da carteira: 22 / 1440.
    assert.ok(Math.abs(totais.retorno_medio - 22 / 1440) < 1e-9);
  } finally {
    await close();
  }
});

test("as faixas de valor separam onde o retorno é melhor", async () => {
  const { conn, close } = await bootstrap();

  try {
    const faixas = await run(conn, buildNoteValueBandsSql({}));
    const porChave = new Map(
      faixas.map((item) => [NOTE_VALUE_BANDS[Number(item.banda)].key, item]),
    );

    // A compra de R$ 40 (farmácia) cai na primeira faixa e rende 30%.
    const ate50 = porChave.get("ate-50");
    assert.equal(ate50.notas, 1);
    assert.ok(Math.abs(ate50.retorno_medio - 0.3) < 1e-9);

    // As seis de R$ 100 caem na faixa seguinte e rendem 1%.
    const cem = porChave.get("100-200");
    assert.equal(cem.notas, 6);
    assert.ok(Math.abs(cem.retorno_medio - 0.01) < 1e-9);

    // A de R$ 800 é a única acima de R$ 500, e é a de pior retorno.
    const grande = porChave.get("acima-500");
    assert.equal(grande.notas, 1);
    assert.ok(Math.abs(grande.retorno_medio - 0.005) < 1e-9);

    // A soma das faixas tem de reproduzir o total — faixa que perde linha
    // faria a distribuição descrever um conjunto menor que a tabela.
    const somaNotas = faixas.reduce((total, item) => total + item.notas, 0);
    assert.equal(somaNotas, 8);
  } finally {
    await close();
  }
});

test("o ranking das compras excepcionais não é o ranking geral", async () => {
  const { conn, close } = await bootstrap();

  try {
    const excepcionais = await run(conn, buildTopNoteEstablishmentsSql({}));

    // O MERCADO domina o crédito TOTAL por volume (R$ 6,00 em 6 notas), mas
    // nenhuma nota dele está no decil superior. A pergunta aqui é outra.
    assert.equal(excepcionais.length, 1);
    assert.equal(excepcionais[0].estabelecimento, "FARMACIA POPULAR");
    assert.equal(excepcionais[0].total_credito, 12);
    assert.ok(excepcionais[0].corte_credito > 1);
  } finally {
    await close();
  }
});

test("o recorte por projeto usa o vínculo vigente no mês da nota", async () => {
  const { conn, close } = await bootstrap();

  try {
    const geral = (await run(conn, buildNoteTotalsSql({})))[0];
    const doProjeto = (
      await run(conn, buildNoteTotalsSql({ filters: { projectId: PROJETO } }), {
        projectId: PROJETO,
      })
    )[0];

    assert.equal(geral.notas, 8);
    // BIA não pertence ao projeto: as 3 compras dela saem da conta.
    assert.equal(doProjeto.notas, 5);
    assert.equal(doProjeto.doadores, 1);
  } finally {
    await close();
  }
});

test("os filtros de faixa, competência, CPF e nota recortam a listagem", async () => {
  const { conn, close } = await bootstrap();

  try {
    const caros = await run(
      conn,
      buildNoteRowsSql({ filters: { valueMin: 500 }, limit: 100 }),
      { valueMin: 500 },
    );
    assert.equal(caros.length, 1);
    assert.equal(caros[0].id, "na");

    const fevereiro = await run(
      conn,
      buildNoteRowsSql({ filters: { referenceMonth: "2025-02-01" }, limit: 100 }),
      { referenceMonth: "2025-02-01" },
    );
    assert.equal(fevereiro.length, 1);

    // Período personalizado é sobre a DATA DA COMPRA, não a competência.
    const periodo = await run(
      conn,
      buildNoteRowsSql({
        filters: { dateFrom: "2025-01-14", dateTo: "2025-01-16" },
        limit: 100,
      }),
      { dateFrom: "2025-01-14", dateTo: "2025-01-16" },
    );
    assert.equal(periodo.length, 1);
    assert.equal(periodo[0].id, "nf");

    // CPF pontuado tem de achar o CPF gravado só com dígitos.
    const porCpf = await run(
      conn,
      buildNoteRowsSql({ filters: { cpf: "2-2.2" }, limit: 100 }),
      { cpf: "2-2.2" },
    );
    assert.equal(porCpf.length, 3);

    const creditoAlto = await run(
      conn,
      buildNoteRowsSql({ filters: { creditMin: 5 }, limit: 100 }),
      { creditMin: 5 },
    );
    assert.equal(creditoAlto.length, 1);
    assert.equal(creditoAlto[0].id, "nf");
  } finally {
    await close();
  }
});

test("a busca por texto gera as cláusulas e os parâmetros esperados", () => {
  // Verificado aqui e não contra o banco: o bundle MVP do harness estoura em
  // `LIKE '%' || ? || '%'` dentro de prepared statement.
  const comTexto = buildNoteFilters({ search: "farmacia" });
  const clausula = comTexto.conditions.at(-1);

  assert.ok(clausula.includes("strip_accents"), "deve comparar sem acento");
  assert.ok(clausula.includes("note_base.estabelecimento"));
  assert.ok(clausula.includes("note_base.doador"));
  assert.ok(clausula.includes("note_base.numero_nota"));
  // Termo sem dígito não deve arrastar a varredura de CPF.
  assert.ok(!clausula.includes("note_base.cpf"));
  assert.deepEqual(comTexto.params.slice(-3), ["farmacia", "farmacia", "farmacia"]);

  const comDigitos = buildNoteFilters({ search: "529.982" });
  assert.ok(comDigitos.conditions.at(-1).includes("note_base.cpf"));
  assert.equal(comDigitos.params.at(-1), "529982");
});
