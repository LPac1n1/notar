# Notar — Memória do Claude

## Contexto do projeto

SPA local-first em React 19 + Vite + Tailwind 4 + DuckDB-WASM (OPFS / File System Access API). Sem backend, sem Docker, sem PostgreSQL. Persistência 100% no navegador.

## Roadmap técnico em execução

O usuário aprovou e quer executar **Fases 1, 2 e 3** do roadmap definido no diagnóstico técnico (ver histórico em `commit 62` e mensagem subsequente). Após terminar Fase 3, vamos refazer a análise técnica para reavaliar prioridades. As fases 4 e 5 ficam para depois dessa reanálise.

### Fase 1 — Estabilizar fundação ✅ CONCLUÍDA (commits 64-68)

Objetivo: corrigir os fundamentos do banco antes de qualquer feature nova mexer em schema.

- [x] **C2** — `services/db.js` (1.667 linhas) quebrado em 6 módulos: `events.js`, `sql.js`, `schema.js`, `migrations.js`, `connection.js`, `backup.js`, `storage.js`. O antigo `db.js` virou barrel re-exportador (36 linhas). [commit 64]
- [x] **C3** — Sistema versionado de migrations em `services/db/migrations.js`. Tabela `schema_version` cria stamp por migration aplicada. Migration v1 agrega todo o estado anterior (CREATE/ALTER/DROP/INDEX). `applyDataNormalizations` separado, sempre roda. [commit 65]
- [x] **C4** — Migration v2 ("unique-id-and-natural-key-indexes") cria `CREATE UNIQUE INDEX` em `id` de todas as tabelas + `people(cpf)`, `donors(cpf)`, `demands(name)`. DuckDB-WASM não aceita `ALTER TABLE ADD PRIMARY KEY` em tabelas com dados, mas UNIQUE INDEX dá a mesma garantia. [commit 66]
- [x] **M6** — `services/logger.js` com `logError(scope, error, context)` e `installGlobalErrorHandlers()` (window.error + unhandledrejection). Categoria "Erros do sistema" adicionada em `features/history/constants.js`. Instalado em `main.jsx`. Os 39 `console.error` espalhados nas pages NÃO foram migrados — eles ainda funcionam, e qualquer erro não-tratado é capturado pelo handler global. [commit 67]
- [x] Testes de integração com DuckDB-Node em `tests/migrations.test.js` (helper em `tests/helpers/duckdbHelper.js`). Usa o build node-blocking de `@duckdb/duckdb-wasm` (já instalado). Cobre: stamping de migrations, idempotência, criação de tabelas, criação de UNIQUE indexes (id + naturais). 5/5 passing. Total geral: 37/37 testes. [commit 68]

**Estado atual:** `db.js` é barrel limpo. Schema é versionado. Logger central instalado. Testes de migração reais rodando contra DuckDB no Node.

### Fase 2 — Limpar duplicação de UI ✅ CONCLUÍDA (commits 70-73)

Objetivo: parar de copiar boilerplate de loader/filtros entre páginas.

- [x] **P2** — Constantes compartilhadas movidas para `src/constants/filterOptions.js` (`DONOR_TYPE_OPTIONS`, `DONATION_START_DATE_OPTIONS`, `ACTIVE_STATUS_OPTIONS`). `features/donors/constants.js` removido. `features/monthly/constants.js` re-exporta do novo path. [commit 70]
- [x] **M2/M3** — `src/hooks/useDataResource.js` criado: hook genérico com race-safe loader, debounce de filtros, optionSource neutralizado, isLoading/isRefreshing/error/setError/reload, captura de erro via `logError`. Substitui ~150 linhas de boilerplate duplicado nas páginas. [commits 71-72]
- [x] **M1** — Decidi NÃO criar `useDonorsPage`/`usePeoplePage`/etc. porque o `useDataResource` já elimina a duplicação (a parte que era genérica). O resto do código de página (mutações, modais, navegação) é genuinamente page-specific — extrair daria só um wrapper sem reduzir complexidade. Resultado: páginas ficaram 56-150 linhas menores e o boilerplate sumiu. [commits 71-72]
- [x] **M4** — Auditoria de naming: `getPersonById` e `getHolderPersonContext` retornavam null mas usavam prefixo `get*`. Renomeados para `findPersonById` e `findHolderPersonContext`. Os outros `list*`/`get*` estão consistentes. [commit 73]
- [x] **Cleanup adicional**: removido `donorWhereClause` morto em `monthlyService.js` e import não-usado de `formatInteger` em `donationPdfReportService.js`. ESLint agora sai com 0 erros e 0 warnings em todo `src/`. [commit 73]

