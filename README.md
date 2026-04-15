# Notar

Sistema web local e portátil para apoiar a gestão dos abatimentos da Nota Fiscal Paulista em uma ONG que atua com demandas de moradia.

O foco do projeto é reduzir trabalho manual, evitar erros operacionais, manter histórico confiável e facilitar a conferência mensal dos valores que devem ser abatidos para cada doador cadastrado.

## Contexto do projeto

A ONG trabalha com pessoas vinculadas a demandas de moradia e recebe doações de notas fiscais por meio da Nota Fiscal Paulista. Para incentivar a participação, cada doador cadastrado pode gerar um valor de abatimento calculado a partir da quantidade de notas fiscais doadas em determinado mês.

O sistema foi pensado para uso local, simples e portátil, sem depender de instalação complexa ou infraestrutura de servidor. A proposta é que ele possa funcionar em qualquer computador, mantendo os dados armazenados localmente e com possibilidade de evolução futura para exportações, backups, auditoria e integração com outros sistemas.

## Objetivo

O objetivo do Notar é centralizar o fluxo operacional de:

- cadastro de doadores e demandas;
- importação mensal das planilhas da Nota Fiscal Paulista;
- cruzamento automático dos CPFs importados com os doadores cadastrados;
- cálculo do valor de abatimento com base na quantidade de notas e no valor por nota informado na própria importação;
- acompanhamento mensal do que está pendente ou já foi realizado no sistema externo de abatimento.

## Como o sistema funciona hoje

O fluxo principal atual é este:

1. cadastrar as demandas existentes;
2. cadastrar os doadores com nome, CPF, demanda e mês/ano de início das doações;
3. importar uma planilha mensal da Nota Fiscal Paulista em formato `CSV`, `TXT` ou `XLSX`;
4. informar o mês de referência e o valor por nota daquele arquivo;
5. escolher a coluna de CPF após a pré-visualização da planilha;
6. deixar o sistema consolidar as notas por CPF, identificar quais CPFs já pertencem a doadores e gerar o resumo mensal;
7. acompanhar na tela de gestão mensal o valor a ser abatido por doador e marcar manualmente se o abatimento está `pendente` ou `realizado`.

Ponto importante:

- o `valor por nota` não é mais controlado por uma tabela de regras históricas;
- ele é definido diretamente no momento da importação;
- depois disso, o valor daquele mês fica fechado no histórico da importação e do resumo mensal.

Se houver erro no valor informado, o caminho correto é:

1. excluir a importação;
2. importar novamente a planilha com o valor correto.

Isso simplifica bastante o sistema e evita recalcular meses antigos de forma confusa.

## Arquitetura atual

### Frontend

- React 19
- Vite 8
- React Router DOM 7
- Tailwind CSS 4
- ESLint 9

### Dados e processamento

- DuckDB WASM no navegador como fonte principal de dados;
- leitura e agregação local das planilhas;
- armazenamento local no próprio ambiente do navegador;
- sem Zustand no fluxo atual.

## Estrutura principal

```text
src/
  components/
    layout/
    ui/
  pages/
  routes/
  services/
  styles/
  utils/
```

## Módulos do sistema

### Doadores

Permite:

- cadastrar doadores;
- formatar CPF no padrão brasileiro;
- vincular cada doador a uma demanda já cadastrada;
- informar o início das doações por mês e ano;
- buscar por nome, CPF e demanda;
- reconciliar importações antigas quando um novo doador é cadastrado.

Quando um CPF que já apareceu em importações anteriores passa a ser cadastrado como doador, o sistema revisa as importações e atualiza os resumos mensais correspondentes.

### Demandas

Permite:

- cadastrar demandas;
- listar e filtrar demandas;
- usar a demanda como seleção obrigatória no cadastro de doadores.

### Importações

Permite:

- importar arquivos `CSV`, `TXT` ou `XLSX`;
- visualizar as primeiras linhas antes do processamento;
- detectar e selecionar a coluna de CPF;
- informar o mês de referência;
- informar o valor por nota daquele arquivo;
- consolidar a quantidade de notas por CPF;
- registrar quais CPFs já são doadores e quais ainda não estão cadastrados.

Além disso, a tela mostra:

- histórico das importações;
- valor por nota usado em cada importação;
- total de linhas processadas;
- total de linhas compatíveis com doadores cadastrados;
- total de doadores encontrados;
- destaque visual para CPFs ainda não cadastrados.

### Gestão Mensal

Permite:

- visualizar o resumo mensal consolidado;
- filtrar por mês, nome, CPF, demanda e status;
- ver quantidade de notas, valor por nota e valor total de abatimento;
- marcar o abatimento como `pendente` ou `realizado`.

O valor exibido nessa tela é sempre o valor salvo na importação correspondente. Isso evita mudanças retroativas no histórico.

### Dashboard

Existe como base visual e estrutural, mas ainda pode evoluir para indicadores mais completos, como:

- total de doadores;
- total de notas por mês;
- total de abatimento do mês;
- rankings de doadores;
- indicadores por demanda.

### Configurações

Hoje concentra os recursos de armazenamento e segurança operacional, como:

- conexão com arquivo local de dados;
- exportação de backup em `JSON`;
- importação de backup;
- base para evoluções futuras, como auditoria e preferências.

## Modelo de dados atual

As tabelas principais do projeto hoje são:

- `demands`
- `donors`
- `imports`
- `import_cpf_summary`
- `monthly_donor_summary`

Resumo do papel de cada uma:

- `demands`: guarda os grupos ou demandas da ONG;
- `donors`: guarda os doadores cadastrados e seus dados base;
- `imports`: registra cada planilha importada, incluindo `mês de referência` e `valor por nota`;
- `import_cpf_summary`: guarda os CPFs encontrados em cada importação e a quantidade de notas por CPF;
- `monthly_donor_summary`: guarda o consolidado mensal por doador, com quantidade de notas, valor por nota, valor de abatimento e status manual.

## Estado atual do projeto

Hoje o sistema já possui:

- layout principal com sidebar e cabeçalho;
- roteamento funcionando;
- persistência local com DuckDB e arquivo de dados em `JSON`;
- cadastro real de demandas e doadores;
- importação real de planilhas `CSV`, `TXT` e `XLSX`;
- reconciliação retroativa entre doadores e importações antigas;
- filtros separados e combináveis nas principais telas;
- resumo mensal com valor fechado por importação;
- marcação manual de status do abatimento;
- exportação e importação de backup;
- estados vazios e feedbacks visuais nas abas.

## Funcionalidades em evolução

Ainda há bastante espaço para crescimento. Entre os próximos passos possíveis:

- dashboard com indicadores reais;
- relatórios em `CSV` ou `Excel`;
- histórico de ações e auditoria;
- melhorias de usabilidade para conferência mensal;
- futura integração com sistemas externos de abatimento.

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

### Testes automatizados

```bash
npm run test
```

## Observações importantes

- o projeto roda localmente e usa DuckDB WASM no navegador;
- a importação real atual está preparada para `CSV`, `TXT` e `XLSX`;
- o valor por nota é informado no momento da importação e passa a fazer parte do histórico daquele mês;
- para corrigir uma importação, o fluxo recomendado é excluir e importar novamente;
- o arquivo legado `src/services/ruleService.js` ficou apenas como resíduo neutralizado do processo de refatoração, sem papel ativo no fluxo atual, porque o ambiente bloqueou a exclusão física do arquivo.
