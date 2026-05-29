import { query } from "./db";
import { startOfMonth } from "../utils/date";
import { countDonorReconciliationIssues } from "./reconciliation/creditReconciliationService";

/**
 * Builds the prioritized "needs your attention now" list for the Dashboard's
 * action zone. Each item is *actionable* — the consumer renders it as a
 * single card with a primary CTA.
 *
 * Items returned are sorted by severity (danger → warning → info) and then
 * by recency (current-month items first). The Dashboard renders all of
 * them; an empty list means the system is in a healthy state and the zone
 * collapses entirely.
 *
 * Severity vs tone mapping:
 *   - `danger`  — reconciliation excess, errors. Red.
 *   - `warning` — flow incomplete (missing planilha, pending abatements). Yellow.
 *   - `info`    — registry hygiene (donor missing demand). Neutral.
 *
 * Each item shape:
 *   {
 *     id: string,
 *     severity: 'danger' | 'warning' | 'info',
 *     title: string,
 *     description: string,
 *     primaryAction: { label, kind, payload },
 *     secondaryAction?: { label, kind, payload },
 *   }
 *
 * `kind` is a discriminated union the Dashboard converts to navigate()
 * calls — keeps the service free of React/router concerns.
 */
export async function getDashboardAttention() {
  const currentMonth = startOfMonth(new Date().toISOString());

  // Phase 1: independent probes that don't depend on each other.
  const [
    reconciliationIssueCount,
    currentMonthDonationRows,
    currentMonthCreditRows,
    currentMonthPendingRows,
    errorImportRows,
    inconsistencyRows,
  ] = await Promise.all([
    countDonorReconciliationIssues().catch(() => 0),
    query(`
      SELECT
        id,
        strftime(reference_month, '%Y-%m-01') AS reference_month
      FROM imports
      WHERE reference_month = DATE '${currentMonth}'
        AND status = 'processed'
      LIMIT 1
    `).catch(() => []),
    query(`
      SELECT id
      FROM credit_imports
      WHERE reference_month = DATE '${currentMonth}'
        AND status = 'processed'
      LIMIT 1
    `).catch(() => []),
    query(`
      SELECT count(*) AS pending_count
      FROM monthly_donor_summary
      WHERE reference_month = DATE '${currentMonth}'
        AND abatement_status = 'pending'
    `).catch(() => [{ pending_count: 0 }]),
    query(`
      SELECT
        id,
        file_name,
        strftime(reference_month, '%Y-%m-01') AS reference_month
      FROM imports
      WHERE status = 'error'
      ORDER BY imported_at DESC
      LIMIT 5
    `).catch(() => []),
    query(`
      SELECT
        (SELECT count(*) FROM donors
          WHERE is_active = TRUE
            AND coalesce(trim(demand), '') = '') AS donor_without_demand,
        (SELECT count(*) FROM donor_cpf_links
          INNER JOIN donors ON donors.id = donor_cpf_links.donor_id
          WHERE donor_cpf_links.is_active = TRUE
            AND donors.is_active = TRUE
            AND donor_cpf_links.donation_start_date IS NULL) AS donor_without_start_date
    `).catch(() => [{ donor_without_demand: 0, donor_without_start_date: 0 }]),
  ]);

  const items = [];

  // 1. Abatimento excedido — most urgent, indicates a real over-marking
  //    that needs human attention.
  if (reconciliationIssueCount > 0) {
    items.push({
      id: "reconciliation-exceeded",
      severity: "danger",
      title: `${reconciliationIssueCount} doador(es) com abatimento excedido`,
      description:
        "O valor marcado como abatido é maior que o crédito real gerado na NFP. Revise os doadores afetados.",
      primaryAction: {
        label: "Ver doadores",
        kind: "navigate",
        payload: "/doadores",
      },
    });
  }

  // 2. Errored imports — surfaced separately because they BLOCK the rest
  //    of the flow until resolved.
  if (errorImportRows.length > 0) {
    items.push({
      id: "import-errors",
      severity: "danger",
      title: `${errorImportRows.length} importação(ões) com erro`,
      description:
        "Importações marcadas como 'erro' não geram conciliação. Verifique e reimporte se necessário.",
      primaryAction: {
        label: "Ver importações",
        kind: "navigate",
        payload: "/importacoes",
      },
    });
  }

  // 3. Current month — donations planilha missing.
  const hasCurrentDonationImport = currentMonthDonationRows.length > 0;
  if (!hasCurrentDonationImport) {
    items.push({
      id: "current-month-donations-missing",
      severity: "warning",
      title: "Planilha de doações deste mês ainda não importada",
      description:
        "Sem a planilha de doações do mês atual, não dá pra calcular abatimentos nem conciliar com créditos.",
      primaryAction: {
        label: "Importar planilha",
        kind: "navigate",
        payload: "/importacoes",
      },
    });
  }

  // 4. Current month — credits planilha missing (only relevant when
  //    donations are already in).
  const hasCurrentCreditImport = currentMonthCreditRows.length > 0;
  if (hasCurrentDonationImport && !hasCurrentCreditImport) {
    items.push({
      id: "current-month-credits-missing",
      severity: "warning",
      title: "Planilha de créditos deste mês ainda não importada",
      description:
        "Sem ela, a conciliação fica com 100% de doações sem crédito correspondente.",
      primaryAction: {
        label: "Importar planilha",
        kind: "navigate",
        payload: "/importacoes",
      },
    });
  }

  // 5. Current month — pending abatements (only relevant when donations
  //    are in and there ARE pending rows).
  const pendingCount = Number(currentMonthPendingRows[0]?.pending_count ?? 0);
  if (hasCurrentDonationImport && pendingCount > 0) {
    items.push({
      id: "current-month-pending",
      severity: "warning",
      title: `${pendingCount} abatimento(s) pendente(s) neste mês`,
      description:
        "Doadores com nota válida deste mês ainda não têm o abatimento marcado.",
      primaryAction: {
        label: "Ir para Gestão Mensal",
        kind: "navigate",
        payload: "/mensal",
      },
    });
  }

  // 6. Registry hygiene — surfaced together so the zone isn't flooded
  //    with individual rows. Combined count keeps it as one card.
  const hygieneRow = inconsistencyRows[0] ?? {};
  const donorWithoutDemand = Number(hygieneRow.donor_without_demand ?? 0);
  const donorWithoutStartDate = Number(hygieneRow.donor_without_start_date ?? 0);
  const hygieneTotal = donorWithoutDemand + donorWithoutStartDate;
  if (hygieneTotal > 0) {
    const parts = [];
    if (donorWithoutDemand > 0) {
      parts.push(`${donorWithoutDemand} sem demanda`);
    }
    if (donorWithoutStartDate > 0) {
      parts.push(`${donorWithoutStartDate} sem início de doação`);
    }
    items.push({
      id: "registry-hygiene",
      severity: "info",
      title: `Cadastros incompletos: ${parts.join(", ")}`,
      description:
        "Doadores nessas condições não casam corretamente com importações futuras.",
      primaryAction: {
        label: "Revisar cadastros",
        kind: "navigate",
        payload: "/doadores",
      },
    });
  }

  return {
    items,
    currentMonth,
    flow: {
      hasDonationImport: hasCurrentDonationImport,
      hasCreditImport: hasCurrentCreditImport,
      pendingAbatements: pendingCount,
    },
  };
}

