import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * A ordem entre marcar posse da transação e emitir o BEGIN.
 *
 * `connection.js` importa o DuckDB-WASM, que não sobe no Node — então o que
 * este teste exercita é a MECÂNICA do guard, reproduzida aqui com a mesma
 * forma das duas versões. Serve para travar a diferença entre elas: com a
 * marcação depois do await, duas chamadas concorrentes emitem dois BEGIN; com
 * a marcação antes, só uma emite e a outra roda junto.
 *
 * O sintoma real que isso causava: o segundo BEGIN é rejeitado pelo DuckDB e
 * ABORTA a transação em curso, então uma restauração de backup morria no meio
 * por causa de uma consulta de tela disparada no mesmo instante.
 */
function buildRunner({ markOwnershipBeforeBegin }) {
  let depth = 0;
  const log = [];

  async function begin() {
    // Cede o controle, como faz qualquer ida ao banco.
    await Promise.resolve();
    log.push("BEGIN");
  }

  return {
    log,
    async run(callback) {
      if (depth > 0) {
        log.push("inline");
        return callback();
      }

      if (markOwnershipBeforeBegin) {
        depth = 1;
        await begin();
      } else {
        await begin();
        depth = 1;
      }

      try {
        return await callback();
      } finally {
        depth = 0;
      }
    },
  };
}

test("marcar posse depois do BEGIN deixa duas chamadas concorrentes abrirem transação", async () => {
  const runner = buildRunner({ markOwnershipBeforeBegin: false });

  await Promise.all([
    runner.run(async () => {}),
    runner.run(async () => {}),
  ]);

  // Dois BEGIN — no banco real o segundo estoura e derruba o primeiro.
  assert.deepEqual(
    runner.log.filter((entry) => entry === "BEGIN").length,
    2,
  );
});

test("marcar posse antes do BEGIN faz a segunda chamada rodar junto", async () => {
  const runner = buildRunner({ markOwnershipBeforeBegin: true });

  await Promise.all([
    runner.run(async () => {}),
    runner.run(async () => {}),
  ]);

  assert.equal(runner.log.filter((entry) => entry === "BEGIN").length, 1);
  assert.equal(runner.log.filter((entry) => entry === "inline").length, 1);
});
