import { DEFAULT_DEMAND_COLOR } from "../../utils/demandColor";
import { normalizeCpfSqlExpression } from "./sql";

export async function runStructuralSetup(conn, { structural = true } = {}) {
  if (structural) {
    await conn.query(`
    CREATE TABLE IF NOT EXISTS demands (
      id TEXT,
      name TEXT,
      color TEXT DEFAULT '${DEFAULT_DEMAND_COLOR}',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT,
      name TEXT,
      cpf TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS donors (
      id TEXT,
      person_id TEXT,
      name TEXT,
      cpf TEXT,
      demand TEXT,
      donor_type TEXT DEFAULT 'holder',
      holder_donor_id TEXT,
      holder_person_id TEXT,
      donation_start_date DATE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS donor_cpf_links (
      id TEXT,
      donor_id TEXT,
      name TEXT,
      cpf TEXT,
      donation_start_date DATE,
      link_type TEXT DEFAULT 'auxiliary',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT,
      reference_month DATE,
      file_name TEXT,
      value_per_note DOUBLE DEFAULT 0,
      total_rows INTEGER DEFAULT 0,
      matched_rows INTEGER DEFAULT 0,
      matched_donors INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS import_cpf_summary (
      id TEXT,
      import_id TEXT,
      reference_month DATE,
      cpf TEXT,
      notes_count INTEGER,
      invalid_notes_count INTEGER DEFAULT 0,
      matched_donor_id TEXT,
      matched_source_id TEXT,
      is_registered_donor BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS monthly_donor_summary (
      id TEXT,
      import_id TEXT,
      donor_id TEXT,
      reference_month DATE,
      cpf TEXT,
      donor_name TEXT,
      demand TEXT,
      notes_count INTEGER,
      invalid_notes_count INTEGER DEFAULT 0,
      value_per_note DOUBLE,
      abatement_amount DOUBLE,
      abatement_status TEXT DEFAULT 'pending',
      abatement_marked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS trash_items (
      id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      label TEXT,
      payload_json TEXT,
      deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT,
      title TEXT,
      content TEXT,
      color TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS action_history (
      id TEXT,
      action_type TEXT,
      entity_type TEXT,
      entity_id TEXT,
      label TEXT,
      description TEXT,
      payload_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS donor_activity_history (
      id TEXT,
      donor_id TEXT,
      event_type TEXT,
      reference_month DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '${DEFAULT_DEMAND_COLOR}'
  `);

    await conn.query(`
    ALTER TABLE demands
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS demand TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS person_id TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS donor_type TEXT DEFAULT 'holder'
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS holder_donor_id TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS holder_person_id TEXT
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS donation_start_date DATE
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS name TEXT
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS donation_start_date DATE
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'auxiliary'
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
  `);

    await conn.query(`
    ALTER TABLE donor_cpf_links
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS matched_rows INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS matched_donors INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS value_per_note DOUBLE DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS notes TEXT
  `);

    await conn.query(`
    ALTER TABLE imports
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

    await conn.query(`
    ALTER TABLE import_cpf_summary
    ADD COLUMN IF NOT EXISTS matched_source_id TEXT
  `);

    await conn.query(`
    ALTER TABLE import_cpf_summary
    ADD COLUMN IF NOT EXISTS invalid_notes_count INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE monthly_donor_summary
    ADD COLUMN IF NOT EXISTS invalid_notes_count INTEGER DEFAULT 0
  `);

    await conn.query(`
    ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS color TEXT
  `);

    await conn.query(`
    ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);
  }

  await conn.query(`
    INSERT INTO demands (id, name, is_active, created_at, updated_at)
    SELECT
      lower(replace(trim(demand), ' ', '-')),
      trim(demand),
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM donors
    WHERE demand IS NOT NULL
      AND trim(demand) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM demands
        WHERE lower(trim(demands.name)) = lower(trim(donors.demand))
      )
    GROUP BY trim(demand)
  `);

  const recordsNeedingCpfNormalizationRows = await conn.query(`
    SELECT
      (
        SELECT count(*)
        FROM donors
        WHERE cpf IS NOT NULL
          AND cpf <> ${normalizeCpfSqlExpression("cpf")}
      ) +
      (
        SELECT count(*)
        FROM donor_cpf_links
        WHERE cpf IS NOT NULL
          AND cpf <> ${normalizeCpfSqlExpression("cpf")}
      ) AS total
  `);
  const shouldRebuildSummariesAfterCpfNormalization =
    Number(recordsNeedingCpfNormalizationRows.toArray()[0]?.total ?? 0) > 0;

  await conn.query(`
    UPDATE demands
    SET
      color = coalesce(nullif(trim(color), ''), '${DEFAULT_DEMAND_COLOR}'),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE people
    SET
      name = upper(trim(name)),
      cpf = ${normalizeCpfSqlExpression("cpf")},
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE donors
    SET
      name = upper(trim(name)),
      cpf = ${normalizeCpfSqlExpression("cpf")},
      donor_type = coalesce(nullif(trim(donor_type), ''), 'holder'),
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    UPDATE donor_cpf_links
    SET
      name = upper(trim(name)),
      cpf = ${normalizeCpfSqlExpression("cpf")},
      link_type = CASE
        WHEN lower(trim(coalesce(link_type, ''))) IN ('holder', 'titular') THEN 'holder'
        WHEN lower(trim(coalesce(link_type, ''))) IN ('auxiliary', 'auxiliar') THEN 'auxiliary'
        ELSE coalesce(nullif(lower(trim(link_type)), ''), 'auxiliary')
      END,
      is_active = coalesce(is_active, TRUE),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  const legacyAuxiliaryLinkRows = await conn.query(`
    SELECT count(*) AS total
    FROM donor_cpf_links
    INNER JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.link_type = 'auxiliary'
      AND donors.donor_type = 'holder'
      AND donor_cpf_links.cpf IS NOT NULL
      AND trim(donor_cpf_links.cpf) <> ''
  `);
  const shouldRebuildSummariesAfterAuxiliaryMigration =
    Number(legacyAuxiliaryLinkRows.toArray()[0]?.total ?? 0) > 0;
  const shouldRebuildMonthlySummaries =
    shouldRebuildSummariesAfterAuxiliaryMigration ||
    shouldRebuildSummariesAfterCpfNormalization;

  await conn.query(`
    INSERT INTO donors (
      id,
      name,
      cpf,
      demand,
      donor_type,
      holder_donor_id,
      donation_start_date,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      donor_cpf_links.id || '-donor',
      upper(trim(donor_cpf_links.name)),
      donor_cpf_links.cpf,
      donors.demand,
      'auxiliary',
      donor_cpf_links.donor_id,
      donor_cpf_links.donation_start_date,
      coalesce(donor_cpf_links.is_active, TRUE),
      coalesce(donor_cpf_links.created_at, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM donor_cpf_links
    INNER JOIN donors
      ON donors.id = donor_cpf_links.donor_id
    WHERE donor_cpf_links.link_type = 'auxiliary'
      AND donors.donor_type = 'holder'
      AND donor_cpf_links.cpf IS NOT NULL
      AND trim(donor_cpf_links.cpf) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM donors AS existing_donors
        WHERE existing_donors.cpf = donor_cpf_links.cpf
      )
  `);

  await conn.query(`
    UPDATE donor_cpf_links
    SET
      donor_id = (
        SELECT migrated_donors.id
        FROM donors AS migrated_donors
        WHERE migrated_donors.cpf = donor_cpf_links.cpf
          AND migrated_donors.id <> donor_cpf_links.donor_id
        ORDER BY
          CASE WHEN migrated_donors.donor_type = 'auxiliary' THEN 0 ELSE 1 END,
          migrated_donors.created_at ASC
        LIMIT 1
      ),
      link_type = 'holder',
      updated_at = CURRENT_TIMESTAMP
    WHERE link_type = 'auxiliary'
      AND EXISTS (
        SELECT 1
        FROM donors AS migrated_donors
        WHERE migrated_donors.cpf = donor_cpf_links.cpf
          AND migrated_donors.id <> donor_cpf_links.donor_id
      )
  `);

  await conn.query(`
    INSERT INTO donor_cpf_links (
      id,
      donor_id,
      name,
      cpf,
      donation_start_date,
      link_type,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      donors.id || '-titular',
      donors.id,
      donors.name,
      donors.cpf,
      donors.donation_start_date,
      'holder',
      coalesce(donors.is_active, TRUE),
      coalesce(donors.created_at, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM donors
    WHERE donors.cpf IS NOT NULL
      AND trim(donors.cpf) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = donors.cpf
      )
      AND NOT EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.donor_id = donors.id
          AND donor_cpf_links.link_type = 'holder'
      )
  `);

  await conn.query(`
    INSERT INTO people (
      id,
      name,
      cpf,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      donors.id || '-person',
      donors.name,
      donors.cpf,
      coalesce(donors.is_active, TRUE),
      coalesce(donors.created_at, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM donors
    WHERE donors.cpf IS NOT NULL
      AND trim(donors.cpf) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM people
        WHERE people.cpf = donors.cpf
      )
  `);

  await conn.query(`
    UPDATE donors
    SET
      person_id = (
        SELECT people.id
        FROM people
        WHERE people.cpf = donors.cpf
        ORDER BY people.created_at ASC, people.id ASC
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE coalesce(trim(person_id), '') = ''
      AND donors.cpf IS NOT NULL
      AND trim(donors.cpf) <> ''
  `);

  await conn.query(`
    UPDATE donors
    SET
      name = coalesce((
        SELECT people.name
        FROM people
        WHERE people.id = donors.person_id
        LIMIT 1
      ), donors.name),
      cpf = coalesce((
        SELECT people.cpf
        FROM people
        WHERE people.id = donors.person_id
        LIMIT 1
      ), donors.cpf),
      updated_at = CURRENT_TIMESTAMP
    WHERE coalesce(trim(person_id), '') <> ''
  `);

  await conn.query(`
    UPDATE donors
    SET
      holder_person_id = (
        SELECT holder_donors.person_id
        FROM donors AS holder_donors
        WHERE holder_donors.id = donors.holder_donor_id
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE donor_type = 'auxiliary'
      AND coalesce(trim(holder_person_id), '') = ''
      AND coalesce(trim(holder_donor_id), '') <> ''
  `);

  await conn.query(`
    UPDATE donors
    SET
      holder_donor_id = (
        SELECT holder_donors.id
        FROM donors AS holder_donors
        WHERE holder_donors.person_id = donors.holder_person_id
          AND holder_donors.donor_type = 'holder'
          AND holder_donors.is_active = TRUE
        ORDER BY holder_donors.created_at ASC, holder_donors.id ASC
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE donor_type = 'auxiliary'
      AND coalesce(trim(holder_person_id), '') <> ''
  `);

  await conn.query(`
    UPDATE imports
    SET
      value_per_note = coalesce((
        SELECT max(monthly_donor_summary.value_per_note)
        FROM monthly_donor_summary
        WHERE monthly_donor_summary.import_id = imports.id
      ), value_per_note, 0),
      updated_at = coalesce(updated_at, CURRENT_TIMESTAMP)
  `);

  await conn.query(`
    INSERT INTO import_cpf_summary (
      id,
      import_id,
      reference_month,
      cpf,
      notes_count,
      is_registered_donor,
      created_at,
      updated_at
    )
    SELECT
      import_items.id,
      import_items.import_id,
      imports.reference_month,
      import_items.cpf,
      import_items.notes_count,
      FALSE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM import_items
    INNER JOIN imports
      ON imports.id = import_items.import_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM import_cpf_summary
      WHERE import_cpf_summary.id = import_items.id
    )
  `).catch(() => null);

  await conn.query(`
    UPDATE import_cpf_summary
    SET
      matched_source_id = (
        SELECT donor_cpf_links.id
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
          AND donor_cpf_links.is_active = TRUE
        LIMIT 1
      ),
      matched_donor_id = (
        SELECT donor_cpf_links.donor_id
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
          AND donor_cpf_links.is_active = TRUE
        LIMIT 1
      ),
      is_registered_donor = EXISTS (
        SELECT 1
        FROM donor_cpf_links
        WHERE donor_cpf_links.cpf = import_cpf_summary.cpf
          AND donor_cpf_links.is_active = TRUE
      ),
      updated_at = CURRENT_TIMESTAMP
  `);

  if (shouldRebuildMonthlySummaries) {
    await conn.query(`
      CREATE TEMP TABLE notar_monthly_status_backup AS
      SELECT
        import_id,
        donor_id,
        abatement_status,
        abatement_marked_at
      FROM monthly_donor_summary
    `);

    await conn.query(`
      DELETE FROM monthly_donor_summary
    `);

    await conn.query(`
      INSERT INTO monthly_donor_summary (
        id,
        import_id,
        donor_id,
        reference_month,
        cpf,
        donor_name,
        demand,
        notes_count,
        value_per_note,
        abatement_amount,
        abatement_status,
        abatement_marked_at,
        created_at,
        updated_at
      )
      SELECT
        import_cpf_summary.import_id || '-' || donors.id,
        import_cpf_summary.import_id,
        donors.id,
        import_cpf_summary.reference_month,
        donors.cpf,
        donors.name,
        donors.demand,
        sum(import_cpf_summary.notes_count),
        imports.value_per_note,
        sum(import_cpf_summary.notes_count) * imports.value_per_note,
        coalesce(notar_monthly_status_backup.abatement_status, 'pending'),
        notar_monthly_status_backup.abatement_marked_at,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM import_cpf_summary
      INNER JOIN donor_cpf_links
        ON donor_cpf_links.id = import_cpf_summary.matched_source_id
      INNER JOIN donors
        ON donors.id = donor_cpf_links.donor_id
      INNER JOIN imports
        ON imports.id = import_cpf_summary.import_id
      LEFT JOIN notar_monthly_status_backup
        ON notar_monthly_status_backup.import_id = import_cpf_summary.import_id
        AND notar_monthly_status_backup.donor_id = donors.id
      WHERE imports.status = 'processed'
        AND donors.is_active = TRUE
        AND donor_cpf_links.is_active = TRUE
      GROUP BY
        import_cpf_summary.import_id,
        import_cpf_summary.reference_month,
        imports.value_per_note,
        donors.id,
        donors.cpf,
        donors.name,
        donors.demand,
        notar_monthly_status_backup.abatement_status,
        notar_monthly_status_backup.abatement_marked_at
    `);

    await conn.query(`
      UPDATE imports
      SET
        matched_rows = coalesce((
          SELECT sum(notes_count)
          FROM import_cpf_summary
          WHERE import_id = imports.id
            AND is_registered_donor = TRUE
        ), 0),
        matched_donors = coalesce((
          SELECT count(DISTINCT matched_donor_id)
          FROM import_cpf_summary
          WHERE import_id = imports.id
            AND is_registered_donor = TRUE
            AND matched_donor_id IS NOT NULL
        ), 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processed'
    `);

    await conn.query(`
      DROP TABLE IF EXISTS notar_monthly_status_backup
    `).catch(() => null);
  }

  if (structural) {
    await conn.query(`
      DROP TABLE IF EXISTS rule_versions
    `).catch(() => null);

    await conn.query(`
      DROP TABLE IF EXISTS rules
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_people_cpf ON people(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_person ON donors(person_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_holder_person ON donors(holder_person_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_cpf ON donors(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_type ON donors(donor_type)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donors_holder ON donors(holder_donor_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_donor_cpf_links_cpf ON donor_cpf_links(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_import_cpf_summary_cpf ON import_cpf_summary(cpf)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_import_cpf_summary_import ON import_cpf_summary(import_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_monthly_summary_import ON monthly_donor_summary(import_id)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_action_history_entity ON action_history(entity_type, created_at)
    `).catch(() => null);

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at)
    `).catch(() => null);
  }

}