/**
 * Lighter sibling — used by the "Workflow Inicial do Mês" checklist on the
 * Dashboard. Returns a list of 4 steps that compose a normal month and the
 * current completion state of each.
 *
 * The checklist is rendered only when at least one step is incomplete —
 * fully reconciled months are silent.
 */
export async function getCurrentMonthFlow() {
  const attention = await getDashboardAttention();
  const steps = [
    {
      id: "import-donations",
      label: "Importar planilha de doações",
      done: attention.flow.hasDonationImport,
      cta: { label: "Importar agora", to: "/importacoes" },
    },
    {
      id: "import-credits",
      label: "Importar planilha de créditos",
      done: attention.flow.hasCreditImport,
      cta: { label: "Importar agora", to: "/importacoes" },
      // Importing credits before donations creates 100% credit_only —
      // surface the blocker instead of letting the user shoot their foot.
      blockedBy: attention.flow.hasDonationImport
        ? null
        : "import-donations",
    },
    {
      id: "review-reconciliation",
      label: "Conferir conciliação",
      done:
        attention.flow.hasDonationImport &&
        attention.flow.hasCreditImport,
      cta: { label: "Ver Visão por mês", to: "/importacoes" },
      blockedBy:
        attention.flow.hasDonationImport && attention.flow.hasCreditImport
          ? null
          : attention.flow.hasDonationImport
          ? "import-credits"
          : "import-donations",
    },
    {
      id: "mark-abatements",
      label: "Marcar abatimentos",
      done:
        attention.flow.hasDonationImport &&
        attention.flow.pendingAbatements === 0,
      cta: { label: "Ir para Gestão Mensal", to: "/mensal" },
      blockedBy: attention.flow.hasDonationImport ? null : "import-donations",
    },
  ];

  return {
    currentMonth: attention.currentMonth,
    steps,
    completeCount: steps.filter((step) => step.done).length,
    totalCount: steps.length,
  };
}
