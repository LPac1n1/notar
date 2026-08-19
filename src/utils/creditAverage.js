/**
 * Crédito médio por nota doada.
 *
 * É uma MÉDIA, não uma taxa do programa. Quanto a NFP credita depende do valor
 * da nota e do estabelecimento, então o número varia de doador para doador e
 * de mês para mês. Quem lê "R$ 5,00 por nota" tende a tratar como regra fixa e
 * projetar em cima — por isso a interface mostra sempre o total de notas ao
 * lado, e o rótulo diz "média".
 *
 * Devolve `null` quando não há nota nenhuma: dividir por zero produziria
 * Infinity, e exibir "R$ 0,00 por nota" afirmaria que cada nota rendeu nada,
 * quando na verdade não houve nota.
 */
export function creditPerNote(totalCredit, notesCount) {
  const notes = Number(notesCount ?? 0);

  if (!Number.isFinite(notes) || notes <= 0) {
    return null;
  }

  return Number(totalCredit ?? 0) / notes;
}
