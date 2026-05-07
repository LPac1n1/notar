# Notar — Memória do Claude

## Contexto do projeto

SPA local-first em React 19 + Vite + Tailwind 4 + DuckDB-WASM (OPFS / File System Access API). Sem backend, sem Docker, sem PostgreSQL. Persistência 100% no navegador.

## Roadmap técnico em execução

O usuário aprovou e quer executar **Fases 1, 2 e 3** do roadmap definido no diagnóstico técnico (ver histórico em `commit 62` e mensagem subsequente). Após terminar Fase 3, vamos refazer a análise técnica para reavaliar prioridades. As fases 4 e 5 ficam para depois dessa reanálise.

### Fase 1 — Estabilizar fundação

Objetivo: corrigir os fundamentos do banco antes de qualquer feature nova mexer em schema.

- [ ] **C4** — Adicionar `PRIMARY KEY` em `id` de todas as tabelas; adicionar `UNIQUE` onde fizer sentido (ex.: `(donor_id, cpf)` em `donor_cpf_links`, `(import_id, cpf)` em `import_cpf_summary`). Verificar quais constraints o DuckDB-WASM aceita.
- [ ] **C3** — Migrar os 30 `ALTER TABLE … ADD COLUMN IF NOT EXISTS` espalhados em `services/db.js` para um sistema versionado: tabela `schema_version` + array de migrations com `{ id, name, up }`. Migração inicial agrega todo o estado atual.
- [ ] **C2** — Quebrar `services/db.js` (1.667 linhas) em módulos:
  - `services/db/connection.js` — boot, init, runInTransaction
  - `services/db/schema.js` — CREATE TABLEs e índices
  - `services/db/migrations.js` — versionamento (depende de C3)
  - `services/db/storage.js` — File System Access API + OPFS
  - `services/db/backup.js` — snapshot/restore
  - `services/db/events.js` — event bus (`STORAGE_INFO_EVENT`, `DATA_CHANGED_EVENT`)
  - `services/db/sql.js` — escape, serialize
- [ ] **M6** — Logger central que persiste erros não-tratados em `action_history` (não somente `console.error`).
- [ ] Testes de integração com DuckDB-Node para os services principais (`donorService`, `monthlyService`, `importService`).

### Fase 2 — Limpar duplicação de UI

Objetivo: parar de copiar boilerplate de loader/filtros entre páginas.

- [ ] **M1** — Extrair hooks `useDonorsPage`, `usePeoplePage`, `useDemandsPage`, `useImportsPage`, `useMonthlyPage`. Página vira orquestrador fino.
- [ ] **M2/M3** — Hook genérico `useDataResource(loader, filters, { debounceMs, neutralizedKeys })` que devolve `{ data, optionSource, isLoading, isRefreshing, error, reload }`. Substitui o padrão de "race-safe loader + option source neutralizado" duplicado em 5 páginas.
- [ ] **M4** — Padronizar convenção: `list*` → array, `get*` → objeto único, `find*` → pode retornar null. Auditar exports de todos os services.
- [ ] **P2** — Mover constantes compartilhadas (DONOR_TYPE_OPTIONS, ACTIVE_STATUS_OPTIONS, DONATION_START_DATE_OPTIONS) para `src/constants/filterOptions.js`. Hoje moram em `features/donors/constants.js` re-exportadas em `features/monthly/constants.js`.

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