**Estado atual:** Pages: Demands 524→468 (-56), People 607→544 (-63), Donors 869→786 (-83), Imports 816→666 (-150), Monthly 1.038→1.010 (-28). Total: -380 linhas. Padrão de loader unificado. Naming `find*`/`get*` consistente. Lint limpo. Todos 37 testes passando, build OK.

### Fase 3 — Reduzir SQL injetável ✅ CONCLUÍDA (commits 75-77)

Objetivo: trocar `escapeSqlString` por prepared statements onde houver entrada do usuário.

- [x] **Helpers de prepared statements** — `queryPrepared(sql, params)` e `executePrepared(sql, params)` adicionados em `services/db/connection.js`. Wrappers do `connection.prepare(sql).query(...params)` da DuckDB-WASM, com `stmt.close()` automático no finally. [commit 75]
- [x] **C1** — Todas as 8 funções LIST/SELECT do plano migradas para `queryPrepared`:
  - `demandService.listDemands` ✅
  - `personService.listPeople`, `findPersonById`, `findPersonByCpf` (queryPersonRows refatorada para `{conditions, params}`) ✅
  - `donorService.listDonors` + `getDonorProfile` (5 queries internas) ✅
  - `monthlyService.listMonthlySummariesByMonth` (3 queries) + `listHistoricalMonthlySummaries` (`buildDonorConditions` retorna `{conditions, params}`) ✅
  - `importService.listImportCpfSummary` + `searchImportedCpfs` (`cpfPlaceholders` expande `?` por CPF) ✅
- [x] **escapeIdentifier hardening** — DuckDB não suporta `?` para identificadores, então `escapeIdentifier(cpfColumn)` continua. Adicionada verificação defensiva: `cpfColumn` deve estar em `fileColumnNames` (descobertos por `DESCRIBE`) antes de ser splicada no SQL — bloqueia injeção via payload manipulado. [commit 76]
- [x] **User-input checks também migrados** — `donorChecks.js` (ensureDonationCpfIsAvailable, ensureDemandExists, findActiveDonorByPersonId, ensurePersonCanBeAuxiliary, resolveHolderPersonIdInput, findHolderPersonContext) + `demandService` (createDemand/updateDemand uniqueness checks). [commit 77]
- [x] **Testes de prepared statements** — adicionados em `tests/migrations.test.js`:
  - "prepared statements bind parameters via ? placeholders" ✅
  - "prepared statements neutralize quote injection attempts" ✅ (assert que tentativa de injeção via `'; DROP TABLE demands; --` retorna 0 linhas e não destrói a tabela)
  - Helper `tests/helpers/duckdbHelper.js` estendido com `prepare()` no wrapper síncrono.
- [x] **Auditoria final** — `escapeSqlString` zero em queries SELECT que processam filtro do usuário. As ~191 ocorrências remanescentes estão em:
  - **WHERE id = '...'** com IDs gerados por nanoid no servidor (não-input direto do usuário): donorService:302/367/388/402/407/505/523/528/542/544, personService, noteService, trashService, etc.
  - **INSERT/UPDATE values** com strings já validadas (`normalizePersonName`, `normalizeCpf` valida 11 dígitos, `normalizeDemandName`, etc.).
  - **buildCsvSource(registeredFileName)** — fileName é gerado internamente, não é input do usuário.
  - Migrar essas para prepared seria refatoração mecânica, baixo retorno em segurança, médio em consistência. Pode ser feito em uma futura passada.

