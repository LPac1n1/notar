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

### Fase 7 — Sincronização multi-dispositivo via Supabase ✅ CONCLUÍDA (commits 98-100)

Usuário pediu poder usar o sistema em máquinas diferentes sem ter que ficar passando arquivo. Apresentei 3 opções (A: pasta sincronizada de nuvem, B: blob storage com sync no app, C: backend de verdade); ele escolheu B. Stack: **Supabase** (Storage + Magic Link auth).

**Setup no painel do Supabase** (usuário fez):
- Projeto criado, anon/publishable key copiada.
- Bucket privado `notar`. Policies via template "Give users access to own folder" — USING expr é `(bucket_id = 'notar' AND (storage.foldername(name))[1] = auth.uid()::text)`, aplicado a authenticated em SELECT/INSERT/UPDATE/DELETE.
- Auth → Email provider habilitado, Confirm email OFF, Site URL + Redirect URLs apontando pro dev local.

**Commit 98 — Scaffold de auth**:
- `@supabase/supabase-js` instalado. `.env` + `.env.example` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_STORAGE_BUCKET=notar`, `VITE_SUPABASE_STORAGE_OBJECT=dados.json`. `.env` já era gitignored.
- `services/supabaseClient.js` exporta o singleton client + `getUserStorageObjectPath(userId)` (retorna `{userId}/dados.json`).
- `contexts/AuthContext.jsx` provê session/user/status. `contexts/authContextValue.js` isola o `createContext` (Fast Refresh exige só componentes no .jsx). `hooks/useAuth.js` lê o contexto.
- `components/auth/SignInPanel.jsx` — formulário de magic link, redireciona pra `window.location.origin`.
- `App.jsx` é o gate: `loading` → LoadingScreen; `authenticated` → `<CloudSyncGate>`; senão `<SignInPanel>`.

**Commit 99 — Camada de storage migrada pra Supabase**:
- `services/db/cloudStorage.js` substitui o antigo `db/storage.js` (deletado). Responsabilidades:
  - `hydrateFromCloud(userId)`: pré-roteamento, baixa `{userId}/dados.json` e replaya em DuckDB via `restoreDatabaseSnapshot`. 404 → primeiro uso, segue vazio.
  - `scheduleCloudFlush()`: registrado via `setOnAfterTransaction`. Debounce de 2s — toda transaction reagenda; depois faz upload coalescido. Evita rajada de PUTs.
  - `flushPendingCloudSync()`: imediato, usado por `beforeunload` e botão "Sincronizar agora".
  - `setActiveCloudUser(userId)`: só passa a permitir uploads depois que a hidratação termina (evita upload acidental do estado vazio em pleno boot).
  - `onCloudSyncStatusChange(handler)` + `getCloudSyncStatus()` → status `idle`/`syncing`/`error` + `lastSyncedAt`. Espelhado em `storageInfo` pra Settings UI.
- `hooks/useCloudSync.js` — observa `useAuth`. Quando `authenticated`, chama `hydrateFromCloud` → `setActiveCloudUser`. Retorna `hydrationStatus` (`idle`/`hydrating`/`ready`/`error`) pro App.
- `App.jsx` → `<CloudSyncGate>`: mostra LoadingScreen enquanto hidrata; ErrorPanel com "Tentar novamente" em falha; routes em sucesso. Garante que nenhuma página monta antes da hidratação.
- `Settings.jsx` reescrito: seção "Armazenamento local" virou "Sincronização" com status + última sincronização + e-mail + botão "Sincronizar agora". Removidos handlers `createDatabaseFile`/`openDatabaseFile`/`disconnectDatabaseFile` (UI e barrel). Backup export/import continuam (rede de segurança offline). Nova seção "Conta" com "Sair desta conta".

**Commit 100 — Detecção de conflito entre dispositivos**:
- `cloudStorage.js` ganha `lastKnownServerVersion` (o `updated_at` do objeto que vimos por último). Atualizado depois de cada hydrate e de cada upload.
- `checkForRemoteChanges()`: chama `storage.list(userId)` (barato), compara `updated_at` com o anchor. Se diferente → `remoteConflict = true` → `notifyConflictListeners`.
- Disparado em `window.focus` e `document.visibilitychange === "visible"` (zero polling em background, só quando o usuário volta pra aba).
- `components/sync/RemoteConflictBanner.jsx`: banner fixo no topo (z-50) com "Recarregar" (window.location.reload) ou "Ignorar" (`acknowledgeRemoteConflict()`). Montado dentro do `CloudSyncGate` autenticado.
- `onRemoteConflict(handler)` + `acknowledgeRemoteConflict()` exportados via `services/db.js`.

**Estado atual:** 58/58 testes (suíte de migrations não cobre o cloud layer ainda — é tudo browser-only via fetch). Lint 0 erros, build OK. Persistência local-only foi removida; tudo passa pelo Supabase. Backup/import JSON continuam como recurso offline. `.env` no gitignore, anon key segura no frontend (policies do bucket são o gate de verdade).

### Fase 17–19 — Conciliação Doações × Créditos NFP ✅ CONCLUÍDA

Usuário pediu casar a planilha de doações (NFP) com a planilha de créditos. Match key originalmente era (CNPJ, Número, Data), depois refatorado para (CNPJ, Número, Valor em centavos) — datas são instáveis e geravam falsos divergentes.

**Modelo de dados** (migrations v5–v9):
- v5: `donation_notes` (uma linha por nota), `imports.cnpj_entidade_social`.
- v6: `credit_imports` + `credit_notes`.
- v7: `credit_imports.reference_month`.
- v8: `credit_reconciliation` (id, credit_note_id, donation_note_id, match_status, created_at).
- v9: `donation_notes.match_key`, `donation_notes.valor_cents`, `credit_notes.match_key`, `credit_notes.valor_cents` + índices. Backfill idempotente em `applyDataNormalizations`.

**Helpers de normalização** (`src/utils/reconciliationKey.js`):
- `normalizeCnpj`, `normalizeNumeroNota`, `normalizeValor` (retorna inteiro em centavos), `buildMatchKey`, `isCompleteMatchKey`. Testes em `tests/reconciliationKey.test.js`.

**Pipeline de doações** (`src/services/import/importPipeline.js`):
- Parser BR-format hardened: `regexp_replace('[^0-9,.\\-]', '', 'g')` antes do BR-format dance, senão prefixos `R$ ` e non-breaking spaces zeravam `valor_cents` → tudo virava divergente.
- Detecta `donationColumns` (CNPJ Estab., Nº Nota, Valor, Data, CNPJ Entidade, Data Pedido, Tipo) + `orderStatusColumn`. Pre-detecção exposta no preview pro `DetectedColumnsChecklist` (Sprint 1).

**Pipeline de créditos** (`src/services/credit/creditImportPipeline.js`):
- Mesmo modelo. Strict equality `lower(trim(replace BOM/NBSP)) = 'calculado'` para `is_valid`.
- `deleteCreditImport` pula `trash_items` (volumes 30k+ estouravam o bind limit do prepared statement). Donations idem.

**Service de conciliação** (`src/services/reconciliation/creditReconciliationService.js`):
- `reconcileCredits()`: rebuild full do `credit_reconciliation` por bucket: `duplicate_*` → `matched` → `divergent` → `credit_only` → `donation_only`.
- `completeKeyCondition(alias)`: factory pra evitar SQL ambiguity entre `donation_notes.match_key` e `credit_notes.match_key`.
- Helpers de consulta: `getCreditImportMatchStats`, `diagnoseCreditImportMatching`, `getDonorReconciliationSummary`, `listDonorReconciliationStatuses`, `countDonorReconciliationIssues`, `listReconciliationByDonor`, `listReconciliationPairs`.

**UI**:
- Página dedicada `pages/Credits.jsx` + nav.
- Colunas "Crédito real" + "Saldo" em `MonthlySummaryRow` + filtro de status de conciliação em Monthly (overlay no `summaries`).
- Cards de conciliação no Dashboard + linha de % casadas + `reconciliationLatestMonth`.
- Painel de conciliação por doador (`DashboardReconciliationSection`).
- Badge de inconsistências em Donors no Sidebar (`countDonorReconciliationIssues`).
- CSVs de conciliação por doador e pareamentos (com filtros respeitados).

**Estado:** 116/116 testes. Lint 0 erros.

### Fase 20 — UX audit + 3 sprints ✅ CONCLUÍDA (commits 142-151)

Auditoria de UX gerou 14+ pontos, priorizados em 3 sprints. Tudo entregue.

**Sprint 1 — Quick wins** [commits 142-146]:
- **P2.1**: toast pós-import de doações com stats de conciliação (matched/divergent/donation_only).
- **P3.1/P3.3**: colunas "Crédito real" e "Saldo" em `MonthlySummaryRow`. Saldo colorido por status (success/warning/danger).
- **P3.2**: filtro de status de conciliação em `MonthlyFiltersBar` (overlay client-side via `reconciliationByDonor.get(donorId).status`).
- **P7.1**: `hasDonationImportForMonth` checa antes de processar crédito; modal de confirmação se não houver doação do mês.
- **P2.2**: botão "Re-rodar conciliação" em Credits (chama `reconcileCredits` + toast de stats).
- **P10.2**: badge em "Doadores" no Sidebar com count de doadores com inconsistência. Refresh via `useDatabaseChangeEffect`.
- **P4.2**: link clicável no diagnose (clicar no nome do doador navega pro perfil).
- **P10.1**: cards "Última conciliação" no Dashboard.

**Sprint 2 — Estruturais** [commits 147-149]:
- **P1.2**: `DetectedColumnsChecklist` reutilizável; `prepareImportPreview` expõe `donationColumns` + `orderStatusColumn`; usado em `ImportUploadModal` e `CreditUploadModal`.
- **P5.1**: exports CSV de conciliação por doador e pareamentos respeitam filtros (`{ referenceMonth, statusFilter }`); filename inclui sufixo do filtro.

**Sprint 3 — Maior valor entregue** [commit 150-151]:
- **P8.1**: `restoreDatabaseSnapshot` emite `{ phase, currentTable, restoredRows, totalRows }`; `CloudSyncGate` renderiza barra de progresso real com tradução amigável dos nomes das tabelas ("Restaurando notas de doação (8.500 de 30.000 linhas)…").
- **P1.3**: progresso real em imports grandes. 4 pipelines (`processImportedFile`, `applyReimport`, `processCreditImport`, `applyReimportCredit`) aceitam `onProgress` e emitem etapas: `validating` → `inserting-notes` → `aggregating` → `reconciling-donors` → `reconciling-credits` → `finalizing` → `done`. Novo `ImportProgressIndicator` exibe label do step dentro dos 4 modais (upload + reimport, doações + créditos).
- **P4.1**: listagem filtrável de notas em Créditos. Novos `listCreditNotes` + `countCreditNotes` server-side. `buildCreditNotesFilters` whitelisteia opções de status. Nova `CreditNotesSection` com filtros (mês, status, busca CNPJ/nº), paginação server-side via `usePaginatedResource`, link clicável pro perfil do doador.
- **P1.1**: página unificada de importação por mês. `getMonthlyImportsOverview` faz 3 queries paralelas + merge em JS (1 row por mês). Nova `MonthlyImportsOverviewSection` no topo de Importações: tabela mostrando planilha de doações + planilha de créditos + estado da conciliação side-by-side.
- Bugfix [commit 151]: TDZ em `Credits.jsx` — `useMemo` para `creditNotesMonthOptions` lia `creditImports` antes do `useDataResource` declarar. Movido pra depois.

**Estado:** 116/116 testes, lint 0 erros, build OK. Cloud sync, conciliação, imports e UX de feedback todos em estado polido.

### O que ficou para uma futura fase (re-revisado)

- Migração para paginação server-side (infra pronta desde Fase 4, sem ROI até ~5k linhas — exceto `CreditNotesSection` que já usa).
- Extração de `useNoteAutoSave` (precisa de testes E2E antes).
- TypeScript incremental.
- Testes automatizados do fluxo de cloud sync (envolve mockar Supabase ou usar a [local CLI](https://supabase.com/docs/guides/cli/local-development) — escopo separado).
- Compressão do JSON antes do upload (se um dia o snapshot ficar grande; hoje é desprezível).
- Testes de integração para os pipelines de import com `onProgress` (hoje só lint+build cobrem).

## Simplificação de features + nova identidade visual ✅ CONCLUÍDA (commits 170-181)

Usuário pediu simplificação agressiva ("tirar muitas funções desnecessárias") e, na sequência, troca completa da identidade visual ("mais simples, moderno e intuitivo").

**Remoção de features** [commits 170-175]: busca universal (`CommandPalette`, `useCommandPalette`, `searchService`), atalhos de teclado (`useKeyboardNavigation`, `KeyboardShortcutsOverlay`), captura rápida de nota (`QuickNoteCapture`), painel lateral de doador (`DonorSidePanel` — `Donors.jsx` voltou a usar `navigate()` para o perfil, padrão anterior recuperado via `git show`), widgets de insight do Dashboard (`NextActionsInbox`, `DashboardAttentionZone`, `DashboardWorkflowChecklist`, `DashboardRecentReportsSection` + services `dashboardAttentionService`/`recentReportsService`), PWA/service worker (`public/sw.js`, manifest, ícone maskable). Bug real encontrado e corrigido de passagem: `MobileBottomNav` usava índices mágicos obsoletos em `MAIN_NAV_ITEMS` — corrigido para `WORKSPACE_NAV_ITEMS`. Nova confirmação + undo em `DonorAbatementAdjustmentsSection` (era a única ação destrutiva sem `ConfirmModal` no app). `Settings.jsx` perdeu as seções "Convenções de design" e "Atalhos de teclado" (jargão interno exposto ao usuário final).

**Identidade visual "Direção A — Neutro"** [commits ~176-181]: paleta cinza-grafite frio + acento único índigo (`--accent #818cf8` dark / `#4f46e5` light), tipografia reduzida a só Geist (tirou IBM Plex Mono e Fraunces de um refresh anterior não commitado, "Editorial Terminal"). Tokens de `radius` movidos para dentro do `@theme` do Tailwind 4 — bug real encontrado: estavam em `:root` mas fora do `@theme`, então `rounded-lg` etc. nunca pegavam o valor customizado. Bug de contraste WCAG recorrente: `--success` no tema claro mediu 3.77:1 (falha AA), o MESMO valor que uma auditoria anterior já tinha flagueado — corrigido para `#047857` (5.48:1), verificado ao vivo via `getComputedStyle`.

