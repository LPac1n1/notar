function escapeCsvCell(value) {
  const normalizedValue = String(value ?? "");

  if (
    normalizedValue.includes(";") ||
    normalizedValue.includes('"') ||
    normalizedValue.includes("\n")
  ) {
    return `"${normalizedValue.replaceAll('"', '""')}"`;
  }

  return normalizedValue;
}

export function buildCsvContent(headers, rows) {
  const headerLine = headers.map((header) => escapeCsvCell(header.label)).join(";");
  const dataLines = rows.map((row) =>
    headers
      .map((header) => escapeCsvCell(row[header.key]))
      .join(";"),
  );

  return [headerLine, ...dataLines].join("\n");
}
