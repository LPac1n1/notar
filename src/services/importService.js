import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  normalizeCpf,
  notifyDatabaseChanged,
  query,
  releaseRegisteredFile,
  registerFileText,
  runInTransaction,
  startOfMonth,
} from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import {
  INVALID_ORDER_STATUS_PATTERNS,
  detectCpfColumn,
  detectOrderStatusColumn,
  getImportFileExtension,
  isExcelImportExtension,
  isSupportedImportExtension,
  parseValuePerNote,
  toPositiveInteger,
} from "../utils/import";
import { getErrorMessage } from "../utils/error";

function escapeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function buildCsvSource(fileName) {
  return `read_csv_auto('${escapeSqlString(fileName)}', all_varchar = true)`;
}

function normalizeCpfSqlExpression(expression) {
  return `
    replace(
      replace(
        replace(
          replace(
            replace(trim(coalesce(${expression}, '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      ),
      ',',
      ''
    )
  `;
}

async function registerSpreadsheetPreviewFile(file, registeredFileName) {
  const fileExtension = getImportFileExtension(file.name);

  if (isExcelImportExtension(fileExtension)) {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const fileBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(fileBuffer);

    const worksheet =
      workbook.worksheets.find(
        (currentWorksheet) =>
          currentWorksheet.actualRowCount > 0 ||
          currentWorksheet.actualColumnCount > 0,
      ) ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("A planilha do Excel não possui nenhuma aba com dados.");
    }

    const csvBuffer = await workbook.csv.writeBuffer({
      sheetName: worksheet.name,
    });
    const csvText = new TextDecoder("utf-8").decode(csvBuffer);
    await registerFileText(registeredFileName, csvText);

    return {
      sourceType: "excel",
      worksheetName: worksheet.name,
      worksheetCount: workbook.worksheets.length,
    };
  }

  const fileText = await file.text();
  await registerFileText(registeredFileName, fileText);

  return {
    sourceType: "text",
    worksheetName: "",
    worksheetCount: 0,
  };
}

export async function prepareImportPreview(file) {
  if (!file) {
    throw new Error("Selecione um arquivo para importar.");
  }

  const fileExtension = getImportFileExtension(file.name);

  if (!isSupportedImportExtension(fileExtension)) {
    throw new Error(
      "Por enquanto, a importação suporta apenas arquivos CSV, TXT ou XLSX.",
    );
  }

  const registeredFileName = `${nanoid()}-${file.name}`;
  try {
    const sourceMetadata = await registerSpreadsheetPreviewFile(
      file,
      registeredFileName,
    );

    const columns = await query(`
      DESCRIBE SELECT *
      FROM ${buildCsvSource(registeredFileName)}
    `);

    const previewRows = await query(`
      SELECT *
      FROM ${buildCsvSource(registeredFileName)}
      LIMIT 5
    `);

    const columnNames = columns.map((column) => column.column_name);
    const cpfColumn = detectCpfColumn(columnNames);

    return {
      registeredFileName,
      originalFileName: file.name,
      columns: columnNames,
      previewRows,
      detectedCpfColumn: cpfColumn ?? "",
      sourceType: sourceMetadata.sourceType,
      worksheetName: sourceMetadata.worksheetName,
      worksheetCount: sourceMetadata.worksheetCount,
    };
  } catch (error) {
    await releaseRegisteredFile(registeredFileName);
    throw error;
  }
}

export async function listImports(filters = {}) {
  const {
    importId = "",
    fileName = "",
    referenceMonth = "",
    status = "",
  } = filters;
  const conditions = [];

  if (importId.trim()) {
    conditions.push(`id = '${escapeSqlString(importId.trim())}'`);
  }

  if (fileName.trim()) {
    conditions.push(
      `lower(file_name) LIKE lower('%${escapeSqlString(fileName.trim())}%')`,
    );
  }

  if (referenceMonth) {
    conditions.push(
      `reference_month = '${escapeSqlString(startOfMonth(referenceMonth))}'`,
    );
  }

  if (status.trim()) {
    conditions.push(
      `lower(status) = lower('${escapeSqlString(status.trim())}')`,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      file_name,
      value_per_note,
      total_rows,
      matched_rows,
      matched_donors,
      status,
      notes,
      strftime(imported_at, '%Y-%m-%d %H:%M:%S') AS imported_at
    FROM imports
    ${whereClause}
    ORDER BY reference_month DESC, imported_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    referenceMonth: row.reference_month,
    fileName: row.file_name,
    valuePerNote: Number(row.value_per_note ?? 0),
    totalRows: Number(row.total_rows ?? 0),
    matchedRows: Number(row.matched_rows ?? 0),
    matchedDonors: Number(row.matched_donors ?? 0),
    status: row.status,
    notes: row.notes ?? "",
    importedAt: row.imported_at,
  }));
}

