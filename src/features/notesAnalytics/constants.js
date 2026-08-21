/**
 * Estado inicial e vocabulário dos filtros de notas fiscais.
 *
 * Um objeto só, compartilhado pelo painel da plataforma e pelo perfil do
 * doador: é o que permite comparar o estado atual com o inicial para saber se
 * há filtro aplicado — e o que impede as duas telas divergirem no que
 * consideram "sem filtro".
 */
export const INITIAL_NOTE_FILTERS = {
  projectId: "",
  donorId: "",
  referenceMonth: "",
  dateFrom: "",
  dateTo: "",
  cnpj: "",
  valueMin: "",
  valueMax: "",
  creditMin: "",
  creditMax: "",
  numeroNota: "",
  cpf: "",
  status: "valid",
  search: "",
};

export const NOTE_STATUS_FILTER_OPTIONS = [
  { value: "valid", label: "Notas válidas" },
  { value: "invalid", label: "Não encontradas" },
  { value: "all", label: "Todas" },
];

/**
 * Colunas da tabela.
 *
 * `sort` é a chave aceita pelo SQL (lista fechada em `NOTE_SORT_COLUMNS`);
 * coluna sem `sort` não oferece ordenação, o que é honesto para uma coluna
 * derivada que o banco não sabe ordenar.
 */
export const NOTE_TABLE_COLUMNS = [
  { key: "data", label: "Data", sort: "data" },
  { key: "competencia", label: "Competência", sort: "competencia" },
  { key: "doador", label: "Doador", sort: "doador" },
  { key: "estabelecimento", label: "Estabelecimento", sort: "estabelecimento" },
  { key: "numero", label: "Nota", sort: "numero" },
  { key: "valor", label: "Valor", sort: "valor", align: "right" },
  { key: "credito", label: "Crédito", sort: "credito", align: "right" },
  { key: "retorno", label: "Retorno", sort: "retorno", align: "right" },
  { key: "projeto", label: "Projeto", sort: "projeto" },
];

export const NOTE_EXPORT_HEADERS = [
  { key: "dataNota", label: "Data da compra" },
  { key: "referenceMonth", label: "Competência" },
  { key: "donor", label: "Doador" },
  { key: "cpf", label: "CPF" },
  { key: "establishment", label: "Estabelecimento" },
  { key: "cnpj", label: "CNPJ do estabelecimento" },
  { key: "numeroNota", label: "Número da nota" },
  { key: "valor", label: "Valor da compra" },
  { key: "credito", label: "Crédito gerado" },
  { key: "retorno", label: "Retorno" },
  { key: "project", label: "Projeto" },
  { key: "statusPedido", label: "Situação" },
];