**Estado atual:** SELECT/filter paths blindados via prepared statements. Identifier injection mitigada com whitelist runtime. 39/39 testes passando (32 unit + 7 integração com DuckDB-Node real). Build OK. Lint 0 erros.

### Fase 4 — Estrutural ✅ CONCLUÍDA (commits 85-89)

Reanálise pós-Fase 3 (commit 84) gerou roadmap; usuário aprovou execução de Quick wins + Fase 4 + Fase 5 (sem TypeScript).

**Quick wins entregues** [commits 85-86]:
- Migration v4 (`performance-indexes`): `monthly_donor_summary(reference_month, donor_id)`, `monthly_donor_summary(donor_id)`, `donor_activity_history(donor_id, reference_month)`, `import_cpf_summary(reference_month)`.
- 4 `console.error` migrados para `logError` (Settings, DonorProfile, Dashboard, CpfListSearchSection).
- Dashboard e DonorProfile migrados para `useDataResource` (com novo `initialData` opt para single-object loaders).
- Bug `Monthly.handleExport` (set/zera `successMessage` na mesma síncrona) corrigido.
- Vars `--shadow-elevated`, `--shadow-popover`, `--shadow-toast` em `index.css`; Modal/SelectInput/FeedbackMessage usando-as.
- `useDataRefreshStatus` → `useDataRefreshIndicator` (renomeado em todos os 10 consumidores).
- `groupChangesByStatus`/`normalizeStatusForApply` extraídos para `features/monthly/utils/statusChanges.js` + 4 testes unitários.
- `DonorProfile` padronizado em `getErrorMessage`.
- `CopyButton` exibe toast de erro (`<FeedbackMessage tone="error" persistent={false}>`) quando `clipboard` falha.

**Estruturais entregues** [commits 87-89]:
- **donorService split**: `donor/donorWriter.js` + `donor/donorProfile.js` + `donor/donorActivity.js`. `donorService.js` virou barrel (32 linhas vs 1.063).
- **importService split**: `import/importPipeline.js` + `import/importQueries.js` + `import/importReconcile.js`. Barrel de 31 linhas vs 1.127.
- **monthlyService refator**: 3 constantes SQL compartilhadas (`MONTHLY_SOURCE_SUBSELECTS`, `MONTHLY_HOLDER_JOINS`, `MONTHLY_DONOR_PROJECTION`) eliminam ~140 linhas de duplicação entre `listMonthlySummariesByMonth` e `listHistoricalMonthlySummaries`.
- **Bulk INSERT em reconcileImport**: chunks de 200 rows via VALUES multilinha. Acabou com loop 1k+ INSERTs sequenciais. Teste DuckDB integration cobre o pattern.
- **Optimistic UI no `StatusToggle`**: `Monthly.jsx` mantém `optimisticStatusOverrides` que é overlaid em `summaries`; cleared quando `rawSummaries` reference muda. Reverte no catch.
- **Server-side pagination opt-in**: `listDonors`/`listPeople`/`listMonthlySummaries` aceitam `limit`/`offset`. Novos `countDonors`/`countPeople`/`countMonthlySummaries` para paginação completa. Default = retorna tudo (back-compat).
- **`escapeSqlString` user-input → prepared**: `createImportRecord(fileName, notes)`, `processImportedFile(errorMessage)`, `createAbatementAdjustment(description)`, `createTrashItem(label, payload)`. Resíduo de Fase 3 fechado.
- **`useStatusChangeAction` hook** em `features/monthly/hooks/`. Migrado `handleConsolidatedDonorStatusChange`; outros handlers podem adotar incrementalmente.
- **Undo em delete**: já presente em Donors/People/Demands/Imports. Auditado e confirmado.

