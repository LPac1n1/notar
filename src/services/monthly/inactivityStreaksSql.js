/**
 * SQL for the "consecutive months without donating" report.
 *
 * Kept in its own module — with zero imports — so the integration test can
 * execute the exact production query against DuckDB-Node. Mirroring the SQL
 * inside the test instead would let the two drift silently.
 *
 * See `inactivityStreaks.js` for the rationale behind the month grid and the
 * per-CPF activity resolution.
 */
export const DONOR_INACTIVITY_STREAKS_SQL = `
  WITH imported_months AS (
    SELECT DISTINCT strftime(reference_month, '%Y-%m-%d') AS reference_month
    FROM imports
    WHERE status = 'processed'
      AND reference_month IS NOT NULL
  ),
  ranked_months AS (
    SELECT
      reference_month,
      row_number() OVER (ORDER BY reference_month DESC) AS rn
    FROM imported_months
  ),
  donor_month_grid AS (
    SELECT
      donors.id AS donor_id,
      ranked_months.reference_month,
      ranked_months.rn,
      CASE WHEN EXISTS (
        SELECT 1
        FROM import_cpf_summary
        INNER JOIN donor_cpf_links
          ON donor_cpf_links.id = import_cpf_summary.matched_source_id
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.is_active = TRUE
          AND strftime(import_cpf_summary.reference_month, '%Y-%m-%d')
              = ranked_months.reference_month
          AND import_cpf_summary.notes_count > 0
      ) THEN 1 ELSE 0 END AS donated
    FROM donors
    CROSS JOIN ranked_months
    WHERE donors.is_active = TRUE
      AND (
        donors.donation_start_date IS NULL
        OR strftime(donors.donation_start_date, '%Y-%m-%d')
           <= ranked_months.reference_month
      )
  )
  SELECT
    donors.id AS donor_id,
    donors.name AS donor_name,
    donors.cpf,
    donors.demand,
    donors.donor_type,
    count(*) AS eligible_months,
    -- rn = 1 is the most recent imported month, so the rn of the donor's
    -- latest donating month minus one IS the streak. Never donated at all
    -- (min is NULL) means every eligible month counts.
    coalesce(
      min(CASE WHEN donor_month_grid.donated = 1 THEN donor_month_grid.rn END) - 1,
      count(*)
    ) AS months_without_donating,
    max(
      CASE WHEN donor_month_grid.donated = 1
        THEN donor_month_grid.reference_month
      END
    ) AS last_donation_month
  FROM donor_month_grid
  INNER JOIN donors
    ON donors.id = donor_month_grid.donor_id
  GROUP BY donors.id, donors.name, donors.cpf, donors.demand, donors.donor_type
  ORDER BY months_without_donating DESC, donors.name ASC
`;
