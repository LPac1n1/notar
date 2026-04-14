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