### Fase 5 — Longo prazo (parcial) ✅ CONCLUÍDA (commit 90)

- **`useDatabaseChangeEffect({ sources })`**: opt-in para filtrar reloads por `event.detail.source`. Sem `sources` continua catch-all (back-compat).
- **Logger circular buffer + dump**: `services/loggerBuffer.js` (zero deps, testável) com `appendLogEntry`, `getLogBufferSnapshot`, `clearLogBuffer`, `exportLogBuffer`, `LOG_BUFFER_CAPACITY=200`. `logger.js` usa internamente; 4 testes unitários.
- **Auto-reconcile robustness**: novo teste de integração `reconcileImport SQL backfills matched_source_id for CPFs registered after the import landed` valida o SQL do `reconcileImport` direto contra DuckDB-Node.
- **Migração mecânica de `escapeSqlString` em INSERT/UPDATE**: `noteService` (title/content/color), `demandService` (name/color, update donors em cascade), `actionHistoryService` (label/description/payload + filtro listActionHistory). 5 services agora 100% prepared para qualquer string que toca SQL.

**Estado atual:** 58/58 testes passando, lint 0 erros, build OK. donorService 1.063→32, importService 1.127→31, monthlyService 935→850 (redução modesta + extração de fragments). Quase todo INSERT/UPDATE com texto vai por prepared statements; `escapeSqlString` restantes são para nanoid IDs gerados pelo servidor + identifiers já com whitelist.

### O que ficou para uma futura fase

- TypeScript incremental (excluído explicitamente nesta rodada).
- Migrar páginas de `usePagination` client-side para o novo `count*`/`limit`/`offset` (infraestrutura pronta, adoção pendente).
- Aplicar `useStatusChangeAction` aos 3 handlers restantes em Monthly.
- Virtualização de listas (`react-window`) — só se cargas reais ultrapassarem 5k linhas.
- NDJSON streaming export/import — só necessário >100k linhas.
- Filtrar `useDatabaseChangeEffect` por source nas páginas (infra pronta, adoção pendente).
- Fullstack/sync server (escopo separado).

### Fase 6 — Reuso + adoção do que ficou opt-in ✅ CONCLUÍDA (commits 92-96)

Diagnóstico no commit 91 listou 7 quick wins + 6 estruturais. Quase tudo entregue.

**Quick wins entregues** [commit 92]:
- `dashboardService.getDashboardOverview` paralelizado: 10 queries sequenciais → `Promise.all` em 2 grupos. Latência cai 3-5x.
- `Settings.jsx` 5 catches silenciosos agora chamam `logError` (createFile, openFile, disconnectFile, exportBackup, importBackup).
- Botão "Baixar log de erros" em nova SectionCard "Diagnóstico" em Settings consumindo `exportLogBuffer()` + `downloadFile`.
- Os 3 handlers restantes de `Monthly.jsx` (`handleStatusChange`, `handleBulkAbate`, `handleUndoStatusChanges`) agora usam `useStatusChangeAction` — o hook foi estendido com `onError` (rollback) e `setBusy` (per-call busy flag) para suportar optimistic UI.
- **Optimistic UI estendido** para `handleConsolidatedDonorStatusChange` e `handleBulkAbate` — ambos overlaiam `optimisticStatusOverrides` antes do round-trip e revertem no `onError`.
- **Source filtering**: `useDatabaseChangeEffect({ sources, ignoreSources })`. `noteService` writes tagged `source: "notes"`. Notes page subscribe a `["notes", "restore", "backup-import", "database-file-opened"]`; Monthly usa `ignoreSources: ["notes"]`.
- `SkeletonRows`/`SkeletonCard` agora têm `role="status"`/`aria-busy="true"`/`aria-live="polite"` + `<span className="sr-only">` com `loadingLabel` prop.

