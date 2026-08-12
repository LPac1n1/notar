import { useState } from "react";
import Button from "../../../components/ui/Button";
import MonthInput from "../../../components/ui/MonthInput";
import SelectInput from "../../../components/ui/SelectInput";

/**
 * Formulários de correção que aparecem dentro da própria linha de "Pontos
 * para revisar". Cada um resolve exatamente o campo que causou a
 * inconsistência — não são um formulário de doador reduzido.
 *
 * O estado do rascunho vive em cada linha (e não no pai) para que digitar em
 * uma linha não re-renderize a lista inteira; a lista pode ter centenas de
 * itens desde que os modais passaram a trazer tudo em vez de uma amostra.
 */

function FixShell({
  children,
  actionLabel,
  fieldClassName = "w-full sm:w-56",
  onSubmit,
  isDisabled,
  isBusy,
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-[var(--line)] p-3">
      {/* Largura pelo conteúdo, não pela linha: um campo de mês esticado à
          largura do modal viraria um alvo enorme para 7 caracteres. */}
      <div className={fieldClassName}>{children}</div>
      <Button
        variant="primary"
        className="px-3 py-2 text-xs"
        onClick={onSubmit}
        disabled={isDisabled || isBusy}
        isLoading={isBusy}
        loadingLabel="Salvando..."
      >
        {actionLabel}
      </Button>
    </div>
  );
}

export function StartDateFix({
  actionLabel = "Definir início",
  initialValue = "",
  isBusy = false,
  label = "Início das doações",
  onSubmit,
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <FixShell
      actionLabel={actionLabel}
      isBusy={isBusy}
      isDisabled={!value}
      onSubmit={() => onSubmit(value)}
    >
      <MonthInput
        label={label}
        name="donationStartDate"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
    </FixShell>
  );
}

export function DemandFix({ demands = [], isBusy = false, onSubmit }) {
  const [value, setValue] = useState("");

  return (
    <FixShell
      actionLabel="Vincular demanda"
      fieldClassName="w-full sm:w-72"
      isBusy={isBusy}
      isDisabled={!value}
      onSubmit={() => onSubmit(value)}
    >
      <SelectInput
        label="Demanda"
        name="demand"
        onChange={(event) => setValue(event.target.value)}
        options={demands.map((demand) => ({
          value: demand,
          label: demand,
        }))}
        placeholder="Selecione uma demanda"
        searchable
        value={value}
      />
    </FixShell>
  );
}
