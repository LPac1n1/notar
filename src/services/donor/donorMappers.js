import { startOfMonth } from "../db";
import { formatCpf } from "../../utils/cpf";
import { formatMonthYear } from "../../utils/date";

export function normalizeDonorType(value) {
  return value === "auxiliary" ? "auxiliary" : "holder";
}

export function normalizeOptionalStartDate(value) {
  return value ? startOfMonth(value) : null;
}

export function parseAuxiliarySummary(value) {
  return String(value ?? "")
    .split(";;")
    .map((item) => {
      const [id = "", name = "", cpf = ""] = item.split("|");

      return {
        id,
        name,
        cpf: formatCpf(cpf),
      };
    })
    .filter((item) => item.id || item.name || item.cpf);
}

export function mapDonorRow(row) {
  const auxiliaryDonors = parseAuxiliarySummary(row.auxiliary_summary);

  return {
    id: row.id,
    personId: row.person_id ?? "",
    name: row.name,
    cpf: formatCpf(row.cpf),
    cpfValue: row.cpf,
    demand: row.demand ?? "",
    donorType: normalizeDonorType(row.donor_type),
    donorTypeLabel: row.donor_type === "auxiliary" ? "Auxiliar" : "Titular",
    holderDonorId: row.active_holder_donor_id ?? row.holder_donor_id ?? "",
    holderPersonId: row.holder_person_id ?? "",
    holderName: row.holder_name ?? "",
    holderCpf: row.holder_cpf ? formatCpf(row.holder_cpf) : "",
    holderIsActiveDonor: Boolean(row.active_holder_donor_id),
    donationStartDateValue: row.donation_start_date
      ? String(row.donation_start_date).slice(0, 7)
      : "",
    donationStartDate: formatMonthYear(row.donation_start_date ?? ""),
    isActive: Boolean(row.is_active),
    deactivatedSince: row.deactivated_since
      ? String(row.deactivated_since).slice(0, 7)
      : "",
    createdAt: row.created_at ?? "",
    linkedCpfCount: Number(row.linked_cpf_count ?? 0),
    auxiliaryCount: Number(row.auxiliary_count ?? 0),
    auxiliaryDonors,
    auxiliaryNames: auxiliaryDonors.map((auxiliary) => auxiliary.name),
  };
}
