import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import TextInput from "../../../components/ui/TextInput";
import { NOTE_STATUS_FILTER_OPTIONS } from "../constants";

/**
 * Filtros das tabelas analíticas de notas fiscais.
 *
 * Um componente só para as duas telas: no perfil do doador o filtro de doador
 * é escondido (já está travado pelo contexto da página) e o resto é idêntico.
 * Duplicar a barra faria as duas divergirem no primeiro filtro novo.
 *
 * `hidden` esconde campos que não fazem sentido no contexto, em vez de o
 * chamador montar a barra campo a campo — assim um filtro novo aparece nas
 * duas telas sem ninguém precisar lembrar de adicioná-lo na segunda.
 *
 * NÃO há cidade nem estado: nenhuma das planilhas importadas traz essas
 * colunas. Oferecer o campo vazio sugeriria um recorte que o dado não sustenta.
 */
export default function NoteFiltersBar({
  filters,
  hidden = [],
  onChange,
  options,
}) {
  const isHidden = (field) => hidden.includes(field);
  const set = (name, value) => onChange({ ...filters, [name]: value });
  const handleInput = (event) => set(event.target.name, event.target.value);

  return (
    <div className="space-y-3">
      <TextInput
        label="Busca"
        name="search"
        placeholder="Estabelecimento, doador, número da nota ou CPF"
        value={filters.search}
        onChange={handleInput}
        description="Procura em vários campos ao mesmo tempo, sem diferenciar acento."
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isHidden("projectId") ? null : (
          <SelectInput
            label="Projeto"
            name="projectId"
            value={filters.projectId}
            onChange={handleInput}
            options={options.projects}
            placeholder="Todos os projetos"
            searchable
          />
        )}

        {isHidden("donorId") ? null : (
          <SelectInput
            label="Doador"
            name="donorId"
            value={filters.donorId}
            onChange={handleInput}
            options={options.donors}
            placeholder="Todos os doadores"
            searchable
          />
        )}

        <SelectInput
          label="Estabelecimento"
          name="cnpj"
          value={filters.cnpj}
          onChange={handleInput}
          options={options.establishments}
          placeholder="Todos os estabelecimentos"
          searchable
        />

        <SelectInput
          label="Competência"
          name="referenceMonth"
          value={filters.referenceMonth}
          onChange={handleInput}
          options={options.months}
          placeholder="Todas as competências"
          searchable
        />

        <SelectInput
          label="Situação da nota"
          name="status"
          value={filters.status}
          onChange={handleInput}
          options={NOTE_STATUS_FILTER_OPTIONS}
        />

        {/* Período é sobre a DATA DA COMPRA; competência é o mês de apuração.
            Uma compra do fim do mês costuma cair na competência seguinte, e
            por isso os dois filtros convivem em vez de um substituir o outro. */}
        <MonthInput
          label="Compras a partir de"
          name="dateFrom"
          value={filters.dateFrom}
          onChange={handleInput}
        />
        <MonthInput
          label="Compras até"
          name="dateTo"
          value={filters.dateTo}
          onChange={handleInput}
        />

        <TextInput
          label="Número da nota"
          name="numeroNota"
          placeholder="Número exato"
          inputMode="numeric"
          value={filters.numeroNota}
          onChange={handleInput}
        />

        {isHidden("cpf") ? null : (
          <TextInput
            label="CPF"
            name="cpf"
            placeholder="Com ou sem pontuação"
            inputMode="numeric"
            value={filters.cpf}
            onChange={handleInput}
          />
        )}

        <TextInput
          label="Valor mínimo"
          name="valueMin"
          placeholder="R$"
          inputMode="decimal"
          value={filters.valueMin}
          onChange={handleInput}
        />
        <TextInput
          label="Valor máximo"
          name="valueMax"
          placeholder="R$"
          inputMode="decimal"
          value={filters.valueMax}
          onChange={handleInput}
        />
        <TextInput
          label="Crédito mínimo"
          name="creditMin"
          placeholder="R$"
          inputMode="decimal"
          value={filters.creditMin}
          onChange={handleInput}
        />
        <TextInput
          label="Crédito máximo"
          name="creditMax"
          placeholder="R$"
          inputMode="decimal"
          value={filters.creditMax}
          onChange={handleInput}
        />
      </div>
    </div>
  );
}
