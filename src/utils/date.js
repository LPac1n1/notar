export function startOfMonth(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  if (/^\d{2}\/\d{4}$/.test(value)) {
    const [month, year] = value.split("/");
    const monthNumber = Number(month);

    if (monthNumber < 1 || monthNumber > 12) {
      return "";
    }

    return `${year}-${month}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value.slice(0, 7)}-01`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function formatMonthYear(value) {
  if (!value) {
    return "";
  }

  const [year, month] = String(value).split("-");

  if (!year || !month) {
    return value;
  }

  const date = new Date(`${year}-${month}-01T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formattedValue = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return formattedValue.charAt(0).toUpperCase() + formattedValue.slice(1);
}

export function formatDatePtBR(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTimePtBR(value) {
  if (!value) {
    return "";
  }

  const normalizedValue = String(value).includes("T")
    ? value
    : String(value).replace(" ", "T");
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDonationDuration(startMonth, now = new Date()) {
  const normalizedStartMonth = startOfMonth(startMonth);

  if (!normalizedStartMonth) {
    return "";
  }

  const [startYear, startMonthNumber] = normalizedStartMonth
    .split("-")
    .map(Number);
  const currentYear = now.getFullYear();
  const currentMonthNumber = now.getMonth() + 1;
  const totalMonths =
    (currentYear - startYear) * 12 + (currentMonthNumber - startMonthNumber) + 1;

  if (!Number.isFinite(totalMonths) || totalMonths <= 0) {
    return "Ainda não iniciado";
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years === 0) {
    return `${totalMonths} ${totalMonths === 1 ? "mês" : "meses"}`;
  }

  if (months === 0) {
    return `${years} ${years === 1 ? "ano" : "anos"}`;
  }

  return `${years} ${years === 1 ? "ano" : "anos"} e ${months} ${
    months === 1 ? "mês" : "meses"
  }`;
}

export function subtractOneMonth(value) {
  if (!value) {
    return "";
  }

  const [year, month] = String(value).split("-");

  if (!year || !month) {
    return "";
  }

  const date = new Date(Number(year), Number(month) - 1, 1);
  date.setMonth(date.getMonth() - 1);

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}-01`;
}

export function hasDonationStartConflict(donationStartDate, referenceMonth) {
  const normalizedDonationStartDate = startOfMonth(donationStartDate);
  const normalizedReferenceMonth = startOfMonth(referenceMonth);

  if (!normalizedDonationStartDate || !normalizedReferenceMonth) {
    return false;
  }

  return normalizedDonationStartDate > normalizedReferenceMonth;
}
