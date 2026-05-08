import {
  escapeSqlString,
  execute,
  normalizeCpf,
  queryPrepared,
  runInTransaction,
  startOfMonth,
} from "./db";
import { createActionHistoryEntry } from "./actionHistoryService";
import {
  listAdjustmentsForMonth,
  listAllAdjustments,
  updateAbatementAdjustmentStatus,
} from "./abatementAdjustmentService";

function parseSourceCpfs(value) {
  return String(value ?? "")
    .split(",")
    .map((cpfValue) => cpfValue.trim())
    .filter(Boolean);
}

function parseSources(value) {
  return String(value ?? "")
    .split(";;")
    .map((sourceValue) => {
      const [name = "", cpfValue = "", type = "", notesCount = "0"] =
        sourceValue.split("|");

      return {
        name,
        cpf: cpfValue,
        type: type === "holder" ? "holder" : "auxiliary",
        typeLabel: type === "holder" ? "Titular" : "Auxiliar",
        notesCount: Number(notesCount || 0),
      };
    })
    .filter((source) => source.name || source.cpf);
}

function mapSummaryRow(row) {
  const notesCount = Number(row.notes_count ?? 0);

  return {
    id: row.id,
    importId: row.import_id ?? "",
    donorId: row.donor_id,
    referenceMonth: row.reference_month,
    cpf: row.cpf,
    donorName: row.donor_name,
    demand: row.demand ?? "",
    notesCount,
    invalidNotesCount: Number(row.invalid_notes_count ?? 0),
    valuePerNote: Number(row.value_per_note ?? 0),
    abatementAmount: Number(row.abatement_amount ?? 0),
    abatementStatus: row.abatement_status ?? "pending",
    abatementMarkedAt: row.abatement_marked_at ?? "",
    donorType: row.donor_type === "auxiliary" ? "auxiliary" : "holder",
    donorTypeLabel: row.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
    holderDonorId: row.active_holder_donor_id ?? row.holder_donor_id ?? "",
    holderPersonId: row.holder_person_id ?? "",
    holderName: row.holder_name ?? "",
    holderCpf: row.holder_cpf ?? "",
    holderIsActiveDonor: Boolean(row.active_holder_donor_id),
    donationStartDate: row.donation_start_date ?? "",
    sourceCpfs: parseSourceCpfs(row.source_cpfs),
    sources: parseSources(row.source_details),
    sourceCpfCount: Number(row.source_cpf_count ?? 0),
    sourceStartConflictCount: Number(row.source_start_conflict_count ?? 0),
    hasDonationsInMonth: notesCount > 0,
    canUpdateAbatement: notesCount > 0,
  };
}

function mapDonorWithoutDonation(row, { referenceMonth, valuePerNote = 0 }) {
  return {
    id: `${row.id}-${referenceMonth}-without-donation`,
    importId: "",
    donorId: row.id,
    referenceMonth,
    cpf: row.cpf,
    donorName: row.name,
    demand: row.demand ?? "",
    notesCount: 0,
    invalidNotesCount: Number(row.invalid_notes_count ?? 0),
    valuePerNote: Number(valuePerNote ?? 0),
    abatementAmount: 0,
    abatementStatus: "none",
    abatementMarkedAt: "",
    donorType: row.donor_type === "auxiliary" ? "auxiliary" : "holder",
    donorTypeLabel: row.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
    holderDonorId: row.active_holder_donor_id ?? row.holder_donor_id ?? "",
    holderPersonId: row.holder_person_id ?? "",
    holderName: row.holder_name ?? "",
    holderCpf: row.holder_cpf ?? "",
    holderIsActiveDonor: Boolean(row.active_holder_donor_id),
    donationStartDate: row.donation_start_date ?? "",
    sourceCpfs: parseSourceCpfs(row.source_cpfs),
    sources: parseSources(row.source_details),
    sourceCpfCount: Number(row.source_cpf_count ?? 0),
    sourceStartConflictCount: 0,
    hasDonationsInMonth: false,
    canUpdateAbatement: false,
  };
}

