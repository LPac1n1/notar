import {
  buildTextSearchCondition,
  normalizeCpf,
  queryPrepared,
} from "../db";
import { listAdjustmentsForDonor } from "../abatementAdjustmentService";
import {
  findOrphanAdjustments,
  markSubsumedRows,
  mergeAdjustmentsByMonth,
  synthesizeAdjustmentOnlyRow,
} from "../monthly/sharedFragments";
import {
  mapDonorRow,
  normalizeDonorType,
} from "./donorMappers";
import { formatCpf } from "../../utils/cpf";
import { formatMonthYear } from "../../utils/date";
import { getActiveProjectId } from "../activeProject.js";
import { ASSIGNMENT_OPEN_END } from "../project/projectAssignmentSql.js";

/**
 * Read-side queries for the donors domain. Anything that *projects* donor
 * state (lists, profile pages, CPF link inspections) lives here. Mutations
 * live in `donorWriter.js`; activate/deactivate flows live in
 * `donorActivity.js`. The legacy `donorService.js` re-exports each module so
 * existing imports keep working.
 */

/**
 * Build the donors WHERE/params pair shared by `listDonors` and `countDonors`.
 * Kept private so the two callers cannot drift in the conditions they apply
 * — server-side pagination only works correctly when the count and the slice
 * are computed against the exact same predicate.
 */
