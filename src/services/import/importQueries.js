import {
  escapeSqlString,
  normalizeCpf,
  query,
  queryPrepared,
  startOfMonth,
} from "../db";

/**
 * Read-only listings and searches for the imports domain. Pure projection
 * queries — no mutations, no side effects. The CPF aggregation in
 * `listImportCpfSummary` collapses many appearance rows into one entry per
 * CPF; the heavy lifting happens in JS today, which is fine while volumes
 * stay under a few thousand CPFs per import.
 */

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
  const params = [];

  if (importId) {
    conditions.push("import_cpf_summary.import_id = ?");
    params.push(importId);
  }

  if (referenceMonth) {
    conditions.push("import_cpf_summary.reference_month = ?");
    params.push(startOfMonth(referenceMonth));
  }

  if (cpf.trim()) {
    conditions.push("import_cpf_summary.cpf = ?");
    params.push(normalizeCpf(cpf));
  }

  if (donorId.trim()) {
    conditions.push("donors.id = ?");
    params.push(donorId.trim());
  }

  if (demand.trim()) {
    conditions.push("lower(coalesce(donors.demand, '')) = lower(?)");
    params.push(demand.trim());
  }

  if (registrationFilter === "registered") {
    conditions.push("is_registered_donor = TRUE");
  }

  if (registrationFilter === "unregistered") {
    conditions.push("is_registered_donor = FALSE");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryPrepared(`
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
  `, params);

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

/**
 * Returns `true` when at least one processed donation import exists for
 * the given reference_month. Used by the credits import UI to warn the
 * user that a credit upload without a matching donation upload won't
 * produce any pairings.
 */
export async function hasDonationImportForMonth(referenceMonth) {
  const normalizedMonth = startOfMonth(referenceMonth);
  if (!normalizedMonth) {
    return false;
  }
  const rows = await queryPrepared(
    `
      SELECT 1
      FROM imports
      WHERE reference_month = ?
        AND status = 'processed'
      LIMIT 1
    `,
    [normalizedMonth],
  );
  return rows.length > 0;
}

export async function searchImportedCpfs(rawCpfs = []) {
  const seenCpfs = new Set();
  const normalizedCpfs = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const rawCpf of rawCpfs) {
    const trimmed = String(rawCpf ?? "").trim();
    if (!trimmed) continue;

    const normalized = normalizeCpf(trimmed);

    if (normalized.length !== 11) {
      invalidCount += 1;
      continue;
    }

    if (seenCpfs.has(normalized)) {
      duplicateCount += 1;
      continue;
    }

    seenCpfs.add(normalized);
    normalizedCpfs.push(normalized);
  }

  if (normalizedCpfs.length === 0) {
    return {
      registeredWithDonations: [],
      unregisteredWithDonations: [],
      registeredWithoutDonations: [],
      unregisteredWithoutDonations: [],
      stats: {
        inputCount: rawCpfs.length,
        validCount: 0,
        duplicateCount,
        invalidCount,
      },
    };
  }

  // `cpf IN (?, ?, ...)` with one placeholder per CPF — DuckDB-WASM does not
  // support array parameters in a single placeholder, so we expand manually.
  const cpfPlaceholders = normalizedCpfs.map(() => "?").join(", ");

  const summaryRows = await queryPrepared(`
    SELECT
      cpf,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      sum(notes_count) AS notes_count
    FROM import_cpf_summary
    WHERE cpf IN (${cpfPlaceholders})
    GROUP BY cpf, reference_month
    ORDER BY cpf ASC, reference_month ASC
  `, normalizedCpfs);

  const linkRows = await queryPrepared(`
    SELECT
      donor_cpf_links.cpf,
      donor_cpf_links.donor_id,
      donor_cpf_links.name AS source_name,
      donors.name AS donor_name,
      donors.is_active AS donor_is_active
    FROM donor_cpf_links
    LEFT JOIN donors ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.cpf IN (${cpfPlaceholders})
      AND donor_cpf_links.is_active = TRUE
  `, normalizedCpfs);

  const cpfMap = new Map();
  for (const cpf of normalizedCpfs) {
    cpfMap.set(cpf, {
      cpf,
      donorId: "",
      donorName: "",
      sourceName: "",
      isRegistered: false,
      isActiveDonor: false,
      months: [],
      totalDonations: 0,
    });
  }

  for (const row of linkRows) {
    const entry = cpfMap.get(row.cpf);
    if (!entry) continue;

    entry.isRegistered = true;
    entry.donorId = row.donor_id ?? "";
    entry.donorName = row.donor_name ?? "";
    entry.sourceName = row.source_name ?? "";
    entry.isActiveDonor = Boolean(row.donor_is_active);
  }

  for (const row of summaryRows) {
    const entry = cpfMap.get(row.cpf);
    if (!entry) continue;

    const referenceMonth = String(row.reference_month).slice(0, 7);
    const count = Number(row.notes_count ?? 0);
    entry.months.push({ referenceMonth, count });
    entry.totalDonations += count;
  }

  const registeredWithDonations = [];
  const unregisteredWithDonations = [];
  const registeredWithoutDonations = [];
  const unregisteredWithoutDonations = [];

  for (const entry of cpfMap.values()) {
    const hasDonations = entry.totalDonations > 0;

    if (entry.isRegistered && hasDonations) {
      registeredWithDonations.push(entry);
    } else if (!entry.isRegistered && hasDonations) {
      unregisteredWithDonations.push(entry);
    } else if (entry.isRegistered) {
      registeredWithoutDonations.push(entry);
    } else {
      unregisteredWithoutDonations.push(entry);
    }
  }

  const sortByCpf = (left, right) => left.cpf.localeCompare(right.cpf);
  registeredWithDonations.sort(sortByCpf);
  unregisteredWithDonations.sort(sortByCpf);
  registeredWithoutDonations.sort(sortByCpf);
  unregisteredWithoutDonations.sort(sortByCpf);

  return {
    registeredWithDonations,
    unregisteredWithDonations,
    registeredWithoutDonations,
    unregisteredWithoutDonations,
    stats: {
      inputCount: rawCpfs.length,
      validCount: normalizedCpfs.length,
      duplicateCount,
      invalidCount,
    },
  };
}