/**
 * Folds a single abatement adjustment into its parent monthly summary row.
 *
 * Two regimes:
 *
 *  • Additive (range_end < reference_month): the adjustment covers ONLY past
 *    months, so it is summed on top of the regular row. The UI shows
 *    "X no mês + Y acumuladas".
 *
 *  • Subsumption (range_end >= reference_month): the adjustment range already
 *    covers the reference month, so the regular row's notes/value are part of
 *    the adjustment total. We REPLACE rather than sum to avoid double-counting.
 *    The UI shows just the total because there is nothing extra "for the month
 *    on top of the catch-up".
 *
 * In both regimes we propagate the adjustment's status if the underlying row
 * had no donations (status "none"), so filters such as "Pendentes" still see
 * the row.
 */
function mergeAdjustmentIntoRow(row, adjustment) {
  if (!adjustment) {
    return row;
  }

  const adjustmentNotes = Number(adjustment.notesCount ?? 0);
  const adjustmentAmount = Number(adjustment.abatementAmount ?? 0);
  const subsumes = Boolean(
    adjustment.rangeEndMonth &&
      row.referenceMonth &&
      adjustment.rangeEndMonth >= row.referenceMonth,
  );

  const monthNotesCount = subsumes ? 0 : row.notesCount;
  const monthAbatementAmount = subsumes ? 0 : row.abatementAmount;
  const combinedNotes = monthNotesCount + adjustmentNotes;
  const combinedAmount = monthAbatementAmount + adjustmentAmount;

  // If the underlying row had no real donation status (synthesized via
  // mapDonorWithoutDonation), inherit the adjustment's pending/applied state
  // so status filters and the toggle UI work as expected.
  const effectiveStatus =
    row.abatementStatus && row.abatementStatus !== "none"
      ? row.abatementStatus
      : adjustment.abatementStatus;

  return {
    ...row,
    notesCount: combinedNotes,
    abatementAmount: combinedAmount,
    monthNotesCount,
    monthAbatementAmount,
    hasDonationsInMonth: combinedNotes > 0,
    canUpdateAbatement: combinedNotes > 0,
    abatementStatus: effectiveStatus ?? row.abatementStatus,
    adjustment,
    hasAdjustment: true,
    adjustmentSubsumesMonth: subsumes,
  };
}

function mergeAdjustmentsByMonth(rows, adjustments) {
  if (!adjustments || adjustments.length === 0) {
    return rows;
  }

  // Key by (donorId, referenceMonth) so the same donor can have separate
  // adjustments across multiple months in a historical view.
  const adjustmentMap = new Map(
    adjustments.map((adjustment) => [
      `${adjustment.donorId}|${adjustment.referenceMonth}`,
      adjustment,
    ]),
  );

  return rows.map((row) => {
    const key = `${row.donorId}|${row.referenceMonth}`;
    return mergeAdjustmentIntoRow(row, adjustmentMap.get(key));
  });
}

function applySummaryFilters(
  rows,
  {
    abatementStatus = "all",
    donationActivity = "all",
  } = {},
) {
  let filteredRows = rows;

  if (donationActivity === "donated") {
    filteredRows = filteredRows.filter((row) => row.hasDonationsInMonth);
  }

  if (donationActivity === "not-donated") {
    filteredRows = filteredRows.filter((row) => !row.hasDonationsInMonth);
  }

  if (abatementStatus !== "all") {
    filteredRows = filteredRows.filter(
      (row) =>
        row.hasDonationsInMonth && row.abatementStatus === abatementStatus,
    );
  }

  return filteredRows;
}

function sortSummariesByAbatement(rows, sortDirection = "") {
  if (!sortDirection) {
    return rows;
  }

  const direction = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const amountDifference =
      (Number(left.abatementAmount ?? 0) - Number(right.abatementAmount ?? 0)) *
      direction;

    if (amountDifference !== 0) {
      return amountDifference;
    }

    return String(left.donorName ?? "").localeCompare(
      String(right.donorName ?? ""),
      "pt-BR",
    );
  });
}

