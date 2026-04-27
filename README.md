# Notar

Sistema web local para gestão de doadores, importações da Nota Fiscal Paulista e acompanhamento de abatimentos mensais.

O Notar centraliza cadastros, cruza CPFs importados, calcula abatimentos por mês e gera relatórios para apoiar rotinas administrativas de uma ONG ligada a demandas de moradia.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso do Sistema](#uso-do-sistema)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Padrões do Projeto](#padrões-do-projeto)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Contribuição](#contribuição)
- [Licença](#licença)

## Funcionalidades

- Cadastro de pessoas, doadores titulares, doadores auxiliares e demandas.
- Associação de cores às demandas, usadas também em relatórios.
- Importação de arquivos `CSV`, `TXT` e `XLSX` da Nota Fiscal Paulista.
- Pré-visualização da planilha e seleção da coluna de CPF.
- Conciliação de CPFs importados com os doadores cadastrados.
- Gestão mensal com filtros, cálculo de abatimentos e status de realização.
- Dashboard com indicadores e alertas operacionais.
- Exportação de dados em CSV.
- Exportação de PDFs por demanda, com ZIP automático quando houver mais de uma demanda.
- Backup, restauração e persistência em arquivo local.

## Tecnologias

- React
- Vite
- React Router
- Tailwind CSS
- DuckDB WASM
- ExcelJS
- Framer Motion
- Lucide React
- ESLint
- Node Test Runner
- Playwright

## Pré-requisitos

- Node.js 20 ou superior.
- npm.

Para testes end-to-end, pode ser necessário instalar os navegadores do Playwright:

```bash
npx playwright install
```

## Instalação

Instale as dependências:

```bash
npm install
```

O `postinstall` executa automaticamente a preparação do worker local do DuckDB WASM.

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

Acesse a URL exibida pelo Vite no terminal.

Para gerar a build de produção:

```bash
npm run build
```

Para visualizar a build gerada:

```bash
npm run preview
```

## Configuração

O projeto não exige variáveis de ambiente para rodar localmente.

Caso novas configurações sejam necessárias no futuro:

1. Crie um arquivo `.env` local.
2. Documente as chaves públicas em `.env.example`.
3. Use o prefixo `VITE_` apenas para valores que podem ser expostos ao frontend.
4. Nunca versionar segredos, tokens, backups reais ou bases de dados locais.

A persistência principal é configurada dentro do sistema, em `Configurações`, ao conectar um arquivo local de dados. Sem um arquivo conectado, os dados ficam disponíveis apenas na sessão atual do navegador.

## Uso do Sistema

Fluxo recomendado:

1. Cadastre as demandas.
2. Cadastre pessoas de referência, se necessário.
3. Cadastre doadores titulares e auxiliares.
4. Importe a planilha mensal da Nota Fiscal Paulista.
5. Informe o mês de referência, o valor por nota e a coluna de CPF.
6. Confira os CPFs encontrados e os vínculos com doadores.
7. Acompanhe os abatimentos em `Gestão Mensal`.
8. Marque abatimentos como pendentes ou realizados.
9. Exporte CSVs ou relatórios PDF por demanda quando necessário.
10. Use `Configurações` para conectar arquivo local, exportar backup ou restaurar dados.

Observações:

- Titulares e auxiliares têm abatimentos próprios.
- O vínculo de um auxiliar é informativo e não transfere abatimento ao titular.
- O valor por nota fica salvo na importação do respectivo mês.
- Para corrigir uma importação com valor errado, exclua a importação e importe novamente.

## Estrutura de Pastas

```text
src/
  assets/       # arquivos estáticos usados pela aplicação
  components/   # componentes compartilhados de UI e layout
  features/     # componentes e serviços agrupados por domínio
  hooks/        # hooks reutilizáveis
  pages/        # páginas e orquestração dos fluxos
  routes/       # configuração de rotas
  services/     # persistência, importação, exportação e regras de dados
  styles/       # estilos globais
  utils/        # utilitários puros e helpers compartilhados
  vendor/       # arquivos de terceiros versionados quando necessário
```

Pastas auxiliares:

```text
e2e/      # testes end-to-end com Playwright
tests/    # testes unitários com node:test
scripts/  # scripts auxiliares do projeto
public/   # arquivos públicos servidos pelo Vite
```

## Padrões do Projeto

- Páginas em `src/pages` devem focar em estado, carregamento e handlers.
- Componentes específicos de domínio devem ficar em `src/features/<domínio>/components`.
- Componentes genéricos devem ficar em `src/components/ui`.
- Regras de negócio, persistência e processamento devem ficar em `src/services`.
- Funções puras, formatações e helpers compartilhados devem ficar em `src/utils`.
- Hooks reutilizáveis devem ficar em `src/hooks`.
- Evite lógica de negócio dentro de componentes visuais.
- Prefira refatorações incrementais e compatíveis com os dados existentes.
- Não adicione dependências sem necessidade clara.
- Mantenha nomes de arquivos e componentes consistentes com o padrão já usado no projeto.

## Scripts Disponíveis

| Script | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor local de desenvolvimento. |
| `npm run build` | Gera a build de produção. |
| `npm run preview` | Serve localmente a build gerada. |
| `npm run lint` | Executa o ESLint. |
| `npm run test` | Executa os testes unitários com `node --test`. |
| `npm run test:e2e` | Executa os testes end-to-end com Playwright. |
| `npm run prepare:duckdb-worker` | Prepara o worker local do DuckDB WASM. |

Validação recomendada antes de enviar mudanças:

```bash
npm run lint
npm run test
npm run build
```

Quando a alteração afetar fluxo de navegação, importação ou persistência, execute também:

```bash
npm run test:e2e
```

## Contribuição

Fluxo sugerido:

1. Crie uma branch a partir da base principal.
2. Faça mudanças pequenas e focadas.
3. Preserve compatibilidade com dados, backups e fluxos existentes.
4. Rode lint, testes e build antes de abrir a contribuição.
5. Inclua testes ao alterar regras de negócio, cálculos, importações ou persistência.

Padrão simples de commits:

```text
tipo: descrição curta
```

Exemplos:

```text
feat: adiciona relatório por demanda
fix: corrige vínculo de doador auxiliar
refactor: extrai componente da gestão mensal
docs: reorganiza readme
```

## Licença

Este projeto ainda não possui uma licença definida. Antes de distribuir publicamente ou permitir uso por terceiros, adicione um arquivo de licença apropriado ao repositório.
