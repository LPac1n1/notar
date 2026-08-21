import {
  ChevronDownIcon,
  ChevronUpIcon,
  SortIcon,
} from "../../../components/ui/icons";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency } from "../../../utils/format";
import { NOTE_TABLE_COLUMNS } from "../constants";

/**
 * Tabela de notas fiscais, com ordenação por coluna.
 *
 * Não usa o `DataTable` compartilhado porque o cabeçalho aqui é INTERATIVO: a
 * célula precisa conter um botão e anunciar a direção atual por `aria-sort`.
 * Ensinar o primitivo a fazer isso o tornaria configurável demais para as
 * outras três tabelas, que são estáticas.
 *
 * A ordenação acontece no BANCO, não no navegador: a tabela é paginada, e
 * ordenar só a página visível mostraria "os maiores" de um pedaço arbitrário
 * do conjunto — o erro mais convincente que uma tabela assim pode cometer.
 */

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function HeaderCell({ column, sort, direction, onSort, hidden }) {
  if (hidden) {
    return null;
  }

  const isActive = column.sort && column.sort === sort;
  const alignment = column.align === "right" ? "text-right" : "text-left";

  if (!column.sort) {
    return (
      <th scope="col" className={`px-3 py-2 ${alignment}`}>
        {column.label}
      </th>
    );
  }

  return (
    <th
      scope="col"
      className={`px-3 py-2 ${alignment}`}
      aria-sort={
        isActive ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column.sort)}
        className={`inline-flex min-h-8 items-center gap-1 ${
          column.align === "right" ? "flex-row-reverse" : ""
        } ${isActive ? "text-[var(--accent)]" : "hover:text-[var(--text-main)]"}`}
      >
        {column.label}
        {isActive ? (
          direction === "asc" ? (
            <ChevronUpIcon className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />
          )
        ) : (
          <SortIcon className="h-3 w-3 opacity-40" aria-hidden="true" />
        )}
        {/* A direção também em texto: o ícone sozinho não é lido por leitor de
            tela, e `aria-sort` não é anunciado por todos eles. */}
        <span className="sr-only">
          {isActive
            ? direction === "asc"
              ? "(crescente)"
              : "(decrescente)"
            : "(ordenar)"}
        </span>
      </button>
    </th>
  );
}

export default function NoteAnalyticsTable({
  caption,
  direction,
  hiddenColumns = [],
  onSort,
  rows,
  sort,
}) {
  const isHidden = (key) => hiddenColumns.includes(key);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[var(--surface-strong)] text-xs tracking-wide text-[var(--muted)] uppercase">
          <tr>
            {NOTE_TABLE_COLUMNS.map((column) => (
              <HeaderCell
                key={column.key}
                column={column}
                direction={direction}
                hidden={isHidden(column.key)}
                onSort={onSort}
                sort={sort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((row) => (
            <tr key={row.id}>
              {isHidden("data") ? null : (
                <td className="px-3 py-2 text-[var(--text-main)]">
                  {row.dataNota ? formatDatePtBR(row.dataNota) : "—"}
                </td>
              )}
              {isHidden("competencia") ? null : (
                <td className="px-3 py-2 text-[var(--muted)]">
                  {formatMonthYear(row.referenceMonth)}
                </td>
              )}
              {isHidden("doador") ? null : (
                <td className="px-3 py-2 text-[var(--text-main)]">
                  {row.donor ?? "Não cadastrado"}
                </td>
              )}
              {isHidden("estabelecimento") ? null : (
                <td className="px-3 py-2 text-[var(--text-main)]">
                  {row.establishment}
                </td>
              )}
              {isHidden("numero") ? null : (
                <td className="numeric px-3 py-2 text-[var(--muted)]">
                  {row.numeroNota || "—"}
                </td>
              )}
              {isHidden("valor") ? null : (
                <td className="numeric px-3 py-2 text-right text-[var(--text-main)]">
                  {formatCurrency(row.valor)}
                </td>
              )}
              {isHidden("credito") ? null : (
                <td className="numeric px-3 py-2 text-right font-semibold text-[var(--text-main)]">
                  {/* Traço, e não R$ 0,00: a nota pode apenas não ter crédito
                      importado ainda, e zero afirmaria que ela nada rendeu. */}
                  {row.credito === null ? (
                    <span className="text-[var(--muted)]">—</span>
                  ) : (
                    formatCurrency(row.credito)
                  )}
                </td>
              )}
              {isHidden("retorno") ? null : (
                <td className="numeric px-3 py-2 text-right text-[var(--text-soft)]">
                  {formatPercent(row.retorno)}
                </td>
              )}
              {isHidden("projeto") ? null : (
                <td className="px-3 py-2 text-[var(--muted)]">
                  {row.project ?? "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
