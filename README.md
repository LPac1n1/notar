# Notar

Aplicação web em React para apoiar a gestão operacional do projeto Notar, com foco em organização de doadores, regras de cálculo mensal e estrutura para futuras importações e relatórios.

## Estado atual

O projeto já possui:

- layout principal com navegação lateral e cabeçalho;
- roteamento com React Router;
- página de doadores com cadastro e remoção em memória;
- página mensal com exemplo de cálculo por quantidade de notas;
- gerenciamento de regras de valor por nota via Zustand;
- estrutura inicial para demandas, importações, exportações e configurações.

Hoje, parte das telas ainda está em fase inicial e alguns serviços existem como base para evolução futura.

## Páginas disponíveis

- `/` - dashboard inicial;
- `/doadores` - cadastro e listagem simples de doadores;
- `/demandas` - área reservada para gestão de demandas;
- `/mensal` - cálculo mensal com regras por data;
- `/importacoes` - área reservada para importação de dados;
- `/configuracoes` - área reservada para ajustes do sistema.

## Stack do projeto

- React 19
- Vite 8
- React Router DOM 7
- Zustand
- Tailwind CSS 4
- ESLint 9

## Estrutura principal

```text
src/
  components/
    layout/
  pages/
  routes/
  services/
  store/
  styles/
  utils/
```

## Como rodar localmente

### Pré-requisitos

- Node.js 20+ recomendado
- npm

### Instalação

```bash
npm install
```

### Ambiente de desenvolvimento

```bash
npm run dev
```

### Build de produção

```bash
npm run build
```

### Preview da build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Regras de negócio já iniciadas

### Doadores

A página de doadores permite adicionar e remover registros usando estado global com Zustand.

### Gestão mensal

A página mensal já demonstra a lógica de cálculo com base em:

- quantidade de notas;
- valor por nota vigente na data informada;
- regras com `startDate` e `valuePerNote`.

O cálculo atualmente é feito em [`src/services/calculationService.js`](./src/services/calculationService.js).

## Pontos em evolução

- persistência de dados;
- tela real de demandas;
- fluxo real de importação;
- exportação de dados;
- configurações funcionais;
- integração futura mencionada com DuckDB.

## Observações

- O projeto usa armazenamento em memória no estado atual.
- Alguns arquivos de serviço e store ainda estão como esqueleto para próximas etapas.
- O repositório já está preparado para versionamento com `.gitignore` ajustado para Node/Vite.