function buildDonorConditions({
  donorId = "",
  donorType = "all",
  cpf = "",
  demand = "",
  donationStartDate = "all",
  donorActiveStatus = "active",
} = {}) {
  const conditions = [];
  const params = [];

  if (donorActiveStatus === "active") {
    conditions.push("donors.is_active = TRUE");
  } else if (donorActiveStatus === "inactive") {
    conditions.push("donors.is_active = FALSE");
  }

  if (donorId.trim()) {
    conditions.push("donors.id = ?");
    params.push(donorId.trim());
  }

  if (donorType === "holder" || donorType === "auxiliary") {
    conditions.push("donors.donor_type = ?");
    params.push(donorType);
  }

  if (cpf.trim()) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
          AND donor_cpf_links.cpf = ?
      )
    `);
    params.push(normalizeCpf(cpf));
  }

  if (demand.trim()) {
    conditions.push("lower(coalesce(donors.demand, '')) = lower(?)");
    params.push(demand.trim());
  }

  if (donationStartDate === "with-date") {
    conditions.push("donors.donation_start_date IS NOT NULL");
  }

  if (donationStartDate === "without-date") {
    conditions.push("donors.donation_start_date IS NULL");
  }

  return { conditions, params };
}

async function listMonthlySummariesByMonth({
  referenceMonth,
  donorId = "",
  donorType = "all",
  cpf = "",
  demand = "",
  abatementStatus = "all",
  donationActivity = "all",
  abatementSort = "",
  donationStartDate = "all",
  donorActiveStatus = "active",
} = {}) {
  const normalizedReferenceMonth = startOfMonth(referenceMonth);
  const { conditions: activeDonorConditions, params: activeDonorParams } =
    buildDonorConditions({
      donorId,
      donorType,
      cpf,
      demand,
      donationStartDate,
      donorActiveStatus: "active",
    });
  const activeDonorWhereClause =
    activeDonorConditions.length > 0 ? `WHERE ${activeDonorConditions.join(" AND ")}` : "";

  // Query #2 (monthly summaries by reference month) needs its own dynamic
  // WHERE — it filters monthly_donor_summary directly rather than donors.
  const monthlyRowsConditions = ["monthly_donor_summary.reference_month = ?"];
  const monthlyRowsParams = [normalizedReferenceMonth];

  if (donorActiveStatus === "active") {
    monthlyRowsConditions.push("donors.is_active = TRUE");
  } else if (donorActiveStatus === "inactive") {
    monthlyRowsConditions.push("donors.is_active = FALSE");
  }

  if (donorId.trim()) {
    monthlyRowsConditions.push("donors.id = ?");
    monthlyRowsParams.push(donorId.trim());
  }

  if (cpf.trim()) {
    monthlyRowsConditions.push(`
      EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
          AND donor_cpf_links.cpf = ?
      )
    `);
    monthlyRowsParams.push(normalizeCpf(cpf));
  }

  if (demand.trim()) {
    monthlyRowsConditions.push("lower(coalesce(donors.demand, '')) = lower(?)");
    monthlyRowsParams.push(demand.trim());
  }

  const [donorRows, monthlyRows, importContextRows] = await Promise.all([
    queryPrepared(`
      SELECT
        donors.id,
        donors.name,
        donors.cpf,
        donors.demand,
        donors.donor_type,
        donors.holder_donor_id,
        donors.holder_person_id,
        holder_people.name AS holder_name,
        holder_people.cpf AS holder_cpf,
        holder_active_donors.id AS active_holder_donor_id,
        strftime(donors.donation_start_date, '%Y-%m-%d') AS donation_start_date,
        coalesce((
          SELECT string_agg(DISTINCT donor_cpf_links.cpf, ',')
          FROM donor_cpf_links
          WHERE donor_cpf_links.donor_id = donors.id
            AND donor_cpf_links.is_active = TRUE
        ), '') AS source_cpfs,
        coalesce((
          SELECT string_agg(
            source_rows.source_name || '|' ||
            source_rows.source_cpf || '|' ||
            source_rows.source_type || '|0',
            ';;'
          )
          FROM (
            SELECT
              donor_cpf_links.name AS source_name,
              donor_cpf_links.cpf AS source_cpf,
              donor_cpf_links.link_type AS source_type
            FROM donor_cpf_links
            WHERE donor_cpf_links.donor_id = donors.id
              AND donor_cpf_links.is_active = TRUE
            ORDER BY
              CASE WHEN donor_cpf_links.link_type = 'holder' THEN 0 ELSE 1 END,
              donor_cpf_links.name ASC
          ) AS source_rows
        ), '') AS source_details,
        coalesce((
          SELECT count(*)
          FROM donor_cpf_links
          WHERE donor_cpf_links.donor_id = donors.id
            AND donor_cpf_links.is_active = TRUE
        ), 0) AS source_cpf_count,
        coalesce((
          SELECT sum(coalesce(import_cpf_summary.invalid_notes_count, 0))
          FROM import_cpf_summary
          INNER JOIN donor_cpf_links
            ON donor_cpf_links.id = import_cpf_summary.matched_source_id
          WHERE donor_cpf_links.donor_id = donors.id
            AND donor_cpf_links.is_active = TRUE
            AND import_cpf_summary.reference_month = ?
        ), 0) AS invalid_notes_count
      FROM donors
      LEFT JOIN people AS holder_people
        ON holder_people.id = donors.holder_person_id
      LEFT JOIN donors AS holder_active_donors
        ON holder_active_donors.person_id = donors.holder_person_id
        AND holder_active_donors.donor_type = 'holder'
        AND holder_active_donors.is_active = TRUE
      ${activeDonorWhereClause}
      ORDER BY donors.name ASC
    `, [normalizedReferenceMonth, ...activeDonorParams]),
    queryPrepared(`
      SELECT
        monthly_donor_summary.id,
        monthly_donor_summary.import_id,
        monthly_donor_summary.donor_id,
        strftime(monthly_donor_summary.reference_month, '%Y-%m-%d') AS reference_month,
        monthly_donor_summary.cpf,
        monthly_donor_summary.donor_name,
        monthly_donor_summary.demand,
        monthly_donor_summary.notes_count,
        coalesce(monthly_donor_summary.invalid_notes_count, 0) AS invalid_notes_count,
        monthly_donor_summary.value_per_note,
        monthly_donor_summary.abatement_amount,
        monthly_donor_summary.abatement_status,
        strftime(monthly_donor_summary.abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
        donors.donor_type,
        donors.holder_donor_id,
        donors.holder_person_id,
        holder_people.name AS holder_name,
        holder_people.cpf AS holder_cpf,
        holder_active_donors.id AS active_holder_donor_id,
        strftime(donors.donation_start_date, '%Y-%m-%d') AS donation_start_date,
        coalesce((
          SELECT string_agg(DISTINCT import_cpf_summary.cpf, ',')
          FROM import_cpf_summary
          WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
            AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
        ), '') AS source_cpfs,
        coalesce((
          SELECT string_agg(
            source_rows.source_name || '|' ||
            source_rows.source_cpf || '|' ||
            source_rows.source_type || '|' ||
            CAST(source_rows.source_notes AS VARCHAR),
            ';;'
          )
          FROM (
            SELECT
              donor_cpf_links.name AS source_name,
              donor_cpf_links.cpf AS source_cpf,
              donor_cpf_links.link_type AS source_type,
              sum(import_cpf_summary.notes_count) AS source_notes
            FROM import_cpf_summary
            INNER JOIN donor_cpf_links
              ON donor_cpf_links.id = import_cpf_summary.matched_source_id
            WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
              AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
            GROUP BY
              donor_cpf_links.name,
              donor_cpf_links.cpf,
              donor_cpf_links.link_type
            ORDER BY
              CASE WHEN donor_cpf_links.link_type = 'holder' THEN 0 ELSE 1 END,
              donor_cpf_links.name ASC
          ) AS source_rows
        ), '') AS source_details,
        coalesce((
          SELECT count(DISTINCT import_cpf_summary.cpf)
          FROM import_cpf_summary
          WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
            AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
        ), 0) AS source_cpf_count,
        coalesce((
          SELECT count(*)
          FROM import_cpf_summary
          INNER JOIN donor_cpf_links
            ON donor_cpf_links.id = import_cpf_summary.matched_source_id
          WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
            AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
            AND donor_cpf_links.donation_start_date IS NOT NULL
            AND import_cpf_summary.reference_month < donor_cpf_links.donation_start_date
        ), 0) AS source_start_conflict_count
      FROM monthly_donor_summary
      INNER JOIN donors
        ON donors.id = monthly_donor_summary.donor_id
      LEFT JOIN people AS holder_people
        ON holder_people.id = donors.holder_person_id
      LEFT JOIN donors AS holder_active_donors
        ON holder_active_donors.person_id = donors.holder_person_id
        AND holder_active_donors.donor_type = 'holder'
        AND holder_active_donors.is_active = TRUE
      WHERE ${monthlyRowsConditions.join(" AND ")}
      ORDER BY monthly_donor_summary.donor_name ASC
    `, monthlyRowsParams),
    queryPrepared(`
      SELECT
        id,
        value_per_note
      FROM imports
      WHERE status = 'processed'
        AND reference_month = ?
      ORDER BY imported_at DESC
      LIMIT 1
    `, [normalizedReferenceMonth]),
  ]);

  const summaryByDonorId = new Map(
    monthlyRows.map((row) => [row.donor_id, mapSummaryRow(row)]),
  );
  const activeDonorIds = new Set(donorRows.map((r) => r.id));
  const monthValuePerNote = Number(importContextRows[0]?.value_per_note ?? 0);

  const activeMerged = donorRows.map((row) =>
    summaryByDonorId.get(row.id) ??
    mapDonorWithoutDonation(row, {
      referenceMonth: normalizedReferenceMonth,
      valuePerNote: monthValuePerNote,
    }),
  );

  const inactiveSummaries = donorActiveStatus !== "active"
    ? monthlyRows
        .filter((row) => !activeDonorIds.has(row.donor_id))
        .map(mapSummaryRow)
    : [];

  const baseRows = donorActiveStatus === "inactive"
    ? inactiveSummaries
    : [...activeMerged, ...inactiveSummaries];

  const adjustments = await listAdjustmentsForMonth(normalizedReferenceMonth);
  const mergedRows = mergeAdjustmentsByMonth(baseRows, adjustments);

  return sortSummariesByAbatement(
    applySummaryFilters(mergedRows, {
      abatementStatus,
      donationActivity,
    }),
    abatementSort,
  );
}

async function listHistoricalMonthlySummaries({
  referenceMonth = "",
  donorId = "",
  donorType = "all",
  cpf = "",
  demand = "",
  abatementStatus = "all",
  donationActivity = "all",
  abatementSort = "",
  donationStartDate = "all",
  donorActiveStatus = "active",
} = {}) {
  const conditions = [];
  const params = [];

  if (donorActiveStatus === "active") {
    conditions.push("coalesce(donors.is_active, TRUE) = TRUE");
  } else if (donorActiveStatus === "inactive") {
    conditions.push("donors.is_active = FALSE");
  }

  if (referenceMonth) {
    conditions.push("monthly_donor_summary.reference_month = ?");
    params.push(startOfMonth(referenceMonth));
  }

  if (donorId.trim()) {
    conditions.push("monthly_donor_summary.donor_id = ?");
    params.push(donorId.trim());
  }

  if (donorType === "holder" || donorType === "auxiliary") {
    conditions.push("donors.donor_type = ?");
    params.push(donorType);
  }

  if (donationStartDate === "with-date") {
    conditions.push("donors.donation_start_date IS NOT NULL");
  }

  if (donationStartDate === "without-date") {
    conditions.push("donors.donation_start_date IS NULL");
  }

  if (cpf.trim()) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          AND import_cpf_summary.cpf = ?
      )
    `);
    params.push(normalizeCpf(cpf));
  }

  if (demand.trim()) {
    conditions.push("lower(coalesce(monthly_donor_summary.demand, '')) = lower(?)");
    params.push(demand.trim());
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryPrepared(`
    SELECT
      monthly_donor_summary.id,
      monthly_donor_summary.import_id,
      monthly_donor_summary.donor_id,
      strftime(monthly_donor_summary.reference_month, '%Y-%m-%d') AS reference_month,
      monthly_donor_summary.cpf,
      monthly_donor_summary.donor_name,
      monthly_donor_summary.demand,
      monthly_donor_summary.notes_count,
      coalesce(monthly_donor_summary.invalid_notes_count, 0) AS invalid_notes_count,
      monthly_donor_summary.value_per_note,
      monthly_donor_summary.abatement_amount,
      monthly_donor_summary.abatement_status,
      strftime(monthly_donor_summary.abatement_marked_at, '%Y-%m-%d %H:%M:%S') AS abatement_marked_at,
      donors.donor_type,
      donors.holder_donor_id,
      donors.holder_person_id,
      holder_people.name AS holder_name,
      holder_people.cpf AS holder_cpf,
      holder_active_donors.id AS active_holder_donor_id,
      strftime(donors.donation_start_date, '%Y-%m-%d') AS donation_start_date,
      coalesce((
        SELECT string_agg(DISTINCT import_cpf_summary.cpf, ',')
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
      ), '') AS source_cpfs,
      coalesce((
        SELECT string_agg(
          source_rows.source_name || '|' ||
          source_rows.source_cpf || '|' ||
          source_rows.source_type || '|' ||
          CAST(source_rows.source_notes AS VARCHAR),
          ';;'
        )
        FROM (
          SELECT
            donor_cpf_links.name AS source_name,
            donor_cpf_links.cpf AS source_cpf,
            donor_cpf_links.link_type AS source_type,
            sum(import_cpf_summary.notes_count) AS source_notes
          FROM import_cpf_summary
          INNER JOIN donor_cpf_links
            ON donor_cpf_links.id = import_cpf_summary.matched_source_id
          WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
            AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          GROUP BY
            donor_cpf_links.name,
            donor_cpf_links.cpf,
            donor_cpf_links.link_type
          ORDER BY
            CASE WHEN donor_cpf_links.link_type = 'holder' THEN 0 ELSE 1 END,
            donor_cpf_links.name ASC
        ) AS source_rows
      ), '') AS source_details,
      coalesce((
        SELECT count(DISTINCT import_cpf_summary.cpf)
        FROM import_cpf_summary
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
      ), 0) AS source_cpf_count,
      coalesce((
        SELECT count(*)
        FROM import_cpf_summary
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.id = import_cpf_summary.matched_source_id
        WHERE import_cpf_summary.import_id = monthly_donor_summary.import_id
          AND import_cpf_summary.matched_donor_id = monthly_donor_summary.donor_id
          AND donor_cpf_links.donation_start_date IS NOT NULL
          AND import_cpf_summary.reference_month < donor_cpf_links.donation_start_date
      ), 0) AS source_start_conflict_count
    FROM monthly_donor_summary
    LEFT JOIN donors
      ON donors.id = monthly_donor_summary.donor_id
    LEFT JOIN people AS holder_people
      ON holder_people.id = donors.holder_person_id
    LEFT JOIN donors AS holder_active_donors
      ON holder_active_donors.person_id = donors.holder_person_id
      AND holder_active_donors.donor_type = 'holder'
      AND holder_active_donors.is_active = TRUE
    ${whereClause}
    ORDER BY monthly_donor_summary.reference_month DESC, monthly_donor_summary.donor_name ASC
  `, params);

  const adjustments = await listAllAdjustments();
  const baseRows = rows.map(mapSummaryRow);
  const mergedRows = mergeAdjustmentsByMonth(baseRows, adjustments);

  return sortSummariesByAbatement(
    applySummaryFilters(mergedRows, {
      abatementStatus,
      donationActivity,
    }),
    abatementSort,
  );
}

