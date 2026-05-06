export {
  DONATION_START_DATE_OPTIONS,
  DONOR_TYPE_OPTIONS,
} from "../donors/constants";

export const INITIAL_MONTHLY_FILTERS = {
  referenceMonth: "",
  donorId: "",
  donorType: "all",
  cpf: "",
  demand: "",
  donationActivity: "all",
  abatementStatus: "all",
  abatementSort: "",
  donationStartDate: "all",
};

export const ICON_TONE_CLASS_NAMES = {
  default:
    "border-[var(--line)] bg-[color:var(--surface-strong)] text-[var(--text-soft)]",
  success:
    "border-[var(--success-line)] bg-[color:var(--accent-2-soft)] text-[var(--success)]",
  warning:
    "border-[var(--warning-line)] bg-[color:var(--accent-soft)] text-[var(--warning)]",
};

export const ABATEMENT_STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Pendentes", tone: "warning" },
  { value: "applied", label: "Realizados", tone: "success" },
];

export const DONATION_ACTIVITY_OPTIONS = [
  { value: "all", label: "Todos os doadores" },
  { value: "donated", label: "Doaram no mês", tone: "success" },
  { value: "not-donated", label: "Não doaram no mês", tone: "default" },
];

export const ABATEMENT_SORT_OPTIONS = [
  { value: "", label: "Sem ordenação por abatimento" },
  { value: "desc", label: "Maior abatimento primeiro" },
  { value: "asc", label: "Menor abatimento primeiro" },
];