export async function listImportCpfSummary({
  importId,
  referenceMonth = "",
  cpf = "",
  donorId = "",
  demand = "",
  registrationFilter = "all",
} = {}) {
  const conditions = [];

  if (importId) {
    conditions.push(`import_cpf_summary.import_id = '${escapeSqlString(importId)}'`);
  }

  if (referenceMonth) {
    conditions.push(
      `import_cpf_summary.reference_month = '${escapeSqlString(
        startOfMonth(referenceMonth),
      )}'`,
    );
  }

  if (cpf.trim()) {
    conditions.push(
      `import_cpf_summary.cpf = '${escapeSqlString(normalizeCpf(cpf))}'`,
    );
  }

  if (donorId.trim()) {
    conditions.push(
      `donors.id = '${escapeSqlString(donorId.trim())}'`,
    );
  }

  if (demand.trim()) {
    conditions.push(
      `lower(coalesce(donors.demand, '')) = lower('${escapeSqlString(
        demand.trim(),
      )}')`,
    );
  }

  if (registrationFilter === "registered") {
    conditions.push("is_registered_donor = TRUE");
  }

  if (registrationFilter === "unregistered") {
    conditions.push("is_registered_donor = FALSE");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT
      import_cpf_summary.id,
      import_cpf_summary.import_id,
      strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
      import_cpf_summary.cpf,
      import_cpf_summary.notes_count,
      import_cpf_summary.matched_donor_id,
      import_cpf_summary.matched_source_id,
      import_cpf_summary.is_registered_donor,
      imports.file_name,
      donors.name AS donor_name,
      donors.demand AS demand,
      donors.donor_type AS donor_type,
      donors.holder_donor_id,
      donors.holder_person_id,
      coalesce(holder_people.name, holder_donors.name) AS holder_name,
      coalesce(holder_people.cpf, holder_donors.cpf) AS holder_cpf,
      holder_active_donors.id AS active_holder_donor_id,
      donor_cpf_links.name AS source_name,
      donor_cpf_links.link_type AS source_type
    FROM import_cpf_summary
    INNER JOIN imports
      ON imports.id = import_cpf_summary.import_id
    LEFT JOIN donors
      ON donors.id = import_cpf_summary.matched_donor_id
    LEFT JOIN donors AS holder_donors
      ON holder_donors.id = donors.holder_donor_id
    LEFT JOIN people AS holder_people
      ON holder_people.id = donors.holder_person_id
    LEFT JOIN donors AS holder_active_donors
      ON holder_active_donors.person_id = donors.holder_person_id
      AND holder_active_donors.donor_type = 'holder'
      AND holder_active_donors.is_active = TRUE
    LEFT JOIN donor_cpf_links
      ON donor_cpf_links.id = import_cpf_summary.matched_source_id
    ${whereClause}
    ORDER BY import_cpf_summary.cpf ASC, import_cpf_summary.reference_month DESC
  `);

  const cpfSummaryMap = new Map();

  for (const row of rows) {
    const cpfKey = row.cpf;
    const notesCount = Number(row.notes_count ?? 0);

    if (!cpfSummaryMap.has(cpfKey)) {
      cpfSummaryMap.set(cpfKey, {
        id: cpfKey,
        cpf: row.cpf,
        totalNotesCount: 0,
        matchedDonorId: row.matched_donor_id ?? "",
        matchedSourceId: row.matched_source_id ?? "",
        isRegisteredDonor: Boolean(row.is_registered_donor),
        donorName: row.donor_name ?? "",
        sourceName: row.source_name ?? "",
        sourceType: row.source_type ?? "",
        donorType: row.donor_type ?? "",
        holderDonorId: row.active_holder_donor_id ?? row.holder_donor_id ?? "",
        holderPersonId: row.holder_person_id ?? "",
        holderName: row.holder_name ?? "",
        holderCpf: row.holder_cpf ?? "",
        holderIsActiveDonor: Boolean(row.active_holder_donor_id),
        demand: row.demand ?? "",
        appearancesByMonth: new Map(),
      });
    }

    const currentSummary = cpfSummaryMap.get(cpfKey);
    currentSummary.totalNotesCount += notesCount;

    if (row.is_registered_donor) {
      currentSummary.matchedDonorId = row.matched_donor_id ?? "";
      currentSummary.matchedSourceId = row.matched_source_id ?? "";
      currentSummary.isRegisteredDonor = true;
      currentSummary.donorName = row.donor_name ?? "";
      currentSummary.sourceName = row.source_name ?? "";
      currentSummary.sourceType = row.source_type ?? "";
      currentSummary.donorType = row.donor_type ?? "";
      currentSummary.holderDonorId =
        row.active_holder_donor_id ?? row.holder_donor_id ?? "";
      currentSummary.holderPersonId = row.holder_person_id ?? "";
      currentSummary.holderName = row.holder_name ?? "";
      currentSummary.holderCpf = row.holder_cpf ?? "";
      currentSummary.holderIsActiveDonor = Boolean(row.active_holder_donor_id);
      currentSummary.demand = row.demand ?? "";
    }

    const appearanceKey = row.reference_month;
    if (!currentSummary.appearancesByMonth.has(appearanceKey)) {
      currentSummary.appearancesByMonth.set(appearanceKey, {
        referenceMonth: row.reference_month,
        notesCount: 0,
        fileNames: new Set(),
        importIds: new Set(),
      });
    }

    const currentAppearance = currentSummary.appearancesByMonth.get(appearanceKey);
    currentAppearance.notesCount += notesCount;
    currentAppearance.fileNames.add(row.file_name);
    currentAppearance.importIds.add(row.import_id);
  }

  return Array.from(cpfSummaryMap.values())
    .map((item) => {
      const appearances = Array.from(item.appearancesByMonth.values())
        .map((appearance) => ({
          referenceMonth: appearance.referenceMonth,
          notesCount: appearance.notesCount,
          fileNames: Array.from(appearance.fileNames),
          importIds: Array.from(appearance.importIds),
        }))
        .sort((left, right) =>
          right.referenceMonth.localeCompare(left.referenceMonth),
        );

      return {
        id: item.id,
        cpf: item.cpf,
        notesCount: item.totalNotesCount,
        matchedDonorId: item.matchedDonorId,
        matchedSourceId: item.matchedSourceId,
        isRegisteredDonor: item.isRegisteredDonor,
        donorName: item.donorName,
        sourceName: item.sourceName,
        sourceType: item.sourceType,
        donorType: item.donorType,
        holderDonorId: item.holderDonorId,
        holderPersonId: item.holderPersonId,
        holderName: item.holderName,
        holderCpf: item.holderCpf,
        holderIsActiveDonor: item.holderIsActiveDonor,
        demand: item.demand,
        monthCount: appearances.length,
        appearances,
      };
    })
    .sort((left, right) => {
      if (right.notesCount !== left.notesCount) {
        return right.notesCount - left.notesCount;
      }

      return left.cpf.localeCompare(right.cpf);
    });
}

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

  const existingImport = await query(`
    SELECT id
    FROM imports
    WHERE reference_month = '${escapeSqlString(normalizedMonth)}'
    LIMIT 1
  `);

  if (existingImport.length > 0) {
    throw new Error(
      "Já existe uma importação cadastrada para esse mês. Exclua a importação anterior antes de importar novamente.",
    );
  }

  await execute(`
    INSERT INTO imports (
      id,
      reference_month,
      file_name,
      value_per_note,
      status,
      notes,
      updated_at
    )
    VALUES (
      '${escapeSqlString(id)}',
      '${escapeSqlString(normalizedMonth)}',
      '${escapeSqlString(fileName || "importacao-manual")}',
      ${numericValuePerNote},
      '${escapeSqlString(status)}',
      '${escapeSqlString(notes)}',
      CURRENT_TIMESTAMP
    )
  `, { flush: emitChange });

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

  await runInTransaction(
    async () => {
      await execute(`
        DELETE FROM import_cpf_summary
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      let totalRows = 0;

      for (const item of cpfCounts) {
        const normalizedCpf = normalizeCpf(item.cpf);
        const notesCount = toPositiveInteger(item.notesCount);

        if (normalizedCpf.length !== 11 || notesCount === 0) {
          continue;
        }

        totalRows += notesCount;

        await execute(`
          INSERT INTO import_cpf_summary (
            id,
            import_id,
            reference_month,
            cpf,
            notes_count,
            is_registered_donor,
            updated_at
          )
          VALUES (
            '${escapeSqlString(nanoid())}',
            '${escapeSqlString(importId)}',
            '${escapeSqlString(normalizedMonth)}',
            '${escapeSqlString(normalizedCpf)}',
            ${notesCount},
            FALSE,
            CURRENT_TIMESTAMP
          )
        `);
      }

      await execute(`
        UPDATE imports
        SET
          reference_month = '${escapeSqlString(normalizedMonth)}',
          total_rows = ${totalRows},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = '${escapeSqlString(importId)}'
      `);
    },
    { emitChange: false },
  );

  await reconcileImport(importId, { emitChange });
}

