import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestConnection } from "./helpers/duckdbHelper.js";
import { runMigrations } from "../src/services/db/migrations.js";
import {
  BACKFILL_ASSIGNMENTS_SQL,
  BACKFILL_DEMAND_PROJECT_SQL,
  CREDIT_ATTRIBUTION_IDENTITY_SQL,
  CREDIT_BY_PROJECT_SQL,
  DEFAULT_PROJECT_ID,
  ENSURE_DEFAULT_PROJECT_SQL,
  OVERLAPPING_ASSIGNMENTS_SQL,
} from "../src/services/project/projectAssignmentSql.js";

/**
 * Plataforma multiprojeto — Fase 1.
 *
 * O invariante que estes testes protegem:
 *
 *   Σ(crédito por projeto) + Σ(não atribuído) = Σ(crédito conciliado)
 *
 * Se ele quebra, ou dinheiro sumiu da soma, ou foi contado duas vezes. É o
 * modo de falha mais grave do modelo e o mais barato de detectar.
 */

function rows(result) {
  return result.toArray().map((row) => row.toJSON());
}

async function seedDonor(conn, { id, name, cpf, isActive = true }) {
  await conn.query(`
    INSERT INTO donors (id, name, cpf, demand, donor_type, is_active, created_at, updated_at)
    VALUES ('${id}', '${name}', '${cpf}', 'Cestas', 'holder', ${isActive ? "TRUE" : "FALSE"},
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  await conn.query(`
    INSERT INTO donor_cpf_links (id, donor_id, name, cpf, link_type, is_active, created_at, updated_at)
    VALUES ('${id}-titular', '${id}', '${name}', '${cpf}', 'holder', TRUE,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
}

/** Uma nota de doação casada com uma nota de crédito — o caminho real. */
async function seedMatchedCredit(conn, { cpf, month, credito, suffix }) {
  await conn.query(`
    INSERT INTO donation_notes (id, import_id, cpf, numero_nota, valor_nota,
      cnpj_estabelecimento, reference_month, is_valid, created_at)
    VALUES ('dn-${suffix}', 'imp-1', '${cpf}', '${suffix}', 10.00,
            '11111111000111', DATE '${month}', TRUE, CURRENT_TIMESTAMP)
  `);
  await conn.query(`
    INSERT INTO credit_notes (id, credit_import_id, cnpj_estabelecimento, numero_nota,
      valor_nf, credito, situacao, is_valid, created_at)
    VALUES ('cn-${suffix}', 'ci-1', '11111111000111', '${suffix}', 10.00,
            ${credito}, 'Calculado', TRUE, CURRENT_TIMESTAMP)
  `);
  await conn.query(`
    INSERT INTO credit_reconciliation (id, credit_note_id, donation_note_id, match_status, created_at)
    VALUES ('cr-${suffix}', 'cn-${suffix}', 'dn-${suffix}', 'matched', CURRENT_TIMESTAMP)
  `);
}

async function readIdentity(conn) {
  const [row] = rows(await conn.query(CREDIT_ATTRIBUTION_IDENTITY_SQL));
  return {
    attributed: Number(row.com_projeto),
    unattributed: Number(row.sem_projeto),
    total: Number(row.total_conciliado),
    difference: Number(row.diferenca),
  };
}

test("v12 cria o projeto padrão e vincula todo doador — inclusive o inativo", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    // Simula uma base já em uso: doadores que existiam antes da v12.
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "d1", name: "Alice", cpf: "11111111111" });
    await seedDonor(conn, { id: "d2", name: "Bruno", cpf: "22222222222", isActive: false });

    await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
    await conn.query(BACKFILL_ASSIGNMENTS_SQL);

    const projects = rows(await conn.query(`SELECT id, modules FROM projects`));
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, DEFAULT_PROJECT_ID);
    // O projeto padrão é o sistema como ele existe hoje: tudo ligado.
    assert.equal(JSON.parse(projects[0].modules).monthly, true);

    const assignments = rows(
      await conn.query(`
        SELECT donor_id, project_id,
               CAST(valid_from AS VARCHAR) AS valid_from,
               CAST(valid_to AS VARCHAR) AS valid_to
        FROM donor_project_assignments ORDER BY donor_id
      `),
    );

    // O inativo também entra: ele continua carregando histórico de crédito.
    assert.deepEqual(assignments.map((row) => row.donor_id), ["d1", "d2"]);
    assert.ok(assignments.every((row) => row.project_id === DEFAULT_PROJECT_ID));
    assert.ok(assignments.every((row) => row.valid_from.startsWith("1900-01")));
    assert.ok(assignments.every((row) => row.valid_to.startsWith("9999-12")));
  } finally {
    conn.close();
  }
});