## Roadmap "melhoria completa do sistema" (pós-simplificação)

Depois da simplificação + identidade visual, usuário pediu um roadmap único consolidando tudo que falta e mandou executar do início ao fim. Numeração de fases reinicia em 1 aqui — não confundir com as Fases 1-20 acima, que são de um ciclo de trabalho anterior já concluído.

### Fase 1 — Cloud sync: correções de race condition e perda de dados ✅ CONCLUÍDA (commit 182)

- `beforeunload` agora tenta upload via `fetch(..., {keepalive:true})` direto (bypassa o SDK do Supabase, que nunca seta `keepalive`, confirmado lendo o bundle minificado) quando o snapshot cabe no limite de ~64KB do browser; acima disso cai pro fallback síncrono (`performUpload`, extraído do antigo `uploadSnapshotImmediate` para pular o gate de conflito nesse caminho de orçamento apertado).
- Upload normal (`uploadSnapshotImmediate`) passou a checar conflito remoto (`checkForRemoteChanges`) antes de subir — evita sobrescrever dado mais novo de outro dispositivo.
- Bug corrigido: `acknowledgeRemoteConflict()` ("Manter minhas alterações" no banner) limpava a flag de conflito mas nunca re-disparava o upload pendente — usuário clicava e nada subia até a próxima edição não relacionada.

