import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";
import {
  ABATEMENT_SORT_OPTIONS,
  ABATEMENT_STATUS_OPTIONS,
  DONATION_ACTIVITY_OPTIONS,
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
          name="referenceMonth"
          value={filters.referenceMonth}
          onChange={onChange}
        />

        <SelectInput
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
            name="donationActivity"
            value={filters.donationActivity}
            onChange={onChange}
            options={DONATION_ACTIVITY_OPTIONS}
            placeholder="Todos os doadores"
          />
        ) : null}

        <SelectInput
          name="abatementStatus"
          value={filters.abatementStatus}
          onChange={onChange}
          options={ABATEMENT_STATUS_OPTIONS}
          placeholder="Todos os status"
          disabled={isNotDonatedFilterActive}
        />

        <SelectInput
          name="abatementSort"
          value={filters.abatementSort}
          onChange={onChange}
          options={ABATEMENT_SORT_OPTIONS}
          placeholder="Ordenar por abatimento"
        />
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <SelectInput
          name="cpf"
          value={filters.cpf}
          onChange={onChange}
          options={cpfOptions}
          placeholder="Todos os CPFs"
          searchable
          searchPlaceholder="Buscar CPF..."
        />

        <SelectInput
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
