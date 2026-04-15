export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

export function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}
