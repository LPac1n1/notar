import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import Modal from "../../../components/ui/Modal";
import MonthInput from "../../../components/ui/MonthInput";
import { MonthlyIcon } from "../../../components/ui/icons";
import {
  createAbatementAdjustment,
  listAdjustmentsForDonor,
  previewCatchUpRange,
} from "../../../services/abatementAdjustmentService";
import { logError } from "../../../services/logger";
import { buildAbatementAdjustmentDescription } from "../../../utils/abatementAdjustmentDescription";
import { formatMonthYear } from "../../../utils/date";
import { getErrorMessage } from "../../../utils/error";
import { formatCurrency, formatInteger } from "../../../utils/format";

function toMonthYearMonthInput(monthIso) {
  if (!monthIso || !/^\d{4}-\d{2}/.test(monthIso)) {
    return "";
  }
  return monthIso.slice(0, 7);
}

/**
 * Modal that creates a catch-up abatement adjustment for a donor.
 *
 * Workflow:
 *   1. User picks the target reference month (defaults to the current month).
 *   2. User confirms the accumulation range (defaults to donor's start month
 *      through the month before the target).
 *   3. Modal previews the totals from existing import data.
 *   4. User confirms — adjustment is created and merged into the monthly view.
 */
export default function CatchUpAdjustmentModal({
  donor,
  onClose,
  onConfirmed,
}) {
  const donationStart = donor?.donationStartDateValue ?? "";
  const todayMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [referenceMonth, setReferenceMonth] = useState(todayMonth);
  const [rangeStartMonth, setRangeStartMonth] = useState(donationStart || "");
  const [rangeEndMonth, setRangeEndMonth] = useState(() => {
    if (!todayMonth) return "";
    const [year, month] = todayMonth.split("-").map(Number);
    const previous = new Date(year, month - 2, 1);
    return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
  });
  const [existingAdjustments, setExistingAdjustments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fieldsValid = Boolean(
    referenceMonth && rangeStartMonth && rangeEndMonth,
  );
  const rangeOrderValid =
    fieldsValid && rangeStartMonth <= rangeEndMonth;
  const rangeWithinReference =
    fieldsValid && rangeEndMonth <= referenceMonth;
  const allValid = rangeOrderValid && rangeWithinReference;
  const automaticDescription = useMemo(
    () =>
      buildAbatementAdjustmentDescription({
        referenceMonth,
        rangeStartMonth,
        rangeEndMonth,
        notesCount: preview?.totalNotes,
        abatementAmount: preview?.totalAmount,
      }),
    [
      referenceMonth,
      rangeStartMonth,
      rangeEndMonth,
      preview?.totalAmount,
      preview?.totalNotes,
    ],
  );

  useEffect(() => {
    if (!donor?.id) return;
    listAdjustmentsForDonor(donor.id)
      .then(setExistingAdjustments)
      .catch(() => {});
  }, [donor?.id]);

  // Detect conflicts with existing adjustments:
  //   1. Duplicate: another adjustment already uses the same referenceMonth.
  //   2. Overlap: the selected range intersects an existing adjustment's range.
  const conflictWarning = useMemo(() => {
    if (!referenceMonth || !rangeStartMonth || !rangeEndMonth) return "";

    const duplicate = existingAdjustments.find(
      (adj) => adj.referenceMonth.slice(0, 7) === referenceMonth,
    );
    if (duplicate) {
      return `Já existe um acumulado lançado em ${formatMonthYear(`${referenceMonth}-01`)}. Escolha um mês diferente.`;
    }

    const newStart = `${rangeStartMonth}-01`;
    const newEnd = `${rangeEndMonth}-01`;
    const overlap = existingAdjustments.find(
      (adj) =>
        adj.rangeStartMonth <= newEnd && adj.rangeEndMonth >= newStart,
    );
    if (overlap) {
      return `O período selecionado já está coberto pelo acumulado de ${formatMonthYear(overlap.referenceMonth)}. Ajuste o intervalo.`;
    }

    return "";
  }, [referenceMonth, rangeStartMonth, rangeEndMonth, existingAdjustments]);

  // Recompute the preview whenever the user adjusts the range.
  useEffect(() => {
    if (!donor?.id || !allValid) {
      setPreview(null);
      setPreviewError("");
      return undefined;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    setPreviewError("");

    previewCatchUpRange({
      donorId: donor.id,
      rangeStartMonth,
      rangeEndMonth,
    })
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
      })
      .catch((err) => {
        if (cancelled) return;
        logError("CatchUpAdjustmentModal.preview", err);
        setPreviewError(
          getErrorMessage(err, "Não foi possível calcular o acumulado."),
        );
        setPreview(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [donor?.id, rangeStartMonth, rangeEndMonth, allValid]);

  const validationMessage = useMemo(() => {
    if (!referenceMonth) {
      return "Selecione o mês onde o acumulado será lançado.";
    }
    if (!rangeStartMonth || !rangeEndMonth) {
      return "Defina o período acumulado (início e fim).";
    }
    if (!rangeOrderValid) {
      return "O mês final precisa ser igual ou posterior ao inicial.";
    }
    if (!rangeWithinReference) {
      return "O período acumulado não pode ultrapassar o mês de lançamento.";
    }
    if (donationStart && rangeStartMonth < donationStart) {
      return `O início das doações deste doador é ${formatMonthYear(`${donationStart}-01`)}. O período acumulado pode iniciar a partir desse mês.`;
    }
    return "";
  }, [
    referenceMonth,
    rangeStartMonth,
    rangeEndMonth,
    rangeOrderValid,
    rangeWithinReference,
    donationStart,
  ]);

  const handleConfirm = async () => {
    if (!fieldsValid || !allValid) {
      setSubmitError(validationMessage || "Preencha os campos corretamente.");
      return;
    }

    if (!preview || (preview.totalNotes === 0 && preview.totalAmount === 0)) {
      setSubmitError(
        "O período selecionado não possui notas registradas para este doador.",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError("");
      await createAbatementAdjustment({
        donorId: donor.id,
        donorName: donor.name,
        referenceMonth,
        rangeStartMonth,
        rangeEndMonth,
        notesCount: preview.totalNotes,
        abatementAmount: preview.totalAmount,
        description: automaticDescription,
      });
      onConfirmed?.();
    } catch (err) {
      logError("CatchUpAdjustmentModal.create", err);
      setSubmitError(
        getErrorMessage(err, "Não foi possível registrar o acumulado."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title="Lançar acumulado"
      description="Registre meses anteriores em um único lançamento no mês alvo."
      icon={<MonthlyIcon className="h-5 w-5" />}
      onClose={isSubmitting ? undefined : onClose}
      size="md"
    >
      <div className="mb-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">Doador</p>
        <p className="font-semibold text-[var(--text-main)]">{donor.name}</p>
        {donationStart ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Início das doações: {formatMonthYear(`${donationStart}-01`)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <MonthInput
          label="Lançar acumulado em"
          description="Mês onde o valor consolidado vai aparecer na gestão mensal e no relatório."
          value={referenceMonth}
          onChange={(event) =>
            setReferenceMonth(toMonthYearMonthInput(event.target.value))
          }
        />

        <div className="grid gap-3 md:grid-cols-2">
          <MonthInput
            label="Acumular a partir de"
            value={rangeStartMonth}
            onChange={(event) =>
              setRangeStartMonth(toMonthYearMonthInput(event.target.value))
            }
          />
          <MonthInput
            label="Até o mês de"
            value={rangeEndMonth}
            onChange={(event) =>
              setRangeEndMonth(toMonthYearMonthInput(event.target.value))
            }
          />
        </div>

        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Descrição automática
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-main)]">
            {automaticDescription ||
              "Defina o período para gerar a descrição automaticamente."}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Atualizada conforme o mês de lançamento, o período e a prévia
            calculada.
          </p>
        </div>
      </div>

      {validationMessage ? (
        <p className="mt-4 text-xs text-[var(--warning)]">{validationMessage}</p>
      ) : conflictWarning ? (
        <p className="mt-4 text-xs text-[var(--danger)]">{conflictWarning}</p>
      ) : null}

      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3">
        <p className="text-sm font-medium text-[var(--muted)]">
          Prévia do acumulado
        </p>

        {!allValid ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Defina os três meses para visualizar a prévia.
          </p>
        ) : isPreviewLoading ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Calculando...</p>
        ) : previewError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{previewError}</p>
        ) : preview ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[var(--text-soft)]">
              <span>
                <span className="font-semibold text-[var(--text-main)]">
                  {formatInteger(preview.totalNotes)}
                </span>{" "}
                {preview.totalNotes === 1 ? "nota" : "notas"}
              </span>
              <span>
                Valor total:{" "}
                <span className="font-semibold text-[var(--text-main)]">
                  {formatCurrency(preview.totalAmount)}
                </span>
              </span>
              <span>
                <span className="font-semibold text-[var(--text-main)]">
                  {formatInteger(preview.monthCount)}
                </span>{" "}
                {preview.monthCount === 1 ? "mês com doação" : "meses com doações"}
              </span>
            </div>

            {preview.breakdown.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {preview.breakdown.map((item) => (
                  <span
                    key={item.referenceMonth}
                    className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--text-soft)]"
                  >
                    {item.monthLabel}{" "}
                    <span className="ml-1 font-semibold text-[var(--text-main)]">
                      {formatInteger(item.notesCount)}
                    </span>{" "}
                    · {formatCurrency(item.abatementAmount)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Nenhuma doação encontrada nesse intervalo para este doador.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <FeedbackMessage message={submitError} tone="error" />

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={
            !allValid ||
            Boolean(conflictWarning) ||
            isSubmitting ||
            !preview ||
            preview.totalNotes === 0
          }
          isLoading={isSubmitting}
          loadingLabel="Salvando..."
        >
          Lançar acumulado
        </Button>
      </div>
    </Modal>
  );
}
