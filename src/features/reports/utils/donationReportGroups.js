import {
  DEFAULT_DEMAND_COLOR,
  normalizeDemandColor,
} from "../../../utils/demandColor.js";

function normalizeDemandKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function addPersonToDemandGroup(group, summary) {
  const target =
    summary.donorType === "auxiliary" ? group.auxiliaries : group.holders;
  const currentPerson = target.get(summary.donorId) ?? {
    id: summary.donorId,
    name: summary.donorName,
    cpf: summary.cpf,
    holderName: summary.holderName ?? "",
    donationStartDate: summary.donationStartDate ?? "",
    notesCount: 0,
    monthNotesCount: 0,
    // Acompanha `notesCount` passo a passo: o valor abatido é a contagem de
    // notas vezes o valor por nota do mês, então somar um sem somar o outro
    // faria a coluna de dinheiro contradizer a de doações na mesma linha.
    abatementAmount: 0,
    adjustmentNotesCount: 0,
    adjustmentDescription: "",
    adjustmentRangeStartMonth: "",
    adjustmentRangeEndMonth: "",
    adjustmentSubsumesMonth: false,
  };

  if (summary.hasAdjustment && summary.adjustment) {
    const adjustmentNotes = Number(summary.adjustment.notesCount ?? 0);

    if (summary.adjustmentSubsumesMonth) {
      currentPerson.notesCount = adjustmentNotes;
      currentPerson.monthNotesCount = 0;
      currentPerson.abatementAmount = Number(summary.abatementAmount ?? 0);
      currentPerson.adjustmentNotesCount = adjustmentNotes;
      currentPerson.adjustmentSubsumesMonth = true;
    } else if (!currentPerson.adjustmentSubsumesMonth) {
      currentPerson.notesCount += Number(summary.notesCount ?? 0);
      currentPerson.monthNotesCount += Number(summary.monthNotesCount ?? 0);
      currentPerson.abatementAmount += Number(summary.abatementAmount ?? 0);
      currentPerson.adjustmentNotesCount += adjustmentNotes;
    }

    if (!currentPerson.adjustmentDescription) {
      currentPerson.adjustmentDescription = summary.adjustment.description ?? "";
    }
    if (!currentPerson.adjustmentRangeStartMonth) {
      currentPerson.adjustmentRangeStartMonth =
        summary.adjustment.rangeStartMonth ?? "";
    }
    if (!currentPerson.adjustmentRangeEndMonth) {
      currentPerson.adjustmentRangeEndMonth =
        summary.adjustment.rangeEndMonth ?? "";
    }
  } else if (!currentPerson.adjustmentSubsumesMonth) {
    const notesCount = Number(summary.notesCount ?? 0);
    currentPerson.notesCount += notesCount;
    currentPerson.monthNotesCount += notesCount;
    currentPerson.abatementAmount += Number(summary.abatementAmount ?? 0);
  }

  target.set(summary.donorId, currentPerson);
}

export function mapDemandGroups({ demands, summaries }) {
  const demandByName = new Map(
    demands.map((demand) => [
      normalizeDemandKey(demand.name),
      {
        name: demand.name,
        color: normalizeDemandColor(demand.color),
      },
    ]),
  );
  const groupsByDemand = new Map();

  for (const summary of summaries) {
    const demandName = summary.demand || "Sem demanda";
    const demandKey = normalizeDemandKey(demandName);
    const demand = demandByName.get(demandKey) ?? {
      name: demandName,
      color: DEFAULT_DEMAND_COLOR,
    };

    if (!groupsByDemand.has(demandKey)) {
      groupsByDemand.set(demandKey, {
        name: demand.name,
        color: demand.color,
        holders: new Map(),
        auxiliaries: new Map(),
      });
    }

    addPersonToDemandGroup(groupsByDemand.get(demandKey), summary);
  }

  return Array.from(groupsByDemand.values())
    .map((group) => ({
      ...group,
      holders: Array.from(group.holders.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
      auxiliaries: Array.from(group.auxiliaries.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