test("backfill é idempotente — o restore de backup roda as mesmas instruções", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "d1", name: "Alice", cpf: "11111111111" });

    for (let pass = 0; pass < 3; pass += 1) {
      await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
      await conn.query(BACKFILL_ASSIGNMENTS_SQL);
    }

    const [projectCount] = rows(await conn.query(`SELECT count(*) AS c FROM projects`));
    const [assignmentCount] = rows(
      await conn.query(`SELECT count(*) AS c FROM donor_project_assignments`),
    );
    assert.equal(Number(projectCount.c), 1);
    assert.equal(Number(assignmentCount.c), 1);
  } finally {
    conn.close();
  }
});

test("o crédito segue o projeto vigente NO MÊS DA NOTA e o histórico não se move", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "joao", name: "Joao", cpf: "11111111111" });
    await conn.query(`
      INSERT INTO projects (id, name, slug, modules, color, is_active, created_at, updated_at)
      VALUES ('prj-moradia', 'Moradia', 'moradia', '{}', '#111', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
             ('prj-comecar', 'Comecar', 'comecar', '{}', '#222', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    // João em Moradia até dez/2025; a partir de jan/2026, Começar de Novo.
    await conn.query(`
      INSERT INTO donor_project_assignments (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('a1', 'joao', 'prj-moradia', DATE '1900-01-01', DATE '2025-12-01', 'inicial', CURRENT_TIMESTAMP),
             ('a2', 'joao', 'prj-comecar', DATE '2026-01-01', DATE '9999-12-01', 'transferencia', CURRENT_TIMESTAMP)
    `);

    await seedMatchedCredit(conn, { cpf: "11111111111", month: "2025-11-01", credito: 12, suffix: "nov" });
    await seedMatchedCredit(conn, { cpf: "11111111111", month: "2025-12-01", credito: 8, suffix: "dez" });
    await seedMatchedCredit(conn, { cpf: "11111111111", month: "2026-01-01", credito: 10, suffix: "jan" });

    const byKey = new Map(
      rows(await conn.query(CREDIT_BY_PROJECT_SQL)).map((row) => [
        `${row.project_id}|${row.reference_month}`,
        Number(row.total_credit),
      ]),
    );

    assert.equal(byKey.get("prj-moradia|2025-11-01"), 12);
    assert.equal(byKey.get("prj-moradia|2025-12-01"), 8);
    assert.equal(byKey.get("prj-comecar|2026-01-01"), 10);
    // O ponto central da regra de negócio: nada de 2025 migrou para o
    // projeto novo quando João foi transferido.
    assert.equal(byKey.get("prj-comecar|2025-11-01"), undefined);
    assert.equal(byKey.get("prj-comecar|2025-12-01"), undefined);

    assert.deepEqual(await readIdentity(conn), {
      attributed: 30,
      unattributed: 0,
      total: 30,
      difference: 0,
    });
  } finally {
    conn.close();
  }
});

test("planilha retroativa cai no projeto vigente à época, não no atual", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "joao", name: "Joao", cpf: "11111111111" });
    await conn.query(`
      INSERT INTO projects (id, name, slug, modules, color, is_active, created_at, updated_at)
      VALUES ('prj-moradia', 'Moradia', 'moradia', '{}', '#111', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
             ('prj-comecar', 'Comecar', 'comecar', '{}', '#222', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await conn.query(`
      INSERT INTO donor_project_assignments (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('a1', 'joao', 'prj-moradia', DATE '1900-01-01', DATE '2025-12-01', 'inicial', CURRENT_TIMESTAMP),
             ('a2', 'joao', 'prj-comecar', DATE '2026-01-01', DATE '9999-12-01', 'transferencia', CURRENT_TIMESTAMP)
    `);

    // Uma nota de OUTUBRO/2025 importada só agora, depois da transferência.
    // A junção é pelo mês da nota, então tem que ir para Moradia. Se algum
    // dia alguém trocar para a data da importação, este teste quebra.
    await seedMatchedCredit(conn, { cpf: "11111111111", month: "2025-10-01", credito: 4, suffix: "out" });

    const byKey = new Map(
      rows(await conn.query(CREDIT_BY_PROJECT_SQL)).map((row) => [
        `${row.project_id}|${row.reference_month}`,
        Number(row.total_credit),
      ]),
    );
    assert.equal(byKey.get("prj-moradia|2025-10-01"), 4);
    assert.equal(byKey.get("prj-comecar|2025-10-01"), undefined);
  } finally {
    conn.close();
  }
});

test("crédito sem vínculo vigente vira 'não atribuído' — nunca desaparece", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "sem", name: "Sem Vinculo", cpf: "33333333333" });
    await seedDonor(conn, { id: "com", name: "Com Vinculo", cpf: "44444444444" });
    await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
    await conn.query(`
      INSERT INTO donor_project_assignments (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('a1', 'com', '${DEFAULT_PROJECT_ID}', DATE '1900-01-01', DATE '9999-12-01', 'inicial', CURRENT_TIMESTAMP)
    `);

    await seedMatchedCredit(conn, { cpf: "33333333333", month: "2026-01-01", credito: 7, suffix: "s1" });
    await seedMatchedCredit(conn, { cpf: "44444444444", month: "2026-01-01", credito: 3, suffix: "c1" });

    // A junção é LEFT de propósito: com INNER, os R$ 7 do doador sem vínculo
    // sumiriam da soma sem aparecer em lugar nenhum.
    assert.deepEqual(await readIdentity(conn), {
      attributed: 3,
      unattributed: 7,
      total: 10,
      difference: 0,
    });
  } finally {
    conn.close();
  }
});