### Fase 2 — CI/CD + e2e

- **2.1 — CI/CD (GitHub Actions)** ✅ CONCLUÍDA (commit 187). `.github/workflows/ci.yml` com 2 jobs paralelos: `checks` (lint + `npm test` + build) e `e2e` (Playwright, só Chromium — é o único browser configurado em `playwright.config.js`). Trigger em push pra `main` e em pull requests. `playwright.config.js` ganhou `retries: 2` e reporter HTML só em CI (`process.env.CI`), e `trace: "on-first-retry"` — sem isso não haveria artefato nenhum pra debugar uma falha de CI (o reporter default do Playwright não gera `playwright-report/`). Ainda não pushado pro remoto (16 commits locais à frente de `origin/main`, aguardando autorização explícita pra push).
- **2.2 — Corrigir specs e2e desatualizados** ✅ CONCLUÍDA (commits 183-185). 12 de 15 specs falhavam. Duas causas eram bugs reais de app, não só teste desatualizado:
  - **Race condition em `initDB()`** (`services/db/connection.js`): o módulo publicava `conn` (variável de módulo) logo após `db.connect()`, ANTES de `runSchemaBootstrap` (todas as migrations) terminar. Qualquer chamada concorrente a `initDB()` nessa janela caía no fast-path `if (conn) return conn` e recebia uma conexão com schema incompleto — reproduzido via `restoreDatabaseSnapshot` batendo em `DELETE FROM credit_reconciliation` (tabela da migration v8) e falhando com "table does not exist". A publicação de `conn` acontecia cedo de propósito, pra permitir que o reconcile pós-migration (`reconcileCredits`, disparado de dentro do próprio `initDB()` quando migrations 10/11 aplicam) não travasse esperando sua própria promise. Corrigido publicando `conn` só depois do `runSchemaBootstrap` completar, e movendo o reconcile pós-migration pra fora da IIFE que produz `initPromise` (roda depois que `initPromise` resolve, então as chamadas internas do reconcile pegam o fast-path legitimamente em vez de aguardar uma promise ainda pendente).
  - **Visão consolidada "Abatimentos por doador" inalcançável** depois da primeira importação: dois bugs se combinando.
    1. `ImportedMonthsCarousel.jsx` comparava `item.referenceMonth.slice(0, 7)` (7 chars) contra `selectedReferenceMonth` (data completa "YYYY-MM-DD", vinda do auto-anchor ou do `MonthSwitcher`) — nunca batia, então o card do mês ativo nunca aparecia como selecionado e clicar nele pra "fechar"/desmarcar na verdade re-selecionava o mesmo mês (no-op).
    2. Mesmo corrigindo a comparação, o `useEffect` de "mês implícito" (Sprint 2/P2, `Monthly.jsx`) re-disparava toda vez que `filters.referenceMonth` ficava vazio — inclusive quando o usuário limpava de propósito — e re-selecionava o mês mais recente imediatamente. O comentário original dizia "só roda uma vez" mas isso nunca foi de fato implementado. Corrigido com `hasAutoAnchoredRef`: desarma permanentemente assim que o auto-anchor roda uma vez OU quando já chega com um mês setado (deep-link).
  - Specs corrigidos (fixtures + assertions): CSVs de fixture ganharam as 4 colunas de conciliação (`CNPJ Estabelecimento`, `Número da Nota`, `Valor da Nota`, `Data da Nota`) exigidas desde a Fase 17-19; mensagem de sucesso do backup mudou de "Backup importado com sucesso" pra "Backup importado: {stats}." em algum commit anterior sem atualizar os specs; seção "CPFs encontrados" em Importações foi removida num refactor anterior (Sprint 3 / `MonthlyImportsOverviewSection` + `CpfListSearchSection` a substituíram) — `CpfSummaryItem.jsx` ficou como código morto (throw pra Fase 3.5); `MonthlySummaryRow` renderiza cada doador DUAS vezes no DOM (card mobile compacto + detalhe desktop, alternados via `md:hidden`/`md:block`) — `getByText(...).first()` pegava consistentemente o nó mobile (oculto no viewport padrão do Playwright) por ordem de DOM; trocado por `getByRole("button", ...)` (nome acessível não bate no card mobile, que concatena todo o texto do card) ou `.and(page.locator(":visible"))` quando precisa continuar sendo `getByText`.
  - 118/118 testes unitários/integração, 15/15 e2e (2 rodadas consecutivas), lint 0 erros, build OK.

