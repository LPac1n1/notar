# Notar

Sistema web para gestão de doadores da Nota Fiscal Paulista — cadastro, importação de CPFs, cálculo de abatimentos, conciliação de créditos e exportação de relatórios para ONGs.

![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![React](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)

## Sumário

- [Preview](#preview)
- [Sobre o Projeto](#sobre-o-projeto)
- [Tecnologias](#tecnologias)
- [Funcionalidades](#funcionalidades)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração de Ambiente](#configuração-de-ambiente)
- [Como Usar](#como-usar)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Padrões e Arquitetura](#padrões-e-arquitetura)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Limitações Conhecidas](#limitações-conhecidas)
- [Contribuição](#contribuição)
- [Licença](#licença)

---

## Preview

| Dashboard | Doadores |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Doadores](docs/screenshots/doadores.png) |

| Gestão Mensal | Importações |
|---|---|
| ![Gestão Mensal](docs/screenshots/mensal.png) | ![Importações](docs/screenshots/importacoes.png) |

---

## Sobre o Projeto

O **Notar** é uma aplicação web local-first voltada para ONGs ligadas a demandas de moradia. Centraliza o cadastro de doadores, cruza CPFs importados da Nota Fiscal Paulista, calcula abatimentos mensais, concilia o crédito real liberado pela NFP e gera relatórios em PDF, JPEG e CSV.

Toda a lógica de dados roda no navegador via **DuckDB-WASM**, em um banco em memória — sem servidor próprio, sem banco remoto, sem queries pela rede. A persistência acontece por snapshot: o banco é hidratado a partir de um JSON no **Supabase Storage** ao entrar e re-enviado (com debounce) após cada transação, o que também sincroniza os dados entre dispositivos. A autenticação é por magic link.

---

## Tecnologias

**Front-end**
- [React 19](https://react.dev) + [Vite 8](https://vitejs.dev)
- [React Router v7](https://reactrouter.com)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Framer Motion](https://www.framer.com/motion) — animações
- [Lucide React](https://lucide.dev) — ícones

**Banco de dados / Processamento**
- [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview.html) — SQL no navegador, banco em memória (bundle EH)
- [ExcelJS](https://github.com/exceljs/exceljs) — leitura de arquivos `.xlsx`

**Autenticação / Sincronização**
- [Supabase](https://supabase.com) — autenticação (magic link) + cloud storage

**Qualidade / Testes**
- [ESLint 9](https://eslint.org)
- [Node Test Runner](https://nodejs.org/api/test.html) — testes unitários
- [Playwright](https://playwright.dev) — testes end-to-end

---

## Funcionalidades

**Cadastros**
- Pessoas, doadores titulares, doadores auxiliares e demandas
- Busca por texto livre (nome, CPF ou demanda) em todas as listas, além dos filtros por seleção exata
- Lixeira com restauração e histórico de ações do sistema

**Importação e conciliação**
- Importação da planilha de **doações** da NFP (CSV, TXT, XLSX) com pré-visualização e seleção de coluna
- Importação da planilha de **créditos** da NFP e conciliação nota a nota entre as duas, por `(CNPJ, número da nota, valor)`
- Vínculo automático dos CPFs importados com os doadores cadastrados
- Visão por mês mostrando as duas planilhas e o estado da conciliação lado a lado

**Gestão mensal**
- Cálculo de abatimentos, status de realização e ações em massa
- Crédito real e saldo por doador **no mês** de referência
- Lançamento de abatimento acumulado cobrindo um intervalo de meses
- Auxiliares vinculados visíveis no card do titular

**Acompanhamento**
- Dashboard com indicadores e pontos de revisão
- Rastreio de doadores que pararam de enviar notas, com quantos meses seguidos e lista de contato

**Exportação**
- Planilha de abatimento por demanda, pronta para importar em outro sistema (ZIP quando há mais de uma demanda)
- CSVs de doadores, resumo mensal e conciliação
- Relatórios PDF e JPEG por demanda (ZIP automático para múltiplas demandas)

**Dados**
- Backup e restauração em JSON
- Sincronização entre dispositivos via Supabase, com detecção de alteração remota
- Autenticação por magic link (sem senha)

---

## Pré-requisitos

- **Node.js 20+** e **npm**
- Conta no [Supabase](https://supabase.com) com projeto configurado (ver [Configuração de Ambiente](#configuração-de-ambiente))

Para testes end-to-end, instale os navegadores do Playwright:

```bash
npx playwright install
```

---

## Instalação

```bash
# 1. Clone o repositório
git clone <url-do-repositório>
cd notar

# 2. Instale as dependências
# O postinstall prepara automaticamente o worker local do DuckDB-WASM
npm install

# 3. Configure as variáveis de ambiente (ver seção abaixo)
cp .env.example .env

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse a URL exibida pelo Vite no terminal.

---

## Configuração de Ambiente

O projeto requer um projeto no **Supabase** para autenticação e sincronização de dados.

### 1. Configurar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Storage**, crie um bucket privado chamado `notar`.
3. Aplique o template de policies **"Give users access to own folder"** no bucket, restrito a usuários `authenticated`.
4. Em **Auth → Providers → Email**, desative "Confirm email".
5. Em **Auth → URL Configuration**, adicione `http://localhost:5173` em **Site URL** e **Redirect URLs**.

### 2. Preencher o `.env`

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
VITE_SUPABASE_STORAGE_BUCKET=notar
VITE_SUPABASE_STORAGE_OBJECT=dados.json

# Opcional: "local" abre o app sem autenticação. Use apenas em
# desenvolvimento/testes — ver aviso abaixo.
VITE_NOTAR_AUTH_MODE=
```

As chaves `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão em **Supabase → Project Settings → API**.

> O `.env` já está no `.gitignore`. Nunca versione credenciais reais.

> **`VITE_NOTAR_AUTH_MODE=local` desliga a persistência.** Nesse modo o Supabase não é inicializado, então não há login **nem sincronização** — o banco fica só em memória e **todos os dados somem ao recarregar a página**. É o modo usado pela suíte e2e. Se o app "esquece" tudo a cada refresh, verifique se essa variável ficou marcada como `local` em algum `.env` ou `.env.local`.

---

## Como Usar

### Autenticação

O Notar usa **magic link** — sem senha. Informe seu e-mail na tela de login e acesse o link enviado para entrar.

> Em desenvolvimento, `VITE_NOTAR_AUTH_MODE=local` abre o app sem autenticação — mas sem persistência (ver [Configuração de Ambiente](#configuração-de-ambiente)).

### Fluxo de trabalho recomendado

1. Cadastre as **demandas** (com cores de identificação).
2. Cadastre **pessoas** de referência, se necessário.
3. Cadastre **doadores titulares** e **auxiliares** com seus CPFs.
4. Importe a **planilha de doações** da NFP (CSV, TXT ou XLSX), informando mês de referência, valor por nota e coluna de CPF.
5. Importe a **planilha de créditos** do mesmo mês para habilitar a conciliação.
6. Use a busca de CPFs em **Importações** para conferir quais foram vinculados a um doador e quais ficaram sem cadastro.
7. Acompanhe os abatimentos em **Gestão Mensal** e marque-os como pendentes ou realizados.
8. Para doadores com vários meses pendentes, use **Lançar acumulado** para consolidar em um único abatimento.
9. Exporte a **planilha de abatimento** (uma por demanda) para dar baixa no sistema externo.
10. Exporte **CSVs** ou **relatórios PDF/JPEG** por demanda quando necessário.
11. Use **Configurações** para exportar backup, restaurar dados ou sincronizar manualmente.

### Observações

- Titulares e auxiliares têm abatimentos independentes: cada CPF cadastrado gera sua própria linha no resumo mensal e na planilha de abatimento.
- O vínculo de um auxiliar é informativo — não transfere abatimento ao titular. Ele aparece no card do titular apenas para dar contexto.
- Quando um titular tem auxiliares, a descrição na planilha de abatimento inclui o nome de cada pessoa, para distinguir os lançamentos no sistema de destino.
- O valor por nota fica salvo por importação. Para corrigir, use **Reimportar** na própria linha do mês.
- Meses cobertos por um abatimento acumulado aparecem como "Via acumulado" e não podem ser marcados individualmente — o valor já foi contabilizado no mês do acumulado.
- As divergências de conciliação vêm das planilhas da própria NFP e não são corrigíveis pelo app; o número é informativo.
- Os dados são sincronizados automaticamente com debounce de 2s após cada transação.

---

## Estrutura de Pastas

```
src/
├── assets/           # Arquivos estáticos
├── components/       # Componentes compartilhados de UI e layout
│   ├── auth/         # Componentes de autenticação
│   └── sync/         # Componentes de sincronização cloud
├── constants/        # Constantes e opções de filtro compartilhadas
├── contexts/         # Context providers (auth)
├── features/         # Componentes e serviços agrupados por domínio
│   ├── credits/      # Importação da planilha de créditos da NFP
│   ├── dashboard/
│   ├── demands/
│   ├── donors/
│   ├── history/
│   ├── imports/
│   ├── monthly/
│   ├── notes/
│   ├── people/
│   └── reports/      # Geração de PDF/JPEG e empacotamento em ZIP
├── hooks/            # Hooks reutilizáveis desacoplados de domínio
├── pages/            # Páginas e orquestração de fluxos
├── routes/           # Configuração de rotas
├── services/         # Persistência, importação, exportação e regras de domínio
│   └── db/           # Módulos do banco (schema, migrations, cloud storage)
├── styles/           # Estilos globais
├── utils/            # Utilitários puros e helpers compartilhados
└── vendor/           # Arquivos de terceiros versionados
```

Pastas auxiliares:

```
e2e/      # Testes end-to-end (Playwright)
tests/    # Testes unitários (node:test) + integração com DuckDB-Node
scripts/  # Scripts auxiliares do projeto
public/   # Arquivos públicos servidos pelo Vite
```

---

## Padrões e Arquitetura

**Local-first:** toda a lógica de dados roda no browser via DuckDB-WASM, em um banco **em memória**. O Supabase é usado exclusivamente para autenticação e para guardar o snapshot JSON — não há queries remotas. O ciclo é: hidratar o banco a partir do snapshot ao entrar → operar localmente → re-enviar o snapshot após cada transação (com debounce). Nenhuma página monta antes da hidratação terminar.

**Separação de responsabilidades:**

| Camada | Responsabilidade |
|---|---|
| `pages/` | Estado, carregamento e handlers. Sem lógica de negócio. |
| `features/<domínio>/components/` | Componentes específicos de domínio. |
| `components/ui/` | Componentes genéricos e reutilizáveis. |
| `services/` | Regras de negócio, persistência e processamento. |
| `utils/` | Funções puras, formatações e helpers compartilhados. |
| `hooks/` | Hooks reutilizáveis desacoplados de domínio. |

**Migrations versionadas:** o schema do DuckDB é gerenciado por migrations incrementais em `services/db/migrations.js`, com tabela `schema_version` para rastreamento de versão aplicada.

**SQL seguro:** queries com input do usuário usam prepared statements (`queryPrepared` / `executePrepared`). Identificadores de coluna são validados por whitelist antes de serem interpolados no SQL.

**Boas práticas:**
- Evite lógica de negócio dentro de componentes visuais.
- Prefira refatorações incrementais compatíveis com dados existentes.
- Não adicione dependências sem necessidade clara.
- Mantenha nomes de arquivos e componentes consistentes com o padrão já adotado.

---

## Scripts Disponíveis

| Script | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor local de desenvolvimento |
| `npm run build` | Gera a build de produção |
| `npm run preview` | Serve localmente a build gerada |
| `npm run lint` | Executa o ESLint |
| `npm run test` | Executa os testes unitários com `node --test` |
| `npm run test:e2e` | Executa os testes end-to-end com Playwright |
| `npm run prepare:duckdb-worker` | Prepara o worker local do DuckDB-WASM |

**Validação recomendada antes de enviar mudanças:**

```bash
npm run lint && npm run test && npm run build
```

Para alterações que envolvam navegação, importação ou persistência:

```bash
npm run test:e2e
```

### Testes

| Suíte | O que cobre |
|---|---|
| `tests/*.test.js` | Funções puras (formatação, validação, chaves de conciliação) e integração real contra **DuckDB-Node**: migrations, prepared statements e as queries de negócio mais delicadas. |
| `e2e/*.spec.js` | Fluxos ponta a ponta no navegador com Playwright (importação, gestão mensal, cópia de CPF, backup/restauração). |

O CI (`.github/workflows/ci.yml`) roda em push para `main` e em pull requests, com dois jobs paralelos: `checks` (lint + testes + build) e `e2e` (Playwright em Chromium, com relatório publicado como artefato em caso de falha).

> A suíte de testes usa o bundle **node-blocking (MVP)** do DuckDB-WASM, que quebra com `_setThrew is not defined` em alguns construtos — notadamente `LIKE '%' || ? || '%'` dentro de prepared statement. Quando esbarrar nisso, cubra a lógica com teste unitário do SQL gerado e valide o comportamento pelo e2e, que roda o bundle EH de produção.

---

## Limitações Conhecidas

- **Compatibilidade de navegador:** o app usa o bundle EH do DuckDB-WASM, que depende de WebAssembly com exception handling — Chrome/Edge 95+, Firefox 100+, Safari 15.2+.
- **Edição simultânea:** o modelo de sincronização é por snapshot, então dois dispositivos editando ao mesmo tempo caem em "último a sincronizar vence". O app detecta alteração remota ao voltar para a aba e oferece recarregar antes de sobrescrever, mas não faz merge.
- **Volumes grandes:** Doadores, Pessoas, Lixeira e Histórico usam paginação server-side. **Gestão Mensal ainda pagina no cliente** — carrega o mês inteiro antes de fatiar. Para meses acima de ~5 mil linhas a página pode ficar lenta; a infraestrutura de paginação server-side já existe e a migração foi adiada por ser a página de maior risco.
- **Sem servidor:** não há API própria nem controle de acesso por perfil. Quem entra na conta enxerga e edita tudo.

---

## Contribuição

1. Crie uma branch a partir da base principal.
2. Faça mudanças pequenas e focadas.
3. Preserve compatibilidade com dados, backups e fluxos existentes.
4. Rode lint, testes e build antes de abrir a contribuição.
5. Inclua testes ao alterar regras de negócio, cálculos, importações ou persistência.

**Padrão de commits:**

O histórico deste repositório usa mensagens curtas e numeradas sequencialmente — o conteúdo da mudança fica no diff, não na mensagem:

```
commit 219
```

Cada commit deve ser uma unidade lógica fechada (que passe em lint, testes e build por si só). Mudanças de escopos diferentes vão em commits separados.

---

## Licença

Este projeto ainda não possui uma licença definida. Antes de distribuir publicamente ou permitir uso por terceiros, defina e adicione um arquivo de licença ao repositório.
