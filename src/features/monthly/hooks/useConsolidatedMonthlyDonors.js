import { useMemo } from "react";

export function useConsolidatedMonthlyDonors({
  abatementStatus = "all",
  summaries = [],
} = {}) {
  const donationSummaries = useMemo(
    () => summaries.filter((summary) => summary.hasDonationsInMonth),
    [summaries],
  );

  // Subsumed rows belong to a catch-up in a different reference month — exclude
  // them from amount totals to avoid double-counting.
  const activeDonationSummaries = useMemo(
    () => donationSummaries.filter((summary) => !summary.isSubsumed),
    [donationSummaries],
  );

  const totalAbatement = useMemo(
    () =>
      activeDonationSummaries.reduce(
        (accumulator, item) => accumulator + Number(item.abatementAmount ?? 0),
        0,
      ),
    [activeDonationSummaries],
  );

  const pendingSummaries = useMemo(
    () =>
      activeDonationSummaries.filter(
        (summary) => summary.abatementStatus !== "applied",
      ),
    [activeDonationSummaries],
  );

  const totalPendingAbatement = useMemo(
    () =>
      pendingSummaries.reduce(
        (accumulator, item) => accumulator + Number(item.abatementAmount ?? 0),
        0,
      ),
    [pendingSummaries],
  );

  const totalAppliedAbatement = useMemo(
    () =>
      activeDonationSummaries.reduce(
        (accumulator, item) =>
          item.abatementStatus === "applied"
            ? accumulator + Number(item.abatementAmount ?? 0)
            : accumulator,
        0,
      ),
    [activeDonationSummaries],
  );

  const consolidatedDonors = useMemo(() => {
    const donorsById = new Map();

    // Include ALL donation months (including subsumed) in the months display,
    // but skip subsumed amounts when accumulating per-donor totals.
    for (const summary of donationSummaries) {
      const current = donorsById.get(summary.donorId) ?? {
        donorId: summary.donorId,
        donorName: summary.donorName,
        donorType: summary.donorType,
        holderName: summary.holderName,
        holderIsActiveDonor: summary.holderIsActiveDonor,
        cpf: summary.cpf,
        demand: summary.demand,
        donationStartDate: summary.donationStartDate ?? "",
        months: [],
        totalPending: 0,
        totalApplied: 0,
        invalidNotesCount: 0,
      };

      current.months.push({
        id: summary.id,
        referenceMonth: summary.referenceMonth,
        abatementAmount: summary.abatementAmount,
        abatementStatus: summary.abatementStatus,
        adjustmentId: summary.adjustment?.id ?? "",
        isSubsumed: summary.isSubsumed ?? false,
        subsumedByReferenceMonth: summary.subsumedByReferenceMonth ?? "",
      });
      current.invalidNotesCount += Number(summary.invalidNotesCount ?? 0);
      if (!summary.isSubsumed) {
        if (summary.abatementStatus === "applied") {
          current.totalApplied += Number(summary.abatementAmount ?? 0);
        } else {
          current.totalPending += Number(summary.abatementAmount ?? 0);
        }
      }
      donorsById.set(summary.donorId, current);
    }

    return Array.from(donorsById.values())
      .map((donor) => ({
        ...donor,
        months: donor.months.sort((left, right) =>
          left.referenceMonth.localeCompare(right.referenceMonth),
        ),
      }))
      .sort(
        (left, right) =>
          right.totalPending - left.totalPending ||
          right.totalApplied - left.totalApplied ||
          left.donorName.localeCompare(right.donorName, "pt-BR"),
      );
  }, [donationSummaries]);

  const filteredConsolidatedDonors = useMemo(() => {
    if (abatementStatus === "pending") {
      return consolidatedDonors.filter((donor) => donor.totalPending > 0);
    }

    if (abatementStatus === "applied") {
      return consolidatedDonors.filter((donor) => donor.totalPending === 0);
    }

    return consolidatedDonors;
  }, [abatementStatus, consolidatedDonors]);

  return {
    consolidatedDonors,
    donationSummaries,
    donatedCount: donationSummaries.length,
    filteredConsolidatedDonors,
    notDonatedCount: summaries.length - donationSummaries.length,
    pendingSummaries,
    totalAbatement,
    totalAppliedAbatement,
    totalPendingAbatement,
  };
}
