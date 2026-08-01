import { query } from "../db";
import { DONOR_INACTIVITY_STREAKS_SQL } from "./inactivityStreaksSql";

/**
 * A one-month gap is routine (the donor may simply not have shopped). Two or
 * more consecutive months is the point where it's worth calling to check
 * whether they're still registered at the establishments.
 */
export const INACTIVITY_ALERT_THRESHOLD = 2;

/**
 * Rótulo + tom do badge de inatividade. Compartilhado entre o card da Gestão
 * Mensal e a lista de contato do Dashboard para que o MESMO doador nunca
 * apareça vermelho num lugar e laranja no outro.
 *
 * "Nunca doou" é o caso mais grave (pode ser cadastro errado no
 * estabelecimento, não só um mês fraco), então é o único em vermelho.
 */
export function describeInactivity({
  monthsWithoutDonating = 0,
  hasNeverDonated = false,
} = {}) {
  if (hasNeverDonated) {
    return { label: "Nunca doou", tone: "danger" };
  }

  return {
    label: `${monthsWithoutDonating} ${monthsWithoutDonating === 1 ? "mês" : "meses"} sem doar`,
    tone: "warning",
  };
}

export function mapInactivityRow(row) {
  return {
    donorId: String(row.donor_id),
    donorName: row.donor_name ?? "",
    cpf: row.cpf ?? "",
    demand: row.demand ?? "",
    donorType: row.donor_type === "auxiliary" ? "auxiliary" : "holder",
    monthsWithoutDonating: Number(row.months_without_donating ?? 0),
    eligibleMonths: Number(row.eligible_months ?? 0),
    lastDonationMonth: row.last_donation_month ?? "",
    hasNeverDonated: !row.last_donation_month,
  };
}

/**
 * "Quem parou de doar, e há quantos meses?"
 *
 * Counts, per active donor, how many consecutive imported months they went
 * without a single note — counting backwards from the most recently imported
 * month. Built so the user can pull a call list and check whether someone is
 * still registered at the establishments.
 *
 * Two decisions worth keeping in mind:
 *
 *  • The month grid comes from `imports` (processed), NOT from the calendar.
 *    A month with no spreadsheet imported yet isn't evidence that anyone
 *    stopped donating, so it must not inflate a streak.
 *
 *  • Activity is resolved per DONOR CPF via `import_cpf_summary` →
 *    `donor_cpf_links`, not via `monthly_donor_summary`. Summary rows only
 *    exist for donors that matched an import, so a donor who never sent a
 *    single note has no row at all — keying on them would silently drop
 *    exactly the people this report is meant to surface.
 *
 * Months before a donor's `donation_start_date` are excluded — they were
 * never expected to donate then.
 */
export async function listDonorInactivityStreaks() {
  const rows = await query(DONOR_INACTIVITY_STREAKS_SQL);
  return rows.map(mapInactivityRow);
}

/**
 * Same data keyed by donor id, for O(1) lookup while rendering monthly rows.
 */
export async function getDonorInactivityStreakMap() {
  const rows = await listDonorInactivityStreaks();
  return new Map(rows.map((row) => [row.donorId, row]));
}
