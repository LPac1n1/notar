/**
 * Classificador puro do estado de conciliação de um doador. Fica em módulo
 * próprio para ser testado em Node sem arrastar a stack do DuckDB-WASM junto.
 *
 *   no-credit  — nenhuma nota do doador casou com a planilha de créditos,
 *                então não há o que comparar.
 *   ok         — o doador tem crédito real conciliado.
 *
 * Não existe mais um estado de alerta aqui. Havia um `exceeded` (abatido
 * acima do crédito casado), removido porque acendia sozinho no caso mais
 * comum e menos problemático: o mês cuja planilha de créditos ainda não foi
 * importada. Sem crédito casado o crédito conta como zero, então qualquer
 * abatimento já marcado disparava o alerta — sinalizando erro onde não havia
 * nenhum. O usuário confirmou que a métrica não era útil.
 *
 * A comparação entre abatido e crédito continua visível como número (coluna
 * "Saldo" na Gestão Mensal, tiles no perfil do doador); o que saiu foi o
 * julgamento automático em cima dela.
 */
export function computeReconciliationStatus(totalCredit, totalAbated) {
  if (totalCredit <= 0 && totalAbated <= 0) {
    return "no-credit";
  }
  return "ok";
}