### Fase 3 — Estrutural (SQL, cache, mutations, código morto) ✅ CONCLUÍDA (commits 189-193)

- **3.1 — Prepared statements restantes** (commit 189): `donorWriter.js`, `donorActivity.js`, `importReconcile.js` e `monthly/abatementUpdates.js` migrados de `escapeSqlString`/`execute`/`query` pra `executePrepared`/`queryPrepared` com `?`. O bulk-insert em `reconcileImport` (chunks de 200 rows) virou `(?, ?, ..., ?)` repetido + `params.flatMap(...)` em vez de interpolar cada valor no SQL. Os `escapeSqlString` que sobraram nos outros 14 arquivos são só nanoid IDs gerados no servidor — auditoria confirmou que já estavam assim antes.
- **3.2 — Drift de `normalizeCpfSqlExpression`** (commit 190): existiam DUAS definições idênticas — uma em `db/sql.js` (usada por `schema.js`), outra em `import/sqlExpressions.js` (usada por `importPipeline.js`). Hoje ainda eram byte-a-byte iguais (não tinha bug ativo), mas era uma duplicação esperando pra divergir. Consolidado: `import/sqlExpressions.js` agora importa de `../db` e re-exporta, só existe uma implementação.
- **3.3 — Invalidação do `queryCache`** (commit 191): bug real — `execute()` (o caminho de escrita não-prepared, em `connection.js`) nunca chamava `invalidateCache()`, só `executePrepared()` chamava. Qualquer mutação passando por `execute()` (ainda usado por ~14 arquivos) deixava o cache de leitura obsoleto até alguma chamada não relacionada via `executePrepared` limpar por acaso. Corrigido espelhando o mesmo `extractRowsAffected` + invalidação condicional que `executePrepared` já tinha.
- **3.4 — `Donors.jsx` → `useMutationAction`** (commit 192): os 5 handlers de mutação (create/update/delete/deactivate/reactivate) migrados pro hook genérico, igual `People.jsx`/`Demands.jsx`. `handleExport` ficou de fora de propósito (não recarrega dados, mensagem de sucesso depende do resultado — não encaixa no shape do hook). Dropped o check `isUserFacingError` antes de logar erro de criação/edição — o hook sempre loga, igual o padrão já estabelecido em People/Demands; Donors.jsx era o único lugar que ainda distinguia isso.
- **3.5 — Código morto** (commit 193): `Drawer.jsx`, `ImportHistoryItem.jsx`, `CpfSummaryItem.jsx` deletados (zero importadores — órfãos desde que `DonorSidePanel`/`ImportHistorySection`/`CpfSummarySection` foram removidos em ciclos anteriores). `imports/utils/options.js` podado de 8 exports pra 1 (`getPreviewColumnOptions` — o resto morreu junto com os mesmos componentes). `listCreditNotes`/`countCreditNotes`/`buildCreditNotesFilters` removidos de `creditImportPipeline.js` — o comentário de `CreditNotesSection` que os CLAUDE.md antigo descrevia como consumidor foi removido num commit posterior (158) que nunca atualizou essa entrada do changelog. `Imports.jsx:153-183` (deep-link effect "vindo do CommandPalette") também morto — nada mais seta esses `location.state` keys desde que o CommandPalette foi removido; `useLocation`/`useEffect`/`useRef` saíram dos imports junto.
- 118/118 testes, 15/15 e2e (múltiplas rodadas), lint 0 erros, build OK em cada commit.

