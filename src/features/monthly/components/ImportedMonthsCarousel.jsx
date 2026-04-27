import { useRef } from "react";
import Button from "../../../components/ui/Button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "../../../components/ui/icons";
import { formatDatePtBR, formatMonthYear } from "../../../utils/date";
import { formatCurrency } from "../../../utils/format";

export default function ImportedMonthsCarousel({
  imports,
  selectedReferenceMonth,
  onSelectMonth,
}) {
  const railRef = useRef(null);

  const scrollByPage = (direction) => {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.75, 280),
      behavior: "smooth",
    });
  };

  return (
    <div className="mb-5 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">
            Meses importados
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {imports.length} mês(es) com planilha processada
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="subtle"
            className="h-10 w-10 px-0"
            onClick={() => scrollByPage(-1)}
            aria-label="Ver meses anteriores"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="subtle"
            className="h-10 w-10 px-0"
            onClick={() => scrollByPage(1)}
            aria-label="Ver próximos meses"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={railRef}
        className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {imports.map((item) => {
          const referenceMonth = item.referenceMonth.slice(0, 7);
          const isSelected = referenceMonth === selectedReferenceMonth;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectMonth(isSelected ? "" : referenceMonth)}
              className={`min-w-[250px] rounded-md border p-4 text-left transition ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--surface-elevated)]"
                  : "border-[var(--line)] bg-[var(--surface-strong)] hover:border-[var(--line-strong)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-main)]">
                    {formatMonthYear(item.referenceMonth)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {item.matchedDonors} doador(es) que doaram
                  </p>
                </div>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    isSelected
                      ? "bg-[color:var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[color:var(--surface-muted)] text-[var(--text-soft)]"
                  }`}
                >
                  {isSelected ? "Fechar" : "Ver"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                <p>
                  Valor por nota:{" "}
                  <span className="font-medium">
                    {formatCurrency(item.valuePerNote)}
                  </span>
                </p>
                <p>
                  Importado em{" "}
                  <span className="font-medium">
                    {formatDatePtBR(item.importedAt)}
                  </span>
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
