import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import TextInput from "../../../components/ui/TextInput";

/**
 * `showDemand` acompanha o módulo Demandas do projeto ativo. Num projeto que
 * não o usa, o campo não fica vazio nem opcional: ele não existe. A demanda
 * subdivide o projeto, então oferecê-la onde não há nenhuma pede um dado que
 * não pode ser preenchido.
 *
 * `showDonorRoles` segue a Gestão Mensal. Titular e auxiliar existem para o
 * rollup mensal — a nota do auxiliar sobe para o titular. Sem apuração, o
 * crédito é agrupado pelo CPF de cada doador e os dois papéis dariam o mesmo
 * resultado: o campo pediria uma escolha sem consequência, e o vínculo que
 * ele destrava não teria efeito nenhum sobre os números.
 */
export default function DonorForm({
  demandOptions,
  donationStartDescription = "",
  errors = {},
  form,
  holderOptions,
  isIdentityLocked = false,
  onChange,
  selectedHolder,
  showDemand = true,
  showDonorRoles = true,
  typeOptions,
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {showDonorRoles ? (
        <SelectInput
          label="Tipo de doador"
          name="donorType"
          value={form.donorType}
          onChange={onChange}
          options={typeOptions}
          placeholder="Tipo de doador"
          error={errors.donorType}
        />
      ) : null}

      {showDemand ? (
        <SelectInput
          label="Demanda"
          name="demand"
          value={form.demand}
          onChange={onChange}
          options={demandOptions}
          placeholder="Selecione uma demanda"
          searchable
          searchPlaceholder="Buscar demanda..."
          error={errors.demand}
        />
      ) : null}

      {showDonorRoles && form.donorType === "auxiliary" ? (
        <div className="space-y-1.5 md:col-span-2">
          <SelectInput
            label="Vincular a"
            name="holderPersonId"
            value={form.holderPersonId}
            onChange={onChange}
            options={holderOptions}
            placeholder="Selecione titular ou pessoa"
            searchable
            searchPlaceholder="Buscar titular ou pessoa..."
            error={errors.holderPersonId}
          />
          {selectedHolder && !selectedHolder.donorId ? (
            <p className="text-xs text-[var(--muted)]">
              Pessoa sem papel de doador. O vínculo será apenas informativo.
            </p>
          ) : null}
        </div>
      ) : null}

      <TextInput
        label="Nome do doador"
        name="name"
        placeholder="Nome do doador"
        value={form.name}
        onChange={onChange}
        error={errors.name}
        readOnly={isIdentityLocked}
        className={
          isIdentityLocked
            ? "cursor-default bg-[var(--surface-strong)] text-[var(--muted-strong)]"
            : ""
        }
      />
      <TextInput
        label="CPF"
        name="cpf"
        placeholder="CPF"
        inputMode="numeric"
        value={form.cpf}
        onChange={onChange}
        error={errors.cpf}
        readOnly={isIdentityLocked}
        className={
          isIdentityLocked
            ? "cursor-default bg-[var(--surface-strong)] text-[var(--muted-strong)]"
            : ""
        }
      />

      <MonthInput
        label="Início das doações"
        name="donationStartDate"
        value={form.donationStartDate}
        onChange={onChange}
        error={errors.donationStartDate}
        description={donationStartDescription}
      />
    </div>
  );
}
