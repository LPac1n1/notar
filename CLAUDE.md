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

### Fase 3 — Reduzir SQL injetável

Objetivo: trocar `escapeSqlString` por prepared statements onde houver entrada do usuário.

- [ ] **C1** — Migrar para `connection.prepare(sql)` os services principais:
  - `donorService.listDonors`, `getDonorProfile`
  - `monthlyService.listMonthlySummariesByMonth`, `listHistoricalMonthlySummaries`
  - `importService.listImportCpfSummary`, `searchImportedCpfs`
  - `personService.listPeople`
  - `demandService.listDemands`
- [ ] Auditar `escapeIdentifier` em `importService.js` (CSV column names) — vetor parcial.
- [ ] Auditoria final: `escapeSqlString` deveria sobrar zero em paths que processam input do usuário.

## Reanálise pós-Fase 3

Quando Fase 3 terminar:
1. Rodar diagnóstico técnico completo de novo (mesmos 20 critérios da análise original).
2. Confrontar com o estado pré-fases.
3. Decidir Fase 4 (TypeScript + observabilidade) e Fase 5 (fullstack opcional) com base no que ainda dói.

## Convenções do projeto

- Cada commit é numerado sequencialmente (`commit 56`, `commit 57`, ...). Estamos em **commit 62**.
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
