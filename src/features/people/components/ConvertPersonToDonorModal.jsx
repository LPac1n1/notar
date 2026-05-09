import DonorForm from "../../donors/components/DonorForm";
import FormModal from "../../../components/ui/FormModal";
import { formatInteger } from "../../../utils/format";

export default function ConvertPersonToDonorModal({
  demandOptions,
  errors,
  feedbackMessage = "",
  form,
  holderOptions,
  isConverting = false,
  onChange,
  onClose,
  onSubmit,
  person,
  selectedHolder,
  typeOptions,
}) {
  if (!person) {
    return null;
  }

  return (
    <FormModal
      title="Converter pessoa em doador"
      description="Informe apenas os dados do papel de doador. Nome e CPF serão preservados."
      confirmLabel="Converter em doador"
      feedbackMessage={feedbackMessage}
      isLoading={isConverting}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <div className="space-y-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Pessoa selecionada
          </p>
          <p className="mt-1 font-semibold text-[var(--text-main)]">
            {person.name}
          </p>
          <p className="text-sm text-[var(--muted)]">CPF: {person.cpf}</p>
          {person.referencedByAuxiliaries > 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Referência de {formatInteger(person.referencedByAuxiliaries)}{" "}
              auxiliar(es). Ao converter como titular, esses vínculos serão
              mantidos. Por isso, a conversão como auxiliar não fica disponível
              neste caso.
            </p>
          ) : null}
        </div>

        <DonorForm
          demandOptions={demandOptions}
          errors={errors}
          form={form}
          holderOptions={holderOptions}
          isIdentityLocked
          onChange={onChange}
          selectedHolder={selectedHolder}
          typeOptions={typeOptions}
        />
      </div>
    </FormModal>
  );
}
