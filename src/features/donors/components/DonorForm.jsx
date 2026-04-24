import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import TextInput from "../../../components/ui/TextInput";

export default function DonorForm({
  demandOptions,
  form,
  holderOptions,
  onChange,
  selectedHolder,
  typeOptions,
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectInput
        label="Tipo de doador"
        name="donorType"
        value={form.donorType}
        onChange={onChange}
        options={typeOptions}
        placeholder="Tipo de doador"
      />

      <SelectInput
        label="Demanda"
        name="demand"
        value={form.demand}
        onChange={onChange}
        options={demandOptions}
        placeholder="Selecione uma demanda"
        searchable
        searchPlaceholder="Buscar demanda..."
      />

      {form.donorType === "auxiliary" ? (
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
      />
      <TextInput
        label="CPF"
        name="cpf"
        placeholder="CPF"
        value={form.cpf}
        onChange={onChange}
      />

      <MonthInput
        label="Início das doações"
        name="donationStartDate"
        value={form.donationStartDate}
        onChange={onChange}
      />
    </div>
  );
}