### Fase 4 — Dashboard: severidade enxuta ✅ CONCLUÍDA (commit 195)

- **Texto de conciliação desatualizado**: `DashboardReconciliationSection` descrevia a chave de match como "(CNPJ, número da nota, data de emissão)" — mas a Fase 17-19 já tinha trocado data por valor (datas eram instáveis e geravam falso-divergente). Corrigido pra "(CNPJ, número da nota, valor)".
- **2 cards novos em "Pontos para revisar"**: "Importações com erro" (`imports.status = 'error'` — status real, setado em `importPipeline.js`/`creditImportPipeline.js` quando o processamento falha, mas que não tinha NENHUMA superfície visível antes — nem filtro, nem contagem, nem alerta) e "Abatimento acima do crédito" (doadores cujo total abatido com `abatement_status='applied'` supera o crédito real casado/divergente somado — mesmo conceito de "saldo negativo" que já existe por doador/mês em `MonthlySummaryRow`, agora agregado no dashboard). Grid de `xl:grid-cols-4` pra `xl:grid-cols-3` (6 cards, 2 linhas de 3 fica mais limpo que 4+2). Query nova de "abatimento acima do crédito" (CTE com `donor_applied`/`donor_credit`) verificada com um teste de integração real em `tests/migrations.test.js` reaproveitando a fixture `seedReconciliationFixtures` (Alice: R$1,00 abatido vs R$0,20 de crédito casado → aparece; Bruno: sem `monthly_donor_summary` aplicado → não aparece).
- **Aviso de mês desatualizado**: `DashboardCurrentMonthBanner` agora calcula quantos meses o "último mês com dados" está atrás do mês corrente (`monthsBehindCurrent`) e mostra um aviso se for 2+ meses (1 mês de atraso é normal — a planilha do mês corrente pode simplesmente não existir ainda).
- 119/119 testes (1 novo), 15/15 e2e, lint 0 erros, build OK.