**Estruturais entregues** [commits 93-96]:
- **`useMutationAction` hook genérico** em `src/hooks/useMutationAction.js` — orquestrador de CRUD com `setError`/`setSuccessMessage`/`setSuccessAction`/`setBusy`/`reload`. Suporta `onStart`/`onSuccess`/`onError`, `undo` (callback) e `buildUndo: (result) => callback` (factory que recebe o retorno do `run` para construir a ação Desfazer com IDs gerados pela mutation). Adotado em Demands.jsx (3 handlers) e People.jsx (4 handlers). Cortou ~120 linhas de boilerplate.
- **monthlyService split**: 939 linhas → 91 (barrel) + `monthly/sharedFragments.js` (SQL constants + mappers + filters + `buildDonorConditions` + `isSyntheticSummaryId`) + `monthly/listByMonth.js` + `monthly/listHistorical.js` + `monthly/abatementUpdates.js`.
- **Dashboard modal split**: `Dashboard.jsx` 802 → 446 linhas via `features/dashboard/components/DashboardModals.jsx` (9 modais inline → 1 componente único parametrizado por `activeModal`).
- **Prepared para `JSON.stringify` payloads**: `importPipeline.deleteImport` agora usa `executePrepared` para o trash insert (era o último gigante string-built de Fase 3).

**Deferidos com justificativa** [não entregue intencionalmente]:
- **`useNoteAutoSave`**: extração requer reescrita das duas state machines paralelas (create + edit) que entrelaçam 14 refs em `Notes.jsx`. Sem testes de integração para auto-save, o risco de regressão (ex.: race entre flush-on-close e timer-fire, comportamento de fingerprint quando reabre nota intocada) é alto demais para um refactor cego. O comportamento atual funciona — adiar até que haja teste E2E ou cobertura adicional.
- **Migração para paginação server-side**: a infra (`countDonors`/`countPeople`/`countMonthlySummaries` + `limit`/`offset`) está pronta desde Fase 4. A adoção exige rework substancial de cada page (state de page/pageSize, count em paralelo, refresh em filter change, cuidado com `optionSource` que precisa de tudo). Para volumes atuais (≤2k linhas) o ganho é marginal; o custo é grande. Adiar até que volumes reais ultrapassem ~5k linhas, quando o ROI inverte.

**Estado atual:** 58/58 testes passando, lint 0 erros, build OK. Dashboard reduzido em -356 linhas; monthlyService 939→91 (barrel); useMutationAction adotado em 7 handlers entre Demands+People.

## Convenções do projeto

- Cada commit é numerado sequencialmente (`commit 56`, `commit 57`, ...). Estamos em **commit 96**.
- Co-authored-by: `Claude Sonnet 4.6 <noreply@anthropic.com>` em todos os commits.
- Mensagens de commit são curtas (`commit N`) — o conteúdo vai no diff.
- Prefer `Edit` ao invés de `Write` para arquivos existentes.
- Não criar arquivos `.md` sem o usuário pedir explicitamente (o usuário pediu este).
- Nada de emojis em código a menos que pedido.

## Decisões já tomadas

- Filtros de Donors/People/Demands usam `SelectInput` searchable com match exato, igual a Monthly. Filtros que neutralizam o próprio campo nas opções: `donorId`, `cpf`, `demand` (paralelos a Monthly).
- Validação cronológica de ativação/desativação no servidor (`donorService`) e no cliente (modais com erro reativo).
- "CPFs encontrados" usa paginação default de 5 por página.
- Constantes shared em `features/donors/constants.js` (a mover para `src/constants/` na Fase 2).

## Itens explicitamente NÃO fazer agora

- TypeScript de uma vez só (P8) — incremental quando.
- Trocar DuckDB-WASM (lock-in aceito).
- Adicionar Docker / PostgreSQL / backend (Fase 5, escopo separado).
- Mexer no `chunkSizeWarningLimit` (P5).
- Padronizar subtitles de PageHeader (P4 — cosmético).
- Remover debounce dos filtros que viraram select (P1 — custo zero deixar).
