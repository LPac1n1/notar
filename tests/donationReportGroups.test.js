import test from "node:test";
import assert from "node:assert/strict";
import { mapDemandGroups } from "../src/features/reports/utils/donationReportGroups.js";

const DEMANDS = [{ name: "Demanda A", color: "#39C6F4" }];

function buildSummary(overrides = {}) {
  return {
    donorId: "donor-1",
    donorName: "Maria Silva",
    cpf: "11111111111",
    demand: "Demanda A",
    donorType: "holder",
    holderName: "",
    donationStartDate: "2025-01-01",
    notesCount: 0,
    monthNotesCount: 0,
    hasAdjustment: false,
    adjustment: null,
    adjustmentSubsumesMonth: false,
    ...overrides,
  };
}

test("demand report groups do not double-count monthly rows covered by a subsuming accumulated adjustment", () => {
  const plainMonthlyRow = buildSummary({
    notesCount: 232,
    monthNotesCount: 232,
  });
  const accumulatedRow = buildSummary({
    notesCount: 259,
    monthNotesCount: 0,
    hasAdjustment: true,
    adjustmentSubsumesMonth: true,
    adjustment: {
      id: "adj-1",
      notesCount: 259,
      description: "Acumulado de Janeiro de 2026 a Fevereiro de 2026",
      rangeStartMonth: "2026-01-01",
      rangeEndMonth: "2026-02-01",
    },
  });

  for (const summaries of [
    [plainMonthlyRow, accumulatedRow],
    [accumulatedRow, plainMonthlyRow],
  ]) {
    const [group] = mapDemandGroups({ demands: DEMANDS, summaries });
    const [holder] = group.holders;

    assert.equal(holder.notesCount, 259);
    assert.equal(holder.monthNotesCount, 0);
    assert.equal(holder.adjustmentNotesCount, 259);
    assert.equal(holder.adjustmentSubsumesMonth, true);
  }
});

test("demand report groups keep additive accumulated adjustments on top of monthly rows", () => {
  const extraMonthlyRow = buildSummary({
    notesCount: 7,
    monthNotesCount: 7,
  });
  const additiveAccumulatedRow = buildSummary({
    notesCount: 35,
    monthNotesCount: 10,
    hasAdjustment: true,
    adjustmentSubsumesMonth: false,
    adjustment: {
      id: "adj-2",
      notesCount: 25,
      description: "Acumulado de Janeiro de 2026",
      rangeStartMonth: "2026-01-01",
      rangeEndMonth: "2026-01-01",
    },
  });

  const [group] = mapDemandGroups({
    demands: DEMANDS,
    summaries: [extraMonthlyRow, additiveAccumulatedRow],
  });
  const [holder] = group.holders;

  assert.equal(holder.notesCount, 42);
  assert.equal(holder.monthNotesCount, 17);
  assert.equal(holder.adjustmentNotesCount, 25);
  assert.equal(holder.adjustmentSubsumesMonth, false);
});

test("o valor abatido acompanha a contagem de notas linha a linha", () => {
  // A coluna de dinheiro e a de doações descrevem a MESMA linha do relatório.
  // Se uma somasse e a outra não, o leitor veria "42 doações — R$ 35,00" com
  // um valor por nota que não existe em lugar nenhum.
  const primeiraLinha = buildSummary({
    notesCount: 7,
    monthNotesCount: 7,
    abatementAmount: 3.5,
  });
  const segundaLinha = buildSummary({
    notesCount: 35,
    monthNotesCount: 35,
    abatementAmount: 17.5,
  });

  const [group] = mapDemandGroups({
    demands: DEMANDS,
    summaries: [primeiraLinha, segundaLinha],
  });
  const [holder] = group.holders;

  assert.equal(holder.notesCount, 42);
  assert.equal(holder.abatementAmount, 21);
});

test("acumulado que absorve o mês substitui o valor, não soma duas vezes", () => {
  // Mesmo cuidado da contagem: quando o acumulado cobre o mês, a linha do mês
  // já está contida nele. Somar os dois valores cobraria o período duas vezes.
  const linhaDoMes = buildSummary({
    notesCount: 232,
    monthNotesCount: 232,
    abatementAmount: 116,
  });
  const linhaAcumulada = buildSummary({
    notesCount: 259,
    monthNotesCount: 0,
    abatementAmount: 129.5,
    hasAdjustment: true,
    adjustmentSubsumesMonth: true,
    adjustment: {
      id: "adj-1",
      notesCount: 259,
      description: "Acumulado",
      rangeStartMonth: "2026-01-01",
      rangeEndMonth: "2026-02-01",
    },
  });

  for (const summaries of [
    [linhaDoMes, linhaAcumulada],
    [linhaAcumulada, linhaDoMes],
  ]) {
    const [group] = mapDemandGroups({ demands: DEMANDS, summaries });
    const [holder] = group.holders;
    assert.equal(holder.notesCount, 259);
    assert.equal(holder.abatementAmount, 129.5);
  }
});