export async function listMonthlySummaries({
  referenceMonth = "",
  donorId = "",
  donorType = "all",
  cpf = "",
  demand = "",
  abatementStatus = "all",
  donationActivity = "all",
  abatementSort = "",
  donationStartDate = "all",
  donorActiveStatus = "active",
} = {}) {
  if (referenceMonth) {
    return listMonthlySummariesByMonth({
      referenceMonth,
      donorId,
      donorType,
      cpf,
      demand,
      abatementStatus,
      donationActivity,
      abatementSort,
      donationStartDate,
      donorActiveStatus,
    });
  }

  return listHistoricalMonthlySummaries({
    referenceMonth,
    donorId,
    donorType,
    cpf,
    demand,
    abatementStatus,
    donationActivity,
    abatementSort,
    donationStartDate,
    donorActiveStatus,
  });
}

// Synthetic ids generated by mapDonorWithoutDonation for active donors that
// have no monthly_donor_summary row in the period. They never match a real
// row in the database, so any UPDATE keyed by id is a no-op for them.
function isSyntheticSummaryId(summaryId) {
  return typeof summaryId === "string" && summaryId.endsWith("-without-donation");
}

export async function updateAbatementStatus({
  summaryId,
  status,
  adjustmentId = "",
}) {
  const normalizedStatus = status === "applied" ? "applied" : "pending";
  const summaryIdIsReal = summaryId && !isSyntheticSummaryId(summaryId);

  if (summaryIdIsReal) {
    await execute(`
      UPDATE monthly_donor_summary
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeSqlString(summaryId)}'
    `);

    // Cascade the same status onto the catch-up adjustment for the same
    // (donor, month) so the user manages them as a single payment.
    await execute(`
      UPDATE abatement_adjustments
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE EXISTS (
        SELECT 1
        FROM monthly_donor_summary
        WHERE monthly_donor_summary.id = '${escapeSqlString(summaryId)}'
          AND monthly_donor_summary.donor_id = abatement_adjustments.donor_id
          AND monthly_donor_summary.reference_month = abatement_adjustments.reference_month
      )
    `);

    return;
  }

  // Adjustment-only path: the row in the UI was synthesized because the donor
  // had no donations in the month, but a catch-up exists. Toggle the
  // adjustment's status directly so filters and the toolbar reflect the
  // change.
  if (adjustmentId) {
    await updateAbatementAdjustmentStatus({
      id: adjustmentId,
      status: normalizedStatus,
    });
  }
}