export async function processImportedFile({
  registeredFileName,
  originalFileName,
  referenceMonth,
  cpfColumn,
  valuePerNote,
}) {
  const normalizedMonth = startOfMonth(referenceMonth);

  if (!registeredFileName || !originalFileName) {
    throw new Error("Arquivo de importação inválido.");
  }

  if (!normalizedMonth) {
    throw new Error("Informe o mês de referência da planilha.");
  }

  if (!cpfColumn) {
    throw new Error("Selecione a coluna de CPF antes de importar.");
  }

  let importId = "";

  try {
    importId = await createImportRecord({
      referenceMonth: normalizedMonth,
      fileName: originalFileName,
      valuePerNote,
      status: "processing",
    }, { emitChange: false });
    const normalizedCpfExpression = normalizeCpfSqlExpression(
      escapeIdentifier(cpfColumn),
    );

    const fileColumns = await query(`
      DESCRIBE SELECT *
      FROM ${buildCsvSource(registeredFileName)}
    `);
    const fileColumnNames = fileColumns.map((column) => column.column_name);
    const orderStatusColumn = detectOrderStatusColumn(fileColumnNames);
    const orderStatusFilter = orderStatusColumn
      ? `AND NOT (${INVALID_ORDER_STATUS_PATTERNS.map(
          (pattern) =>
            `lower(coalesce(${escapeIdentifier(orderStatusColumn)}, '')) LIKE '%${escapeSqlString(pattern)}%'`,
        ).join(" OR ")})`
      : "";

    const cpfCounts = await query(`
      SELECT
        ${normalizedCpfExpression} AS cpf,
        count(*) AS notes_count
      FROM ${buildCsvSource(registeredFileName)}
      WHERE length(${normalizedCpfExpression}) = 11
        ${orderStatusFilter}
      GROUP BY 1
      ORDER BY notes_count DESC, cpf ASC
    `);

    await saveImportCpfSummary({
      importId,
      referenceMonth: normalizedMonth,
      cpfCounts: cpfCounts.map((row) => ({
        cpf: row.cpf,
        notesCount: Number(row.notes_count ?? 0),
      })),
    }, { emitChange: false });

    notifyDatabaseChanged({ source: "import" });

    await createActionHistoryEntry({
      actionType: "import",
      entityType: "import",
      entityId: importId,
      label: originalFileName,
      description: `Planilha ${originalFileName} importada.`,
      payload: {
        cpfColumn,
        fileName: originalFileName,
        referenceMonth: normalizedMonth,
        rowCount: cpfCounts.reduce(
          (total, row) => total + Number(row.notes_count ?? 0),
          0,
        ),
      },
    });

    return importId;
  } catch (error) {
    const errorMessage = getErrorMessage(error, "Falha ao processar a importação.");

    if (importId) {
      await execute(`
        UPDATE imports
        SET
          status = 'error',
          notes = '${escapeSqlString(errorMessage)}',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = '${escapeSqlString(importId)}'
      `).catch(() => null);
    }
    throw error;
  } finally {
    await releaseRegisteredFile(registeredFileName);
  }
}