function buildDonorListConditions({
  donorId = "",
  cpf = "",
  demand = "",
  donorType = "",
  donationStartDate = "all",
  activeStatus = "active",
  search = "",
} = {}) {
  // A lista de doadores é a do PROJETO ATIVO: quem tem vínculo VIGENTE com
  // ele. Um doador transferido some daqui e aparece no projeto de destino, e
  // é isso que faz cada projeto ter sua própria base sem os dados serem
  // duplicados — o registro de doadores é um só na plataforma.
  //
  // A comparação usa a sentinela de "vigente" em vez do mês corrente: o
  // vínculo aberto é o que vale para cadastro, independentemente de qual mês
  // o usuário esteja consultando.
  const conditions = [
    `EXISTS (
      SELECT 1 FROM donor_project_assignments
      WHERE donor_project_assignments.donor_id = donors.id
        AND donor_project_assignments.project_id = ?
        AND donor_project_assignments.valid_to = CAST(? AS DATE)
    )`,
  ];
  const params = [getActiveProjectId(), ASSIGNMENT_OPEN_END];

  // Busca livre: nome do doador, qualquer CPF vinculado a ele, ou a demanda.
  const searchCondition = buildTextSearchCondition(search, [
    { expression: "donors.name" },
    { expression: "donors.demand" },
    {
      expression: `(
        SELECT string_agg(donor_cpf_links.cpf, ' ')
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
      )`,
      type: "cpf",
    },
  ]);

  if (searchCondition) {
    conditions.push(searchCondition.condition);
    params.push(...searchCondition.params);
  }

  if (activeStatus === "active") {
    conditions.push("donors.is_active = TRUE");
  } else if (activeStatus === "inactive") {
    conditions.push("donors.is_active = FALSE");
  }

  if (donorId.trim()) {
    conditions.push("donors.id = ?");
    params.push(donorId.trim());
  }

  if (cpf.trim()) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.cpf = ?
      )
    `);
    params.push(normalizeCpf(cpf));
  }

  if (demand.trim()) {
    conditions.push("donors.demand = ?");
    params.push(demand.trim());
  }

  if (donorType === "holder" || donorType === "auxiliary") {
    conditions.push("donors.donor_type = ?");
    params.push(normalizeDonorType(donorType));
  }

  if (donationStartDate === "with-date") {
    conditions.push("donors.donation_start_date IS NOT NULL");
  }

  if (donationStartDate === "without-date") {
    conditions.push("donors.donation_start_date IS NULL");
  }

  return { conditions, params };
}

export async function listDonors(filters = {}) {
  const {
    donorId = "",
    cpf = "",
    demand = "",
    donorType = "",
    donationStartDate = "all",
    activeStatus = "active",
    search = "",
    // Server-side pagination is opt-in. When `limit` is omitted (the default)
    // the function returns every matching row, preserving the historical
    // contract that pages relying on `usePagination` expect.
    limit,
    offset = 0,
  } = filters;
  const { conditions: baseConditions, params: baseParams } =
    buildDonorListConditions({
      donorId,
      cpf,
      demand,
      donorType,
      donationStartDate,
      activeStatus,
      search,
    });
  const conditions = [...baseConditions];
  const params = [...baseParams];

  const limitClause =
    typeof limit === "number" && Number.isFinite(limit) && limit >= 0
      ? `LIMIT ${Math.max(0, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset))}`
      : "";

  const rows = await queryPrepared(`
    SELECT
      donors.id,
      donors.person_id,
      donors.name,
      donors.cpf,
      donors.demand,
      donors.donor_type,
      donors.holder_donor_id,
      donors.holder_person_id,
      holder_people.name AS holder_name,
      holder_people.cpf AS holder_cpf,
      holder_active_donors.id AS active_holder_donor_id,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date,
      donors.is_active,
      strftime(donors.created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      coalesce((
        SELECT strftime(donor_activity_history.reference_month, '%Y-%m-01')
        FROM donor_activity_history
        WHERE donor_activity_history.donor_id = donors.id
          AND donor_activity_history.event_type = 'deactivated'
        ORDER BY donor_activity_history.reference_month DESC
        LIMIT 1
      ), '') AS deactivated_since,
      coalesce((
        SELECT strftime(donor_activity_history.reference_month, '%Y-%m-01')
        FROM donor_activity_history
        WHERE donor_activity_history.donor_id = donors.id
        ORDER BY donor_activity_history.reference_month DESC, donor_activity_history.created_at DESC
        LIMIT 1
      ), '') AS latest_activity_month,
      coalesce((
        SELECT count(*)
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
      ), 0) AS linked_cpf_count,
      coalesce((
        SELECT count(*)
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_person_id = donors.person_id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      ), 0) AS auxiliary_count,
      coalesce((
        SELECT string_agg(
          auxiliary_donors.id || '|' || auxiliary_donors.name || '|' || auxiliary_donors.cpf,
          ';;'
        )
        FROM donors AS auxiliary_donors
        WHERE auxiliary_donors.holder_person_id = donors.person_id
          AND auxiliary_donors.donor_type = 'auxiliary'
          AND auxiliary_donors.is_active = TRUE
      ), '') AS auxiliary_summary
    FROM donors
    LEFT JOIN people AS holder_people
      ON holder_people.id = donors.holder_person_id
    LEFT JOIN donors AS holder_active_donors
      ON holder_active_donors.person_id = donors.holder_person_id
      AND holder_active_donors.donor_type = 'holder'
      AND holder_active_donors.is_active = TRUE
    ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY donors.created_at DESC, donors.name ASC
    ${limitClause}
  `, params);

  return rows.map(mapDonorRow);
}

/**
 * Returns the count of donors matching the same filter shape as `listDonors`.
 * Pair with `listDonors({ ...filters, limit, offset })` to drive server-side
 * pagination. Kept ignored by callers that still rely on client-side
 * `usePagination`.
 */
export async function countDonors(filters = {}) {
  const { conditions, params } = buildDonorListConditions(filters);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryPrepared(
    `SELECT count(*) AS total FROM donors ${whereClause}`,
    params,
  );

  return Number(rows[0]?.total ?? 0);
}

export async function listHolderDonors() {
  return listDonors({ donorType: "holder" });
}

export async function listDonorCpfLinks(donorId) {
  const rows = await queryPrepared(
    `
    SELECT
      id,
      donor_id,
      name,
      cpf,
      strftime(donation_start_date, '%Y-%m-01') AS donation_start_date,
      link_type,
      is_active
    FROM donor_cpf_links
    WHERE donor_id = ?
    ORDER BY name ASC, cpf ASC
  `,
    [donorId],
  );

  return rows.map((row) => ({
    id: row.id,
    donorId: row.donor_id,
    name: row.name ?? "",
    cpf: formatCpf(row.cpf),
    cpfValue: row.cpf,
    donationStartDateValue: row.donation_start_date
      ? String(row.donation_start_date).slice(0, 7)
      : "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    type: "holder",
    typeLabel: "CPF principal",
    isActive: Boolean(row.is_active),
  }));
}

export async function getDonorProfile(donorId) {
  const donorRows = await queryPrepared(`
    SELECT
      donors.id,
      donors.person_id,
      donors.name,
      donors.cpf,
      donors.demand,
      donors.donor_type,
      donors.holder_donor_id,
      donors.holder_person_id,
      holder_people.name AS holder_name,
      holder_people.cpf AS holder_cpf,
      holder_active_donors.id AS active_holder_donor_id,
      strftime(donors.donation_start_date, '%Y-%m-01') AS donation_start_date,
      donors.is_active,
      strftime(donors.created_at, '%Y-%m-%d %H:%M:%S') AS created_at
    FROM donors
    LEFT JOIN people AS holder_people
      ON holder_people.id = donors.holder_person_id
    LEFT JOIN donors AS holder_active_donors
      ON holder_active_donors.person_id = donors.holder_person_id
      AND holder_active_donors.donor_type = 'holder'
      AND holder_active_donors.is_active = TRUE
    WHERE donors.id = ?
    LIMIT 1
  `, [donorId]);

  if (donorRows.length === 0) {
    throw new Error("Doador não encontrado.");
  }

  const monthlyRows = await queryPrepared(`
    SELECT
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      notes_count,
      value_per_note,
      abatement_amount,
      abatement_status
    FROM monthly_donor_summary
    WHERE donor_id = ?
    ORDER BY reference_month DESC
  `, [donorId]);

  const sourceRows = await queryPrepared(`
    SELECT
      donor_cpf_links.id,
      donor_cpf_links.name,
      donor_cpf_links.cpf,
      donor_cpf_links.link_type,
      strftime(donor_cpf_links.donation_start_date, '%Y-%m-01') AS donation_start_date,
      coalesce(sum(import_cpf_summary.notes_count), 0) AS total_notes
    FROM donor_cpf_links
    LEFT JOIN import_cpf_summary
      ON import_cpf_summary.matched_source_id = donor_cpf_links.id
    WHERE donor_cpf_links.donor_id = ?
    GROUP BY
      donor_cpf_links.id,
      donor_cpf_links.name,
      donor_cpf_links.cpf,
      donor_cpf_links.link_type,
      donor_cpf_links.donation_start_date
    ORDER BY donor_cpf_links.name ASC
  `, [donorId]);

  const auxiliaryRows = await queryPrepared(`
    SELECT
      id,
      name,
      cpf,
      demand,
      strftime(donation_start_date, '%Y-%m-01') AS donation_start_date
    FROM donors
    WHERE holder_person_id = ?
      AND donor_type = 'auxiliary'
      AND is_active = TRUE
    ORDER BY name ASC
  `, [donorRows[0].person_id]);

  const donor = donorRows[0];

  const activityRows = await queryPrepared(`
    SELECT
      event_type,
      strftime(reference_month, '%Y-%m-01') AS reference_month,
      strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at
    FROM donor_activity_history
    WHERE donor_id = ?
    ORDER BY reference_month ASC, created_at ASC
  `, [donorId]);

  const lastDeactivation = activityRows.filter((r) => r.event_type === "deactivated").at(-1);
  const latestActivity = activityRows.at(-1);
  const adjustmentRows = await listAdjustmentsForDonor(donorId);

  // Build a context object for synthesizing orphan-adjustment rows; lets the
  // merged history surface catch-ups whose reference month has no underlying
  // monthly_donor_summary entry.
  const donorContext = {
    cpf: donor.cpf ?? "",
    donorName: donor.name ?? "",
    demand: donor.demand ?? "",
    donorType: normalizeDonorType(donor.donor_type),
    donorTypeLabel: donor.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
    holderDonorId: donor.active_holder_donor_id ?? donor.holder_donor_id ?? "",
    holderPersonId: donor.holder_person_id ?? "",
    holderName: donor.holder_name ?? "",
    holderCpf: donor.holder_cpf ?? "",
    holderIsActiveDonor: Boolean(donor.active_holder_donor_id),
    donationStartDate: donor.donation_start_date ?? "",
  };

  // Project monthly_donor_summary rows into the same shape used by the listing
  // pipeline so we can reuse the merge/mark/orphan helpers and produce totals
  // that agree with the gestão mensal view.
  const baseMonthlyRows = monthlyRows.map((row) => {
    const notesCount = Number(row.notes_count ?? 0);
    return {
      id: `${donorId}-${row.reference_month}`,
      donorId,
      referenceMonth: row.reference_month,
      notesCount,
      valuePerNote: Number(row.value_per_note ?? 0),
      abatementAmount: Number(row.abatement_amount ?? 0),
      abatementStatus: row.abatement_status ?? "pending",
      hasDonationsInMonth: notesCount > 0,
      canUpdateAbatement: notesCount > 0,
    };
  });

  const mergedMonthlyRows = mergeAdjustmentsByMonth(
    baseMonthlyRows,
    adjustmentRows,
  );
  const taggedMonthlyRows = markSubsumedRows(mergedMonthlyRows, adjustmentRows);
  const orphanAdjustments = findOrphanAdjustments(
    taggedMonthlyRows,
    adjustmentRows,
  );
  const orphanRows = orphanAdjustments.map((adjustment) =>
    synthesizeAdjustmentOnlyRow(adjustment, donorContext),
  );

  const allHistoryRows = [...taggedMonthlyRows, ...orphanRows].sort(
    (left, right) =>
      String(right.referenceMonth ?? "").localeCompare(
        String(left.referenceMonth ?? ""),
      ),
  );

  const activeHistoryRows = allHistoryRows.filter((row) => !row.isSubsumed);
  const totalNotes = activeHistoryRows.reduce(
    (total, row) => total + Number(row.notesCount ?? 0),
    0,
  );
  const totalAbatement = activeHistoryRows.reduce(
    (total, row) => total + Number(row.abatementAmount ?? 0),
    0,
  );
  const totalPending = activeHistoryRows
    .filter((row) => row.abatementStatus !== "applied")
    .reduce((total, row) => total + Number(row.abatementAmount ?? 0), 0);
  const totalApplied = activeHistoryRows
    .filter((row) => row.abatementStatus === "applied")
    .reduce((total, row) => total + Number(row.abatementAmount ?? 0), 0);

  return {
    donor: {
      id: donor.id,
      personId: donor.person_id ?? "",
      name: donor.name,
      cpf: formatCpf(donor.cpf),
      cpfValue: donor.cpf,
      demand: donor.demand ?? "",
      donorType: normalizeDonorType(donor.donor_type),
      donorTypeLabel: donor.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
      holderDonorId: donor.active_holder_donor_id ?? donor.holder_donor_id ?? "",
      holderPersonId: donor.holder_person_id ?? "",
      holderName: donor.holder_name ?? "",
      holderCpf: donor.holder_cpf ? formatCpf(donor.holder_cpf) : "",
      holderIsActiveDonor: Boolean(donor.active_holder_donor_id),
      donationStartDateValue: donor.donation_start_date
        ? String(donor.donation_start_date).slice(0, 7)
        : "",
      donationStartDate: formatMonthYear(donor.donation_start_date ?? ""),
      isActive: Boolean(donor.is_active),
      deactivatedSince: lastDeactivation
        ? String(lastDeactivation.reference_month).slice(0, 7)
        : "",
      latestActivityMonth: latestActivity
        ? String(latestActivity.reference_month).slice(0, 7)
        : "",
      createdAt: donor.created_at ?? "",
    },
    auxiliaryDonors: auxiliaryRows.map((row) => ({
      id: row.id,
      name: row.name,
      cpf: formatCpf(row.cpf),
      demand: row.demand ?? "",
      donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    })),
    sources: sourceRows.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      cpf: formatCpf(row.cpf),
      type: "holder",
      typeLabel: "CPF principal",
      donationStartDateValue: row.donation_start_date
        ? String(row.donation_start_date).slice(0, 7)
        : "",
      donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
      totalNotes: Number(row.total_notes ?? 0),
    })),
    monthlyHistory: allHistoryRows.map((row) => ({
      referenceMonth: row.referenceMonth,
      notesCount: Number(row.notesCount ?? 0),
      valuePerNote: Number(row.valuePerNote ?? 0),
      abatementAmount: Number(row.abatementAmount ?? 0),
      abatementStatus: row.abatementStatus ?? "pending",
      isSubsumed: Boolean(row.isSubsumed),
      subsumedByReferenceMonth: row.subsumedByReferenceMonth ?? "",
      hasAdjustment: Boolean(row.hasAdjustment),
      isAdjustmentOnly: Boolean(row.isAdjustmentOnly),
      adjustmentRangeStartMonth: row.adjustment?.rangeStartMonth ?? "",
      adjustmentRangeEndMonth: row.adjustment?.rangeEndMonth ?? "",
    })),
    activityHistory: activityRows.map((row) => ({
      eventType: row.event_type,
      referenceMonth: String(row.reference_month).slice(0, 7),
      referenceMonthFormatted: formatMonthYear(row.reference_month ?? ""),
      createdAt: row.created_at ?? "",
    })),
    abatementAdjustments: adjustmentRows.map((adjustment) => ({
      ...adjustment,
      referenceMonthFormatted: formatMonthYear(adjustment.referenceMonth),
      rangeStartMonthFormatted: formatMonthYear(adjustment.rangeStartMonth),
      rangeEndMonthFormatted: formatMonthYear(adjustment.rangeEndMonth),
    })),
    totals: {
      totalNotes,
      totalAbatement,
      totalPending,
      totalApplied,
      monthCount: activeHistoryRows.length,
      linkedCpfCount: sourceRows.length,
      auxiliaryCount: auxiliaryRows.length,
    },
  };
}
