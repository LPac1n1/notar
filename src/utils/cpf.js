export function normalizeCpf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCpf(value) {
  const digits = normalizeCpf(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}
