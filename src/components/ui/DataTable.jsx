/**
 * Moldura de tabela de dados.
 *
 * Três telas — retorno mês a mês do projeto, crédito por projeto na
 * plataforma e visão por mês das importações — repetiam a MESMA moldura
 * caractere por caractere: rolagem horizontal, `min-w-full`, divisórias,
 * legenda só para leitor de tela e um cabeçalho em versalete. Só o corpo
 * mudava. Copiar de novo a cada tabela nova é como as divergências começam,
 * e uma delas já tinha acontecido: a tabela de pré-visualização de planilha
 * seguiu outro caminho e acabou com uma borda de linha fixa em branco, que
 * o tema claro apaga por completo.
 *
 * O componente cuida da moldura e do cabeçalho; o corpo continua sendo de
 * quem chama, porque é ali que cada tabela é genuinamente diferente.
 *
 * A rolagem fica no invólucro, e não no corpo da página: tabela larga rola
 * dentro de si mesma em vez de empurrar a página inteira para o lado.
 */
export default function DataTable({
  ariaBusy,
  bodyClassName = "",
  caption,
  children,
  columns,
}) {
  return (
    <div aria-busy={ariaBusy} className="min-w-0 overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
        {/* Legenda só para leitor de tela: a tabela já tem título visível na
            seção que a contém, então repeti-lo na tela seria redundante —
            mas sem ela a tabela chega sem nome na navegação por landmarks. */}
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[var(--surface-strong)] text-xs tracking-wide text-[var(--muted)] uppercase">
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""} ${column.className ?? ""}`.trim()}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y divide-[var(--line)] ${bodyClassName}`.trim()}>
          {children}
        </tbody>
      </table>
    </div>
  );
}
