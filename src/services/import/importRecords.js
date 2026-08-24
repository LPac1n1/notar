import { nanoid } from "nanoid";
import {
  executePrepared,
  normalizeCpf,
  queryPrepared,
  runInTransaction,
  startOfMonth,
} from "../db";
import { reconcileImport } from "./importReconcile";
import {
} from "./sqlExpressions";
import {
  parseValuePerNote,
  toPositiveInteger,
} from "../../utils/import";

/**
 * Escrita das linhas de `imports` e `import_cpf_summary`.
 *
 * Separado da leitura da planilha porque e o ponto onde a importacao vira
 * estado persistido — e onde `reconcileImport` e encadeado.
 */

export async function createImportRecord({
  id = nanoid(),
  referenceMonth,
  fileName,
  valuePerNote,
  status = "processed",
  notes = "",
}, { emitChange = true } = {}) {
  const normalizedMonth = startOfMonth(referenceMonth);
  const numericValuePerNote = parseValuePerNote(valuePerNote);

  if (!normalizedMonth) {
    throw new Error("Informe um mês de referência válido para a importação.");
  }

  if (numericValuePerNote === null) {
    throw new Error("Informe um valor por nota maior que zero.");
  }

  const existingImport = await queryPrepared(
    `
    SELECT id
    FROM imports
    WHERE reference_month = ?
    LIMIT 1
  `,
    [normalizedMonth],
  );

  if (existingImport.length > 0) {
    throw new Error(
      "Já existe uma importação cadastrada para esse mês. Exclua a importação anterior antes de importar novamente.",
    );
  }

  // `fileName` and `notes` are user-supplied strings — bind them through a
  // prepared statement so any future pathological inputs are isolated from
  // the SQL boundary entirely.
  await executePrepared(
    `
      INSERT INTO imports (
        id,
        reference_month,
        file_name,
        value_per_note,
        status,
        notes,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      id,
      normalizedMonth,
      fileName || "importacao-manual",
      numericValuePerNote,
      status,
      notes,
    ],
    { flush: emitChange },
  );

  return id;
}

export async function saveImportCpfSummary({
  importId,
  referenceMonth,
  cpfCounts,
}, { emitChange = true } = {}) {
  const normalizedMonth = startOfMonth(referenceMonth);

  if (!importId || !normalizedMonth) {
    throw new Error("Importação e mês de referência são obrigatórios.");
  }

  // Filter + normalize once outside the SQL hot path so the bulk INSERT
  // below builds its VALUES list directly from the cleaned data.
  const validEntries = [];
  let totalRows = 0;
  for (const item of cpfCounts) {
    const normalizedCpf = normalizeCpf(item.cpf);
    const notesCount = toPositiveInteger(item.notesCount);
    const invalidNotesCount = toPositiveInteger(item.invalidNotesCount);

    if (normalizedCpf.length !== 11) continue;
    if (notesCount === 0 && invalidNotesCount === 0) continue;

    totalRows += notesCount;
    validEntries.push({ normalizedCpf, notesCount, invalidNotesCount });
  }

  await runInTransaction(
    async () => {
      await executePrepared(
        `
        DELETE FROM import_cpf_summary
        WHERE import_id = ?
      `,
        [importId],
      );

      // Chunked multi-row INSERT — single-row INSERT in a loop costs one
      // SQL parse + plan + execute roundtrip per CPF, which on a 10k+
      // entry planilha pegged the CPU for tens of seconds (each
      // statement went through DuckDB-WASM's single-threaded executor).
      // Packing 200 rows per statement collapses that into ~50 SQL calls
      // instead of 10k, while keeping each statement comfortably under
      // DuckDB's parsed-SQL size limit.
      if (validEntries.length > 0) {
        const BULK_INSERT_CHUNK_SIZE = 200;
        // Uma tupla de marcadores por linha do bloco, e todos os valores num
        // array plano. O SQL passa a variar só na QUANTIDADE de tuplas, nunca
        // no conteúdo — mesmo padrão já usado no bulk insert de reconcileImport.
        const ROW_PLACEHOLDERS = "(?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)";

        for (
          let chunkStart = 0;
          chunkStart < validEntries.length;
          chunkStart += BULK_INSERT_CHUNK_SIZE
        ) {
          const chunk = validEntries.slice(
            chunkStart,
            chunkStart + BULK_INSERT_CHUNK_SIZE,
          );
          const valuesSql = chunk.map(() => ROW_PLACEHOLDERS).join(",\n");
          const params = chunk.flatMap((entry) => [
            nanoid(),
            importId,
            normalizedMonth,
            entry.normalizedCpf,
            entry.notesCount,
            entry.invalidNotesCount,
          ]);

          await executePrepared(
            `
            INSERT INTO import_cpf_summary (
              id,
              import_id,
              reference_month,
              cpf,
              notes_count,
              invalid_notes_count,
              is_registered_donor,
              updated_at
            )
            VALUES ${valuesSql}
          `,
            params,
          );
        }
      }

      await executePrepared(
        `
        UPDATE imports
        SET
          reference_month = ?,
          total_rows = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [normalizedMonth, totalRows, importId],
      );
    },
    { emitChange: false },
  );

  await reconcileImport(importId, { emitChange });
}
