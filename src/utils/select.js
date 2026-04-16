export function buildSelectOptions(
  items,
  {
    getValue = (item) => item,
    getLabel = (item) => item,
    emptyLabel = "",
  } = {},
) {
  const uniqueOptions = new Map();

  for (const item of items) {
    const rawValue = getValue(item);
    const value = String(rawValue ?? "").trim();

    if (!value || uniqueOptions.has(value)) {
      continue;
    }

    const label = String(getLabel(item) ?? value).trim();
    uniqueOptions.set(value, {
      value,
      label: label || value,
    });
  }

  const options = Array.from(uniqueOptions.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }),
  );

  return emptyLabel
    ? [{ value: "", label: emptyLabel }, ...options]
    : options;
}
