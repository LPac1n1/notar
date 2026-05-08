import { nanoid } from "nanoid";
import {
  escapeSqlString,
  execute,
  queryPrepared,
  runInTransaction,
  startOfMonth,
} from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import { formatMonthYear } from "../utils/date";

/**
 * Abatement adjustments are explicit "catch-up" entries: a single row that
 * adds extra notes/value to a donor's total in a specific reference month.
 *
 * Typical use case: a donor was registered with Nota Fiscal Paulista months
 * before being added to Notar. When they finally appear in the system, the
 * user creates one adjustment for the current month covering the missed
 * months — so the donor receives the full accumulated amount in a single
 * report entry, without distorting prior or future months.
 *
 * Identity: at most one adjustment per (donor_id, reference_month).
 */

function ensureMonthIso(value, fieldLabel) {
  const normalized = startOfMonth(value);
  if (!normalized) {
    throw new Error(`Informe ${fieldLabel} válido no formato MM/AAAA.`);
  }
  return normalized;
}

function mapAdjustmentRow(row) {
  return {
    id: row.id,
    donorId: row.donor_id ?? "",
    referenceMonth: row.reference_month
      ? String(row.reference_month).slice(0, 10)
      : "",
    rangeStartMonth: row.range_start_month
      ? String(row.range_start_month).slice(0, 10)
      : "",
    rangeEndMonth: row.range_end_month
      ? String(row.range_end_month).slice(0, 10)
      : "",
    notesCount: Number(row.notes_count ?? 0),
    abatementAmount: Number(row.abatement_amount ?? 0),
    description: row.description ?? "",
    abatementStatus: row.abatement_status === "applied" ? "applied" : "pending",
    abatementMarkedAt: row.abatement_marked_at ?? "",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

/**
 * Computes the accumulated abatement for a donor across a range of months,
 * looking at every CPF currently linked to the donor and the imports that
 * landed on each month inside the range.
 *
 * Returns the totals plus a per-month breakdown that the modal can preview
 * before saving the adjustment.
 */
export async function previewCatchUpRange({
  donorId,
  rangeStartMonth,
  rangeEndMonth,
}) {
  if (!donorId) {
    throw new Error("Doador não informado.");
  }

  const startIso = ensureMonthIso(rangeStartMonth, "o mês inicial");
  const endIso = ensureMonthIso(rangeEndMonth, "o mês final");

  if (endIso < startIso) {
    throw new Error("O mês final precisa ser igual ou posterior ao inicial.");
  }

  // Join the donor to the import history through CPF directly, NOT through
  // `matched_source_id`. The matched_source_id field only carries data for
  // imports already reconciled against the current donor records. If a donor
  // was just added and the historical imports haven't been reconciled yet
  // (race) or reconciliation ran but did not propagate retroactively, the
  // matched_source_id-based join would silently miss the old months — and the
  // catch-up would be saved with only the current month's notes.
  //
  // Joining by CPF works regardless of the matched_source_id state.
  const monthlyRows = await queryPrepared(
    `
      SELECT
        strftime(import_cpf_summary.reference_month, '%Y-%m-01') AS reference_month,
        sum(import_cpf_summary.notes_count) AS notes_count,
        max(imports.value_per_note) AS value_per_note
      FROM import_cpf_summary
      INNER JOIN imports
        ON imports.id = import_cpf_summary.import_id
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.cpf = import_cpf_summary.cpf
       AND donor_cpf_links.donor_id = ?
       AND donor_cpf_links.is_active = TRUE
      WHERE imports.status = 'processed'
        AND import_cpf_summary.reference_month >= CAST(? AS DATE)
        AND import_cpf_summary.reference_month <= CAST(? AS DATE)
      GROUP BY import_cpf_summary.reference_month
      ORDER BY import_cpf_summary.reference_month ASC
    `,
    [donorId, startIso, endIso],
  );

  const breakdown = monthlyRows.map((row) => {
    const month = String(row.reference_month).slice(0, 10);
    const notesCount = Number(row.notes_count ?? 0);
    const valuePerNote = Number(row.value_per_note ?? 0);
    return {
      referenceMonth: month,
      monthLabel: formatMonthYear(month),
      notesCount,
      valuePerNote,
      abatementAmount: notesCount * valuePerNote,
    };
  });

  const totalNotes = breakdown.reduce((sum, item) => sum + item.notesCount, 0);
  const totalAmount = breakdown.reduce(
    (sum, item) => sum + item.abatementAmount,
    0,
  );

  return {
    donorId,
    rangeStartMonth: startIso,
    rangeEndMonth: endIso,
    breakdown,
    totalNotes,
    totalAmount,
    monthCount: breakdown.length,
  };
}

export async function listAdjustmentsForMonth(referenceMonth) {
  const normalized = startOfMonth(referenceMonth);
  if (!normalized) {
    return [];
  }

  const rows = await queryPrepared(
    `
      SELECT
        id,
        donor_id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        strftime(range_start_month, '%Y-%m-01') AS range_start_month,
        strftime(range_end_month, '%Y-%m-01') AS range_end_month,
        notes_count,
        abatement_amount,
        description,
        abatement_status,
        strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
        strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
        strftime(updated_at, '%Y-%m-%d %H:%M:%S') AS updated_at
      FROM abatement_adjustments
      WHERE reference_month = CAST(? AS DATE)
    `,
    [normalized],
  );

  return rows.map(mapAdjustmentRow);
}

export async function listAllAdjustments() {
  const rows = await queryPrepared(
    `
      SELECT
        id,
        donor_id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        strftime(range_start_month, '%Y-%m-01') AS range_start_month,
        strftime(range_end_month, '%Y-%m-01') AS range_end_month,
        notes_count,
        abatement_amount,
        description,
        abatement_status,
        strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
        strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
        strftime(updated_at, '%Y-%m-%d %H:%M:%S') AS updated_at
      FROM abatement_adjustments
      ORDER BY reference_month DESC, donor_id ASC
    `,
    [],
  );

  return rows.map(mapAdjustmentRow);
}

export async function listAdjustmentsForDonor(donorId) {
  if (!donorId) {
    return [];
  }

  const rows = await queryPrepared(
    `
      SELECT
        id,
        donor_id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        strftime(range_start_month, '%Y-%m-01') AS range_start_month,
        strftime(range_end_month, '%Y-%m-01') AS range_end_month,
        notes_count,
        abatement_amount,
        description,
        abatement_status,
        strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
        strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
        strftime(updated_at, '%Y-%m-%d %H:%M:%S') AS updated_at
      FROM abatement_adjustments
      WHERE donor_id = ?
      ORDER BY reference_month DESC
    `,
    [donorId],
  );

  return rows.map(mapAdjustmentRow);
}

export async function getAdjustmentByDonorAndMonth(donorId, referenceMonth) {
  const normalized = startOfMonth(referenceMonth);
  if (!donorId || !normalized) {
    return null;
  }

  const rows = await queryPrepared(
    `
      SELECT
        id,
        donor_id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        strftime(range_start_month, '%Y-%m-01') AS range_start_month,
        strftime(range_end_month, '%Y-%m-01') AS range_end_month,
        notes_count,
        abatement_amount,
        description,
        abatement_status,
        strftime(abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
        strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
        strftime(updated_at, '%Y-%m-%d %H:%M:%S') AS updated_at
      FROM abatement_adjustments
      WHERE donor_id = ?
        AND reference_month = ?
      LIMIT 1
    `,
    [donorId, normalized],
  );

  return rows.length > 0 ? mapAdjustmentRow(rows[0]) : null;
}

export async function createAbatementAdjustment({
  donorId,
  referenceMonth,
  rangeStartMonth,
  rangeEndMonth,
  notesCount,
  abatementAmount,
  description = "",
  donorName = "",
}) {
  if (!donorId) {
    throw new Error("Doador não informado.");
  }

  const normalizedReferenceMonth = ensureMonthIso(
    referenceMonth,
    "o mês de referência",
  );
  const normalizedStart = ensureMonthIso(rangeStartMonth, "o mês inicial");
  const normalizedEnd = ensureMonthIso(rangeEndMonth, "o mês final");

  if (normalizedEnd < normalizedStart) {
    throw new Error("O mês final precisa ser igual ou posterior ao inicial.");
  }

  if (normalizedEnd > normalizedReferenceMonth) {
    throw new Error(
      "O período acumulado não pode ultrapassar o mês de lançamento.",
    );
  }

  const safeNotesCount = Math.max(0, Math.floor(Number(notesCount ?? 0)));
  const safeAmount = Math.max(0, Number(abatementAmount ?? 0));

  if (safeNotesCount === 0 && safeAmount === 0) {
    throw new Error(
      "O acumulado precisa ter ao menos uma nota ou um valor positivo.",
    );
  }

  const existing = await getAdjustmentByDonorAndMonth(
    donorId,
    normalizedReferenceMonth,
  );

  if (existing) {
    throw new Error(
      "Já existe um lançamento de acumulado para este doador no mês selecionado.",
    );
  }

  const id = nanoid();

  await runInTransaction(async () => {
    await execute(`
      INSERT INTO abatement_adjustments (
        id,
        donor_id,
        reference_month,
        range_start_month,
        range_end_month,
        notes_count,
        abatement_amount,
        description,
        abatement_status,
        created_at,
        updated_at
      )
      VALUES (
        '${escapeSqlString(id)}',
        '${escapeSqlString(donorId)}',
        '${escapeSqlString(normalizedReferenceMonth)}',
        '${escapeSqlString(normalizedStart)}',
        '${escapeSqlString(normalizedEnd)}',
        ${safeNotesCount},
        ${safeAmount},
        '${escapeSqlString(description)}',
        'pending',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);
  });

  await createActionHistoryEntry({
    actionType: "create",
    entityType: "abatement_adjustment",
    entityId: id,
    label: donorName || donorId,
    description: `Lançamento de acumulado em ${formatMonthYear(normalizedReferenceMonth)}: ${description || "sem descrição"}.`,
    payload: {
      donorId,
      referenceMonth: normalizedReferenceMonth,
      rangeStartMonth: normalizedStart,
      rangeEndMonth: normalizedEnd,
      notesCount: safeNotesCount,
      abatementAmount: safeAmount,
    },
  });

  return id;
}

export async function deleteAbatementAdjustment(id, { donorName = "" } = {}) {
  if (!id) return;

  const existing = await queryPrepared(
    `
      SELECT
        donor_id,
        strftime(reference_month, '%Y-%m-01') AS reference_month,
        notes_count,
        abatement_amount,
        description
      FROM abatement_adjustments
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  if (existing.length === 0) {
    return;
  }

  const adjustment = existing[0];

  await execute(`
    DELETE FROM abatement_adjustments
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "delete",
    entityType: "abatement_adjustment",
    entityId: id,
    label: donorName || adjustment.donor_id,
    description: `Lançamento de acumulado removido (${formatMonthYear(adjustment.reference_month)}).`,
    payload: {
      donorId: adjustment.donor_id,
      referenceMonth: adjustment.reference_month,
      notesCount: Number(adjustment.notes_count ?? 0),
      abatementAmount: Number(adjustment.abatement_amount ?? 0),
      description: adjustment.description ?? "",
    },
  });
}

export async function updateAbatementAdjustmentStatus({
  id,
  status,
  donorName = "",
}) {
  if (!id) return;

  const normalizedStatus = status === "applied" ? "applied" : "pending";

  await execute(`
    UPDATE abatement_adjustments
    SET
      abatement_status = '${escapeSqlString(normalizedStatus)}',
      abatement_marked_at = ${
        normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
      },
      updated_at = CURRENT_TIMESTAMP
    WHERE id = '${escapeSqlString(id)}'
  `);

  await createActionHistoryEntry({
    actionType: "update",
    entityType: "abatement_adjustment",
    entityId: id,
    label: donorName,
    description: `Lançamento de acumulado marcado como ${normalizedStatus === "applied" ? "realizado" : "pendente"}.`,
    payload: { status: normalizedStatus },
  });
}
