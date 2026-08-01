import { GZIP_MAGIC_BYTES } from "./cloudSyncDecisions.js";

/**
 * Serialização do snapshot que vai e volta do Supabase Storage.
 *
 * Sem imports de rede ou de banco, para a suíte conseguir exercitar o
 * round-trip de verdade — `CompressionStream`/`DecompressionStream` existem
 * tanto no navegador quanto no Node 18+.
 */

/**
 * `JSON.stringify` replacer que rebaixa BigInt para Number. O DuckDB-WASM
 * devolve colunas BIGINT (ex.: `donation_notes.valor_cents`) como BigInt, que
 * o serializador padrão não sabe converter. Centavos cabem folgado abaixo de
 * `Number.MAX_SAFE_INTEGER`, então a conversão não perde precisão no domínio.
 */
export function bigintToNumberReplacer(_key, value) {
  return typeof value === "bigint" ? Number(value) : value;
}

export function serializeSnapshot(payload) {
  return JSON.stringify(payload, bigintToNumberReplacer);
}

/**
 * Comprime o JSON com gzip. Cai para não-comprimido quando
 * `CompressionStream` não existe (Safari antigo / ambientes não-padrão) — o
 * leitor detecta o formato pelos magic bytes, então os dois convivem.
 */
export async function compressSnapshot(jsonString) {
  if (typeof CompressionStream === "undefined") {
    return {
      blob: new Blob([jsonString], { type: "application/json" }),
      contentType: "application/json",
      compressed: false,
    };
  }

  try {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(jsonString));
        controller.close();
      },
    });
    const compressed = stream.pipeThrough(new CompressionStream("gzip"));
    const blob = await new Response(compressed).blob();
    return { blob, contentType: "application/gzip", compressed: true };
  } catch {
    return {
      blob: new Blob([jsonString], { type: "application/json" }),
      contentType: "application/json",
      compressed: false,
    };
  }
}

export async function isGzipBlob(blob) {
  try {
    const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    return (
      header[0] === GZIP_MAGIC_BYTES[0] && header[1] === GZIP_MAGIC_BYTES[1]
    );
  } catch {
    return false;
  }
}

/**
 * Lê um Blob que pode estar comprimido. Compatível com os snapshots antigos,
 * gravados em JSON puro antes da compressão existir.
 */
export async function readSnapshotBlob(blob) {
  try {
    if ((await isGzipBlob(blob)) && typeof DecompressionStream !== "undefined") {
      const decompressed = blob
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      return new Response(decompressed).text();
    }
  } catch {
    // Cai para texto puro se a descompressão falhar de forma inesperada.
  }
  return blob.text();
}
