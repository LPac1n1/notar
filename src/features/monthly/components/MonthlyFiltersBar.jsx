import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import {
  ABATEMENT_SORT_OPTIONS,
  ABATEMENT_STATUS_OPTIONS,
  DONATION_ACTIVITY_OPTIONS,
  DONATION_START_DATE_OPTIONS,
  DONOR_TYPE_OPTIONS,
} from "../constants";

export default function MonthlyFiltersBar({
  filters,
  donorOptions,
  cpfOptions,
  demandOptions,
  hasSelectedReferenceMonth,
  isNotDonatedFilterActive,
  onChange,
}) {
  return (
    <>
      <div
        className={`mb-5 grid gap-3 md:grid-cols-2 ${
          hasSelectedReferenceMonth ? "xl:grid-cols-5" : "xl:grid-cols-4"
        }`}
      >
        <MonthInput
          label="Mês"
          name="referenceMonth"
          value={filters.referenceMonth}
          onChange={onChange}
        />

        <SelectInput
          label="Doador"
          name="donorId"
          value={filters.donorId}
          onChange={onChange}
          options={donorOptions}
          placeholder="Todos os doadores"
          searchable
          searchPlaceholder="Buscar doador..."
        />

        {hasSelectedReferenceMonth ? (
          <SelectInput
            label="Atividade no mês"
            name="donationActivity"
            value={filters.donationActivity}
            onChange={onChange}
            options={DONATION_ACTIVITY_OPTIONS}
            placeholder="Todos os doadores"
          />
        ) : null}

        <SelectInput
          label="Status do abatimento"
          name="abatementStatus"
          value={filters.abatementStatus}
          onChange={onChange}
          options={ABATEMENT_STATUS_OPTIONS}
          placeholder="Todos os status"
          disabled={isNotDonatedFilterActive}
        />

        <SelectInput
          label="Ordenação"
          name="abatementSort"
          value={filters.abatementSort}
          onChange={onChange}
          options={ABATEMENT_SORT_OPTIONS}
          placeholder="Ordenar por abatimento"
        />
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectInput
          label="Tipo"
          name="donorType"
          value={filters.donorType}
          onChange={onChange}
          options={DONOR_TYPE_OPTIONS}
          placeholder="Todos os tipos"
        />

        <SelectInput
          label="Início das doações"
          name="donationStartDate"
          value={filters.donationStartDate}
          onChange={onChange}
          options={DONATION_START_DATE_OPTIONS}
          placeholder="Com ou sem data de início"
        />

        <SelectInput
          label="CPF"
          name="cpf"
          value={filters.cpf}
          onChange={onChange}
          options={cpfOptions}
          placeholder="Todos os CPFs"
          searchable
          searchPlaceholder="Buscar CPF..."
        />

        <SelectInput
          label="Demanda"
          name="demand"
          value={filters.demand}
          onChange={onChange}
          options={demandOptions}
          placeholder="Todas as demandas"
          searchable
          searchPlaceholder="Buscar demanda..."
        />
      </div>
    </>
  );
}
