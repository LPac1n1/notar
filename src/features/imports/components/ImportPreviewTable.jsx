import EmptyState from "../../../components/ui/EmptyState";

/**
 * Amostra da planilha antes de importar.
 *
 * Não usa o `DataTable` das outras tabelas por um motivo: ali o cabeçalho é
 * rótulo de interface e vai em versalete, enquanto aqui ele é DADO — são os
 * nomes das colunas do arquivo do usuário. Passá-los por uppercase mostraria
 * um nome diferente do que está no arquivo, justamente na tela em que ele
 * confere se o sistema leu o cabeçalho certo.
 *
 * O resto (moldura, divisórias, células) segue os mesmos tokens.
 */

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
        <thead className="bg-[var(--surface-strong)]">
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
              className="border-b border-[var(--line)]"
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