export async function deleteImport(importId) {
  const importRows = await query(`
    SELECT
      id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      file_name,
      value_per_note,
      total_rows,
      matched_rows,
      matched_donors,
      status,
      notes,
      CAST(imported_at AS VARCHAR) AS imported_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM imports
    WHERE id = '${escapeSqlString(importId)}'
    LIMIT 1
  `);

  if (importRows.length === 0) {
    return;
  }

  const importCpfSummaryRows = await query(`
    SELECT
      id,
      import_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      cpf,
      notes_count,
      matched_donor_id,
      matched_source_id,
      is_registered_donor,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM import_cpf_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);

  const monthlySummaryRows = await query(`
    SELECT
      id,
      import_id,
      donor_id,
      CAST(reference_month AS VARCHAR) AS reference_month,
      cpf,
      donor_name,
      demand,
      notes_count,
      value_per_note,
      abatement_amount,
      abatement_status,
      CAST(abatement_marked_at AS VARCHAR) AS abatement_marked_at,
      CAST(created_at AS VARCHAR) AS created_at,
      CAST(updated_at AS VARCHAR) AS updated_at
    FROM monthly_donor_summary
    WHERE import_id = '${escapeSqlString(importId)}'
  `);
  const trashItemId = nanoid();

  await runInTransaction(async () => {
    await execute(`
      INSERT INTO trash_items (
        id,
        entity_type,
        entity_id,
        label,
        payload_json,
        deleted_at
      )
      VALUES (
        '${escapeSqlString(trashItemId)}',
        'import',
        '${escapeSqlString(importId)}',
        '${escapeSqlString(importRows[0].file_name)}',
        '${escapeSqlString(JSON.stringify({
          imports: importRows,
          importCpfSummary: importCpfSummaryRows,
          monthlyDonorSummary: monthlySummaryRows,
        }))}',
        CURRENT_TIMESTAMP
      )
    `);

    await execute(`
      DELETE FROM monthly_donor_summary
      WHERE import_id = '${escapeSqlString(importId)}'
    `);

    await execute(`
      DELETE FROM import_cpf_summary
      WHERE import_id = '${escapeSqlString(importId)}'
    `);

    await execute(`
      DELETE FROM imports
      WHERE id = '${escapeSqlString(importId)}'
    `);
  });

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "import",
    entityId: importId,
    label: importRows[0].file_name,
    description: `Importação ${importRows[0].file_name} enviada para a lixeira.`,
    payload: {
      referenceMonth: importRows[0].reference_month,
      trashItemId,
    },
  });

  return trashItemId;
}

export async function reconcileImport(importId, { emitChange = true } = {}) {
  const importRows = await query(`
    SELECT
      id,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      value_per_note
    FROM imports
    WHERE id = '${escapeSqlString(importId)}'
    LIMIT 1
  `);

  if (importRows.length === 0) {
    return;
  }

  const importValuePerNote = Number(importRows[0].value_per_note ?? 0);

  await runInTransaction(
    async () => {
      const existingSummaries = await query(`
        SELECT
          donor_id,
          abatement_status,
          strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at
        FROM monthly_donor_summary
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      const summaryStatusByDonorId = new Map(
        existingSummaries.map((row) => [
          row.donor_id,
          {
            abatementStatus: row.abatement_status ?? "pending",
            abatementMarkedAt: row.abatement_marked_at ?? "",
          },
        ]),
      );

      await execute(`
        UPDATE import_cpf_summary
        SET
          matched_source_id = (
            SELECT donor_cpf_links.id
            FROM donor_cpf_links
            WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
              AND donor_cpf_links.is_active = TRUE
            LIMIT 1
          ),
          matched_donor_id = (
            SELECT donor_cpf_links.donor_id
            FROM donor_cpf_links
            WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
              AND donor_cpf_links.is_active = TRUE
            LIMIT 1
          ),
          is_registered_donor = EXISTS (
            SELECT 1
            FROM donor_cpf_links
            WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
              AND donor_cpf_links.is_active = TRUE
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      await execute(`
        DELETE FROM monthly_donor_summary
        WHERE import_id = '${escapeSqlString(importId)}'
      `);

      const matchedRows = await query(`
        SELECT
          import_cpf_summary.import_id,
          strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
          donors.id AS donor_id,
          donors.cpf AS donor_cpf,
          donors.name AS donor_name,
          donors.demand AS demand,
          sum(import_cpf_summary.notes_count) AS notes_count
        FROM import_cpf_summary
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.id = import_cpf_summary.matched_source_id
        INNER JOIN donors
          ON donors.id = donor_cpf_links.donor_id
        WHERE import_cpf_summary.import_id = '${escapeSqlString(importId)}'
          AND donors.is_active = TRUE
          AND donor_cpf_links.is_active = TRUE
        GROUP BY
          import_cpf_summary.import_id,
          import_cpf_summary.reference_month,
          donors.id,
          donors.cpf,
          donors.name,
          donors.demand
      `);

      for (const row of matchedRows) {
        const notesCount = Number(row.notes_count ?? 0);
        const valuePerNote = importValuePerNote;
        const abatementAmount = notesCount * valuePerNote;
        const existingSummary = summaryStatusByDonorId.get(row.donor_id);
        const abatementStatus = existingSummary?.abatementStatus ?? "pending";
        const abatementMarkedAt = existingSummary?.abatementMarkedAt ?? "";

        await execute(`
          INSERT INTO monthly_donor_summary (
            id,
            import_id,
            donor_id,
            reference_month,
            cpf,
            donor_name,
            demand,
            notes_count,
            value_per_note,
            abatement_amount,
            abatement_status,
            abatement_marked_at,
            updated_at
          )
          VALUES (
            '${escapeSqlString(nanoid())}',
            '${escapeSqlString(row.import_id)}',
            '${escapeSqlString(row.donor_id)}',
            '${escapeSqlString(row.reference_month)}',
            '${escapeSqlString(row.donor_cpf)}',
            '${escapeSqlString(row.donor_name)}',
            '${escapeSqlString(row.demand ?? "")}',
            ${notesCount},
            ${valuePerNote},
            ${abatementAmount},
            '${escapeSqlString(abatementStatus)}',
            ${abatementMarkedAt ? `'${escapeSqlString(abatementMarkedAt)}'` : "NULL"},
            CURRENT_TIMESTAMP
          )
        `);
      }

      await execute(`
        UPDATE imports
        SET
          matched_rows = coalesce((
            SELECT sum(notes_count)
            FROM import_cpf_summary
            WHERE import_id = '${escapeSqlString(importId)}'
              AND is_registered_donor = TRUE
          ), 0),
          matched_donors = coalesce((
            SELECT count(DISTINCT matched_donor_id)
            FROM import_cpf_summary
            WHERE import_id = '${escapeSqlString(importId)}'
              AND is_registered_donor = TRUE
              AND matched_donor_id IS NOT NULL
          ), 0),
          status = 'processed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = '${escapeSqlString(importId)}'
      `);
    },
    { emitChange, changeSource: "reconcile-import" },
  );
}

export async function reconcileAllImports({ emitChange = true } = {}) {
  const imports = await query(`
    SELECT id
    FROM imports
    ORDER BY reference_month ASC, imported_at ASC
  `);

  for (const importRow of imports) {
    await reconcileImport(importRow.id, { emitChange: false });
  }

  if (emitChange && imports.length > 0) {
    notifyDatabaseChanged({ source: "reconcile-all-imports" });
  }
}

export async function reconcileImportsForCpfs(cpfs = []) {
  const normalizedCpfs = Array.from(
    new Set(
      cpfs
        .map((cpf) => normalizeCpf(cpf))
        .filter((cpf) => cpf.length === 11),
    ),
  );

  if (normalizedCpfs.length === 0) {
    return;
  }

  const cpfList = normalizedCpfs
    .map((cpf) => `'${escapeSqlString(cpf)}'`)
    .join(", ");
  const imports = await query(`
    SELECT DISTINCT import_id AS id
    FROM import_cpf_summary
    WHERE cpf IN (${cpfList})
    ORDER BY import_id ASC
  `);

  for (const importRow of imports) {
    await reconcileImport(importRow.id, { emitChange: false });
  }

  if (imports.length > 0) {
    notifyDatabaseChanged({ source: "cpf-reconcile" });
  }
}