export async function updateAbatementStatusWithHistory({
  history,
  status,
  summaryId,
  adjustmentId = "",
}) {
  await runInTransaction(
    async () => {
      await updateAbatementStatus({ summaryId, status, adjustmentId });

      if (history) {
        await createActionHistoryEntry(history);
      }
    },
    { changeSource: "monthly-action-history" },
  );
}

export async function updateAbatementStatuses({
  summaryIds = [],
  adjustmentIds = [],
  status,
}) {
  const normalizedSummaryIds = Array.from(
    new Set(
      summaryIds
        .map((summaryId) => String(summaryId ?? "").trim())
        .filter(Boolean)
        .filter((summaryId) => !isSyntheticSummaryId(summaryId)),
    ),
  );

  const normalizedAdjustmentIds = Array.from(
    new Set(
      adjustmentIds
        .map((adjustmentId) => String(adjustmentId ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (
    normalizedSummaryIds.length === 0 &&
    normalizedAdjustmentIds.length === 0
  ) {
    return;
  }

  const normalizedStatus = status === "applied" ? "applied" : "pending";

  if (normalizedSummaryIds.length > 0) {
    const summaryIdList = normalizedSummaryIds
      .map((summaryId) => `'${escapeSqlString(summaryId)}'`)
      .join(", ");

    await execute(`
      UPDATE monthly_donor_summary
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${summaryIdList})
    `);

    // Mirror the bulk update onto matching catch-up adjustments.
    await execute(`
      UPDATE abatement_adjustments
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE EXISTS (
        SELECT 1
        FROM monthly_donor_summary
        WHERE monthly_donor_summary.id IN (${summaryIdList})
          AND monthly_donor_summary.donor_id = abatement_adjustments.donor_id
          AND monthly_donor_summary.reference_month = abatement_adjustments.reference_month
      )
    `);
  }

  // Update standalone adjustment-only rows that have no real summary in the
  // database (e.g. donor billed only via catch-up because they didn't donate
  // this month).
  if (normalizedAdjustmentIds.length > 0) {
    const adjustmentIdList = normalizedAdjustmentIds
      .map((adjustmentId) => `'${escapeSqlString(adjustmentId)}'`)
      .join(", ");

    await execute(`
      UPDATE abatement_adjustments
      SET
        abatement_status = '${escapeSqlString(normalizedStatus)}',
        abatement_marked_at = ${
          normalizedStatus === "applied" ? "CURRENT_TIMESTAMP" : "NULL"
        },
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${adjustmentIdList})
    `);
  }
}

export async function updateAbatementStatusesWithHistory({
  history,
  status,
  summaryIds = [],
  adjustmentIds = [],
}) {
  await runInTransaction(
    async () => {
      await updateAbatementStatuses({ summaryIds, adjustmentIds, status });

      if (history) {
        await createActionHistoryEntry(history);
      }
    },
    { changeSource: "monthly-action-history" },
  );
}