test("nota anterior ao início da vigência fica não atribuída, e a soma continua fechando", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "d1", name: "Alice", cpf: "11111111111" });
    await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
    await conn.query(`
      INSERT INTO donor_project_assignments (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('a1', 'd1', '${DEFAULT_PROJECT_ID}', DATE '2026-01-01', DATE '9999-12-01', 'inicial', CURRENT_TIMESTAMP)
    `);

    await seedMatchedCredit(conn, { cpf: "11111111111", month: "2025-11-01", credito: 6, suffix: "antes" });
    await seedMatchedCredit(conn, { cpf: "11111111111", month: "2026-02-01", credito: 4, suffix: "depois" });

    assert.deepEqual(await readIdentity(conn), {
      attributed: 4,
      unattributed: 6,
      total: 10,
      difference: 0,
    });
  } finally {
    conn.close();
  }
});

test("vigência sobreposta é detectável — e é o que quebra a identidade", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "dup", name: "Duplicado", cpf: "55555555555" });
    await conn.query(`
      INSERT INTO projects (id, name, slug, modules, color, is_active, created_at, updated_at)
      VALUES ('prj-a', 'A', 'a', '{}', '#111', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
             ('prj-b', 'B', 'b', '{}', '#222', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    // Duas janelas FECHADAS que se cruzam. O índice único em
    // (donor_id, valid_to) garante um vínculo aberto por doador, mas não pega
    // este caso — só a checagem dedicada pega.
    await conn.query(`
      INSERT INTO donor_project_assignments (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('x1', 'dup', 'prj-a', DATE '2026-01-01', DATE '2026-06-01', 'inicial', CURRENT_TIMESTAMP),
             ('x2', 'dup', 'prj-b', DATE '2026-04-01', DATE '2026-09-01', 'inicial', CURRENT_TIMESTAMP)
    `);

    const overlaps = rows(await conn.query(OVERLAPPING_ASSIGNMENTS_SQL));
    assert.equal(overlaps.length, 1);
    assert.equal(overlaps[0].donor_id, "dup");

    // O efeito prático da sobreposição: um mês coberto pelas duas janelas é
    // contado nos dois projetos, e a identidade acusa a diferença.
    await seedMatchedCredit(conn, { cpf: "55555555555", month: "2026-05-01", credito: 5, suffix: "d1" });
    const identity = await readIdentity(conn);
    assert.equal(identity.total, 5);
    assert.equal(identity.attributed, 10);
    assert.equal(identity.difference, 5);
  } finally {
    conn.close();
  }
});

test("base sem sobreposição não acusa nada", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    await conn.query(`DELETE FROM donor_project_assignments`);
    await seedDonor(conn, { id: "d1", name: "Alice", cpf: "11111111111" });
    await conn.query(ENSURE_DEFAULT_PROJECT_SQL);
    await conn.query(BACKFILL_ASSIGNMENTS_SQL);
    // Janelas contíguas mas sem encostar: fecha em dez, abre em jan.
    await conn.query(`
      UPDATE donor_project_assignments SET valid_to = DATE '2025-12-01' WHERE donor_id = 'd1'
    `);
    await conn.query(`
      INSERT INTO donor_project_assignments (id, donor_id, project_id, valid_from, valid_to, reason, created_at)
      VALUES ('a2', 'd1', '${DEFAULT_PROJECT_ID}', DATE '2026-01-01', DATE '9999-12-01', 'transferencia', CURRENT_TIMESTAMP)
    `);

    assert.equal(rows(await conn.query(OVERLAPPING_ASSIGNMENTS_SQL)).length, 0);
  } finally {
    conn.close();
  }
});

test("v13 põe as demandas existentes no projeto padrão e torna o nome único POR projeto", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);

    const demands = rows(
      await conn.query(`SELECT id, project_id, name FROM demands`),
    );
    // Base nova não tem demanda; o que importa é a coluna existir e o
    // backfill não deixar nenhuma órfã.
    assert.ok(demands.every((row) => row.project_id === DEFAULT_PROJECT_ID));

    await conn.query(`
      INSERT INTO projects (id, name, slug, modules, color, is_active, created_at, updated_at)
      VALUES ('prj-capoeira', 'Capoeira', 'capoeira', '{}', '#222', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    // O MESMO nome em dois projetos precisa conviver — era exatamente o que
    // o índice único global impedia antes da v13.
    await conn.query(`
      INSERT INTO demands (id, project_id, name, color, is_active, created_at, updated_at)
      VALUES ('dm-1', '${DEFAULT_PROJECT_ID}', 'Cestas Basicas', '#111', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
             ('dm-2', 'prj-capoeira', 'Cestas Basicas', '#222', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const both = rows(
      await conn.query(`SELECT project_id FROM demands WHERE name = 'Cestas Basicas' ORDER BY project_id`),
    );
    assert.deepEqual(both.map((row) => row.project_id), [
      "prj-capoeira",
      DEFAULT_PROJECT_ID,
    ]);
  } finally {
    conn.close();
  }
});

test("demanda restaurada de backup antigo (sem project_id) é adotada pelo projeto padrão", async () => {
  const conn = await createTestConnection();
  try {
    await runMigrations(conn);
    // Simula o restore de um arquivo anterior à v13: a coluna existe no
    // schema, mas o backup não trazia valor para ela.
    await conn.query(`
      INSERT INTO demands (id, name, color, is_active, created_at, updated_at)
      VALUES ('antiga', 'Remedios', '#111', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await conn.query(BACKFILL_DEMAND_PROJECT_SQL);

    const [row] = rows(
      await conn.query(`SELECT project_id FROM demands WHERE id = 'antiga'`),
    );
    assert.equal(row.project_id, DEFAULT_PROJECT_ID);
  } finally {
    conn.close();
  }
});