### Fase 5 — Tabelas e escala ✅ CONCLUÍDA (commit 197) — Monthly pagination adiada de propósito

- **Bug real: opções recarregando a cada página** (`useDataResource.js`): `runLoad` refazia a query de `optionSource` (lista completa pra popular os dropdowns de filtro) toda vez que `filters` mudava de referência — inclusive quando só `limit`/`offset` mudaram (virar de página). `buildOptionFilters` já removia `limit`/`offset` do objeto, mas nada comparava o CONTEÚDO resultante contra a última carga — então paginar sem tocar em nenhum filtro real ainda refazia a query de "todas as opções" à toa. Corrigido com `lastOptionFiltersKeyRef` (assinatura JSON.stringify): só recarrega `optionSource` quando o conteúdo pós-neutralização realmente mudou.
- **Lixeira ganhou paginação server-side**: `listTrashItems` aceita `limit`/`offset` (0 = sem limite, mantém compat com chamadas antigas tipo `restoreTrashItem`'s internals). `countTrashItems` já existia (usado pro badge do Sidebar) e serviu de count-loader sem mudança. `Trash.jsx` migrado de `useDataResource` pra `usePaginatedResource`, com `PaginationControls` no topo e rodapé da lista.
- **Busca de Histórico era falsa em escala**: `ActionHistory.jsx` buscava com `listActionHistory({...filters, limit: 100})` — um hard-cap de 100 linhas MAIS RECENTES antes de qualquer paginação. Buscar por algo mais antigo que as últimas 100 ações simplesmente não encontrava nada, sem nenhuma forma de "ver mais". `actionHistoryService.js` ganhou `buildActionHistoryFilters` (extraído do WHERE compartilhado) + `countActionHistory`; `listActionHistory` passou a aceitar `offset` e usar `limit` como tamanho de página (25, igual as outras listas) em vez de "quantas linhas totais buscar". `ActionHistory.jsx` migrado pra `usePaginatedResource` — busca por texto agora alcança o histórico inteiro, paginado de verdade.
- **Paginação server-side do Monthly — adiada de propósito**: perguntei ao usuário antes de mexer, porque é o item de maior risco do roadmap (Monthly.jsx é a página mais complexa do app — filtros, overlay otimista, visão consolidada, ações em massa, a lógica de carrossel/âncora que corrigi hoje mesmo) e a análise anterior (Fase 4 do ciclo antigo, já documentada acima) já tinha concluído que o ROI é marginal abaixo de ~5k linhas. Usuário confirmou: manter client-side por agora, revisitar se os volumes reais passarem dessa marca.
- 119/119 testes, 15/15 e2e, lint 0 erros, build OK.

## Convenções do projeto

- Cada commit é numerado sequencialmente (`commit 56`, `commit 57`, ...). Estamos em **commit 151**.
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
