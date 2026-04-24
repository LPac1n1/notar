# Notar

Sistema web local para apoiar a gestão de doadores, importações da Nota Fiscal Paulista e abatimentos mensais de uma ONG ligada a demandas de moradia.

O Notar reduz conferências manuais ao centralizar cadastros, importar planilhas, cruzar CPFs, calcular abatimentos por mês e acompanhar o status do que já foi realizado.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Como Rodar](#como-rodar)
- [Configuração](#configuração)
- [Uso do Sistema](#uso-do-sistema)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Padrões do Projeto](#padrões-do-projeto)
- [Scripts](#scripts)
- [Testes](#testes)
- [Contribuição](#contribuição)
- [Licença](#licença)

## Funcionalidades

- Cadastro de pessoas, doadores titulares, doadores auxiliares e demandas.
- Separação entre pessoas sem papel de doador e doadores ativos.
- Vínculo de doador auxiliar a um titular ou a uma pessoa de referência.
- Importação de arquivos `CSV`, `TXT` e `XLSX` da Nota Fiscal Paulista.
- Pré-visualização da planilha e seleção da coluna de CPF.
- Conciliação de CPFs importados com os doadores cadastrados.
- Gestão mensal com cálculo de abatimento, filtros e status `pendente` ou `realizado`.
- Dashboard com indicadores operacionais.
- Backup, restauração e persistência em arquivo local.
- Exportações em CSV nas principais áreas.

## Tecnologias

- React 19
- Vite 8
- React Router DOM 7
- Tailwind CSS 4
- DuckDB WASM
- ExcelJS
- Framer Motion
- Lucide React
- ESLint
- Node Test Runner
- Playwright

## Como Rodar

### Pré-requisitos

- Node.js 20 ou superior.
- npm.

### Instalação

```bash
npm install
```

O `postinstall` prepara automaticamente o worker local do DuckDB WASM.

### Desenvolvimento

```bash
npm run dev
```

Depois, acesse a URL exibida pelo Vite no terminal.

### Build de produção

```bash
npm run build
```

### Preview da build

```bash
npm run preview
```

## Configuração

O projeto não exige variáveis de ambiente para rodar localmente no estado atual.

Se futuramente alguma configuração sensível for necessária:

1. Crie um arquivo `.env` local.
2. Documente as chaves esperadas em um `.env.example`.
3. Use o prefixo `VITE_` apenas para valores que podem ser expostos ao frontend.
4. Nunca versionar segredos, tokens ou arquivos reais de dados.

A persistência principal é feita pela própria aplicação, em `Configurações`, ao conectar um arquivo local de dados em JSON. Sem arquivo conectado, os dados existem apenas na sessão atual do navegador.

## Uso do Sistema

Fluxo básico:

1. Cadastre as demandas.
2. Cadastre pessoas de referência, quando necessário.
3. Cadastre doadores titulares e auxiliares.
4. Importe a planilha mensal da Nota Fiscal Paulista.
5. Informe o mês de referência, o valor por nota e a coluna de CPF.
6. Confira os CPFs encontrados e os vínculos com doadores.
7. Acompanhe os abatimentos em `Gestão Mensal`.
8. Marque cada abatimento como `pendente` ou `realizado`.
9. Use `Configurações` para conectar arquivo local, exportar backup ou restaurar dados.

Observações importantes:

- Titulares e auxiliares têm abatimentos próprios.
- O vínculo de um auxiliar é informativo e não soma abatimentos ao titular.
- O valor por nota fica salvo na importação daquele mês.
- Para corrigir uma importação com valor errado, exclua a importação e importe novamente.

## Estrutura de Pastas

```text
src/
  assets/        # arquivos estáticos usados pela aplicação
  components/    # componentes compartilhados de layout e UI
  features/      # componentes organizados por domínio/tela
  hooks/         # hooks reutilizáveis
  pages/         # páginas e orquestração de estado dos fluxos
  routes/        # configuração de rotas
  services/      # regras de dados, persistência, importação e exportação
  styles/        # estilos globais
  utils/         # funções utilitárias puras
  vendor/        # arquivos de terceiros versionados quando necessário
```

Outras pastas relevantes:

```text
e2e/      # testes end-to-end com Playwright
tests/    # testes unitários com node:test
scripts/  # scripts auxiliares do projeto
public/   # arquivos públicos servidos pelo Vite
```

## Padrões do Projeto

- Páginas em `src/pages` devem priorizar estado, carregamento de dados e handlers.
- Componentes específicos de domínio devem ficar em `src/features/<domínio>/components`.
- Componentes reutilizáveis e genéricos devem ficar em `src/components/ui`.
- Regras de negócio e acesso a dados devem ficar em `src/services`.
- Funções puras e formatações devem ficar em `src/utils`.
- Hooks reutilizáveis devem ficar em `src/hooks`.
- Evite misturar lógica de negócio em componentes visuais.
- Preserve os padrões visuais já existentes antes de criar novos componentes.
- Use nomes claros e consistentes para arquivos, componentes e handlers.
- Não adicionar dependências sem necessidade real.

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor local de desenvolvimento. |
| `npm run build` | Gera a build de produção com Vite. |
| `npm run preview` | Serve localmente a build gerada. |
| `npm run lint` | Executa o ESLint no projeto. |
| `npm run test` | Executa os testes unitários com `node --test`. |
| `npm run test:e2e` | Executa os testes end-to-end com Playwright. |
| `npm run prepare:duckdb-worker` | Prepara o worker local do DuckDB WASM. |
| `npm run postinstall` | Executa automaticamente a preparação do DuckDB após instalar dependências. |

## Testes

Execute a validação principal com:

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

Os testes e2e sobem o servidor de desenvolvimento automaticamente na porta configurada pelo Playwright.

## Contribuição

Fluxo recomendado:

1. Crie uma branch a partir da base principal.
2. Faça mudanças pequenas e focadas.
3. Mantenha compatibilidade com os dados e fluxos existentes.
4. Rode lint, testes unitários e build antes de abrir a contribuição.
5. Inclua testes quando alterar regras de negócio, importações, cálculos ou fluxos críticos.

Padrão simples de commits:

```text
tipo: descrição curta
```

Exemplos:

```text
feat: adiciona filtro de abatimento mensal
fix: corrige vínculo de doador auxiliar
refactor: extrai componentes de importações
docs: reorganiza readme
```

## Licença

Este projeto ainda não possui um arquivo de licença definido. Antes de distribuição pública ou uso por terceiros, adicione uma licença apropriada ao repositório.
