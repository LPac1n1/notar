import EmptyState from "../../../components/ui/EmptyState";

export default function ImportPreviewTable({ previewData }) {
  if (previewData.previewRows.length === 0) {
    return (
      <EmptyState
        title="Planilha sem linhas visíveis"
        description="Confira se o arquivo possui cabeçalho e dados para importar."
      />
    );
  }

  return (
    <div className="overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface-elevated)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[color:var(--surface-muted)]">
          <tr>
            {previewData.columns.map((column) => (
              <th
                key={column}
                className="border-b border-[var(--line)] px-3 py-2 text-left font-medium text-[var(--text-soft)]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewData.previewRows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-[rgba(255,255,255,0.05)]"
            >
              {previewData.columns.map((column) => (
                <td
                  key={`${index}-${column}`}
                  className="px-3 py-2 text-[var(--text-soft)]"
                >
                  {String(row[column] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
