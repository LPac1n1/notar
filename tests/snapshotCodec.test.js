import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import {
  bigintToNumberReplacer,
  compressSnapshot,
  isGzipBlob,
  readSnapshotBlob,
  serializeSnapshot,
} from "../src/services/db/snapshotCodec.js";

// O codec é o que separa "os dados do usuário chegaram no servidor" de "um
// blob ilegível chegou no servidor". Round-trip real: CompressionStream e
// DecompressionStream existem no Node 18+ e no navegador.

function buildSnapshot(noteCount) {
  return {
    version: 1,
    data: {
      donationNotes: Array.from({ length: noteCount }, (_, i) => ({
        id: `dn-${i}`,
        cpf: "11144477735",
        numero_nota: String(400000 + i),
        valor_nota: 342.55,
        match_key: `12345678000199|${400000 + i}`,
        created_at: "2026-08-10 09:00:00",
      })),
    },
  };
}

test("compress → read round-trips the payload byte for byte", async () => {
  const payload = buildSnapshot(200);
  const json = serializeSnapshot(payload);

  const { blob, compressed } = await compressSnapshot(json);
  assert.equal(compressed, true, "CompressionStream deveria estar disponível");
  assert.equal(await isGzipBlob(blob), true);

  const restored = await readSnapshotBlob(blob);
  assert.equal(restored, json);
  assert.deepEqual(JSON.parse(restored), payload);
});

test("reading stays compatible with the uncompressed snapshots written before gzip", async () => {
  // Snapshots gravados antes da compressão existir são JSON puro no bucket.
  // Se o leitor exigisse gzip, todo usuário antigo perderia acesso aos dados
  // no primeiro carregamento.
  const json = serializeSnapshot(buildSnapshot(3));
  const plain = new Blob([json], { type: "application/json" });

  assert.equal(await isGzipBlob(plain), false);
  assert.equal(await readSnapshotBlob(plain), json);
});

test("reads gzip produced elsewhere, not just by our own writer", async () => {
  // Garante que o formato é gzip padrão (e não algo que só o nosso par
  // escreve/lê) — comprimido pelo zlib do Node, lido pelo codec do app.
  const json = serializeSnapshot(buildSnapshot(5));
  const blob = new Blob([gzipSync(Buffer.from(json, "utf-8"))]);

  assert.equal(await isGzipBlob(blob), true);
  assert.equal(await readSnapshotBlob(blob), json);
});

test("compression actually shrinks a realistic snapshot", async () => {
  // Não é micro-otimização: é o que mantém o upload viável conforme a base
  // cresce. Linhas de nota são muito repetitivas, então a taxa é alta.
  const json = serializeSnapshot(buildSnapshot(5000));
  const { blob } = await compressSnapshot(json);

  const rawBytes = new TextEncoder().encode(json).length;
  const ratio = rawBytes / blob.size;
  assert.ok(
    ratio > 5,
    `esperava compressão relevante, obteve ${ratio.toFixed(1)}x`,
  );
});

test("BigInt columns survive serialization", async () => {
  // DuckDB-WASM devolve BIGINT (ex.: valor_cents) como BigInt, que o
  // JSON.stringify padrão rejeita com TypeError — o que abortaria o upload
  // inteiro e deixaria o usuário sem sincronizar sem saber por quê.
  const payload = { data: { rows: [{ valor_cents: 34255n, id: "a" }] } };

  const json = serializeSnapshot(payload);
  assert.equal(JSON.parse(json).data.rows[0].valor_cents, 34255);

  const restored = JSON.parse(await readSnapshotBlob((await compressSnapshot(json)).blob));
  assert.equal(restored.data.rows[0].valor_cents, 34255);
});

test("replacer leaves non-BigInt values untouched", () => {
  assert.equal(bigintToNumberReplacer("k", "texto"), "texto");
  assert.equal(bigintToNumberReplacer("k", 12.5), 12.5);
  assert.equal(bigintToNumberReplacer("k", null), null);
  assert.equal(bigintToNumberReplacer("k", true), true);
  assert.equal(bigintToNumberReplacer("k", 9007199254740993n), 9007199254740992);
});

test("empty and minimal payloads round-trip cleanly", async () => {
  for (const payload of [{}, { version: 1, data: {} }, { data: { rows: [] } }]) {
    const json = serializeSnapshot(payload);
    const { blob } = await compressSnapshot(json);
    assert.deepEqual(JSON.parse(await readSnapshotBlob(blob)), payload);
  }
});

test("accented content survives the round-trip", async () => {
  // Nomes de doador e demanda são acentuados; um erro de encoding aqui
  // corromperia todos eles de uma vez.
  const payload = {
    data: { donors: [{ name: "JOÃO DA CONCEIÇÃO", demand: "CESTAS BÁSICAS" }] },
  };
  const json = serializeSnapshot(payload);
  const { blob } = await compressSnapshot(json);

  assert.deepEqual(JSON.parse(await readSnapshotBlob(blob)), payload);
});
