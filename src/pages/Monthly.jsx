import { useConfigStore } from "../store/useConfigStore";
import { calculateValue } from "../services/calculationService";
import { nanoid } from "nanoid";

export default function Monthly() {
  const rules = useConfigStore((s) => s.rules);
  const addRule = useConfigStore((s) => s.addRule);
  const getValuePerNote = useConfigStore((s) => s.getValuePerNote);

  const example = {
    notes: 100,
    date: "2026-03-01",
  };

  const value = calculateValue(example.notes, getValuePerNote(example.date));

  return (
    <div>
      <h1 className="text-xl font-bold">Gestão Mensal</h1>

      <h2 className="mb-4">Quantidade de Regras de Cálculo: {rules.length}</h2>

      <p>Notas: {example.notes}</p>
      <p>Valor calculado: R$ {value}</p>

      <div className="flex gap-2">
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() =>
            addRule({
              id: nanoid(),
              startDate: "2026-01-01",
              valuePerNote: 0.5,
            })
          }
        >
          Adicionar Regra Exemplo
        </button>

        <button
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded"
          onClick={() => useConfigStore.getState().removeRule(rules[0]?.id)}
        >
          Remover Regra Exemplo
        </button>
      </div>
    </div>
  );
}
