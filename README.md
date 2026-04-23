# Notar

Sistema web local e portátil para apoiar a gestão dos abatimentos da Nota Fiscal Paulista em uma ONG que atua com demandas de moradia.

O foco do projeto é reduzir trabalho manual, evitar erros operacionais, manter histórico confiável e facilitar a conferência mensal dos valores que devem ser abatidos para cada doador cadastrado.

## Contexto do projeto

A ONG trabalha com pessoas vinculadas a demandas de moradia e recebe doações de notas fiscais por meio da Nota Fiscal Paulista. Para incentivar a participação, cada doador cadastrado pode receber abatimentos calculados a partir da quantidade de notas fiscais doadas em determinado mês.

O sistema diferencia titulares e auxiliares. Titulares representam os cadastros principais vinculados diretamente a uma demanda. Auxiliares também têm cadastro, CPF e abatimento próprios, mas podem ficar vinculados informativamente a um titular para manter o contexto operacional da ONG. Esse vínculo não transfere nem soma abatimentos: cada doador mantém seu próprio resumo mensal.

O sistema foi pensado para uso local, simples e portátil, sem depender de instalação complexa ou infraestrutura de servidor. A proposta é que ele possa funcionar em qualquer computador, mantendo os dados armazenados localmente e com possibilidade de evolução futura para exportações, backups, auditoria e integração com outros sistemas.

## Objetivo

O objetivo do Notar é centralizar o fluxo operacional de:

- cadastro de titulares, auxiliares e demandas;
- importação mensal das planilhas da Nota Fiscal Paulista;
- cruzamento automático dos CPFs importados com os CPFs dos doadores cadastrados;
- cálculo do valor de abatimento com base na quantidade de notas e no valor por nota informado na própria importação;
- acompanhamento mensal do que está pendente ou já foi realizado no sistema externo de abatimento.

## Como o sistema funciona hoje

O fluxo principal atual é este:

1. cadastrar as demandas existentes;
2. cadastrar os titulares com nome, CPF, demanda e mês/ano de início das doações;
3. opcionalmente, cadastrar auxiliares com seus próprios CPFs e vinculá-los informativamente a um titular;
4. importar uma planilha mensal da Nota Fiscal Paulista em formato `CSV`, `TXT` ou `XLSX`;
5. informar o mês de referência e o valor por nota daquele arquivo;
6. escolher a coluna de CPF após a pré-visualização da planilha;
7. deixar o sistema consolidar as notas por CPF, identificar quais CPFs pertencem a doadores cadastrados e gerar o resumo mensal;
8. acompanhar na tela de gestão mensal o valor a ser abatido por doador e marcar manualmente se o abatimento está `pendente` ou `realizado`.

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

- DuckDB WASM no navegador como motor local de processamento;
- leitura e agregação local das planilhas;
- persistência em arquivo local `JSON` conectado manualmente;
- backup e restauração em `JSON`;
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

### Doadores, titulares e auxiliares

Permite:

- cadastrar titulares;
- cadastrar auxiliares com abatimento próprio;
- formatar CPF no padrão brasileiro;
- vincular cada titular a uma demanda já cadastrada;
- vincular auxiliares informativamente a titulares;
- informar o início das doações por mês e ano;
- abrir um perfil completo do doador;
- visualizar histórico mensal e totais de cada titular ou auxiliar;
- buscar por nome, CPF e demanda;
- reconciliar importações antigas quando um novo titular ou auxiliar é cadastrado.

Quando um CPF que já apareceu em importações anteriores passa a pertencer a um doador cadastrado, o sistema revisa as importações e atualiza os resumos mensais correspondentes.

### Demandas

Permite:

- cadastrar demandas;
- listar e filtrar demandas;
- usar a demanda como seleção obrigatória no cadastro de titulares.

### Importações

Permite:

- importar arquivos `CSV`, `TXT` ou `XLSX`;
- visualizar as primeiras linhas antes do processamento;
- detectar e selecionar a coluna de CPF;
- informar o mês de referência;
- informar o valor por nota daquele arquivo;
- consolidar a quantidade de notas por CPF;
- registrar quais CPFs já pertencem a doadores cadastrados e quais ainda não estão vinculados.

Além disso, a tela mostra:

- histórico das importações;
- valor por nota usado em cada importação;
- total de linhas processadas;
- total de linhas compatíveis com CPFs vinculados;
- total de doadores encontrados;
- destaque visual para CPFs ainda não vinculados.

### Gestão Mensal

Permite:

- visualizar o resumo mensal consolidado;
- filtrar por mês, doador, CPF de origem, demanda e status;
- ver quantidade de notas, valor por nota e valor total de abatimento;
- marcar o abatimento como `pendente` ou `realizado`.

O valor exibido nessa tela é sempre o valor salvo na importação correspondente. Titulares e auxiliares aparecem com abatimentos separados. Quando um auxiliar está vinculado a um titular, esse vínculo aparece apenas como informação de contexto.

### Dashboard

Mostra indicadores reais do sistema, incluindo doadores, demandas, importações, último mês importado, rankings, distribuição por demanda e pontos para revisar.

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
- `donor_cpf_links`
- `imports`
- `import_cpf_summary`
- `monthly_donor_summary`
- `trash_items`

Resumo do papel de cada uma:

- `demands`: guarda os grupos ou demandas da ONG;
- `donors`: guarda titulares e auxiliares cadastrados, incluindo o vínculo informativo entre auxiliar e titular;
- `donor_cpf_links`: guarda os CPFs usados na conciliação de notas para cada doador;
- `imports`: registra cada planilha importada, incluindo `mês de referência` e `valor por nota`;
- `import_cpf_summary`: guarda os CPFs encontrados em cada importação e a quantidade de notas por CPF;
- `monthly_donor_summary`: guarda o consolidado mensal por doador, com quantidade de notas, valor por nota, valor de abatimento e status manual;
- `trash_items`: guarda itens removidos que podem ser restaurados.

## Estado atual do projeto

Hoje o sistema já possui:

- layout principal com sidebar e cabeçalho;
- roteamento funcionando;
- persistência local com DuckDB e arquivo de dados em `JSON`;
- cadastro real de demandas, titulares e auxiliares;
- importação real de planilhas `CSV`, `TXT` e `XLSX`;
- reconciliação retroativa entre CPFs vinculados e importações antigas;
- filtros separados e combináveis nas principais telas;
- resumo mensal com valor fechado por importação;
- perfil do doador com vínculo informativo, histórico e totais;
- marcação manual de status do abatimento;
- exportação e importação de backup;
- estados vazios e feedbacks visuais nas abas.

## Funcionalidades em evolução

Ainda há bastante espaço para crescimento. Entre os próximos passos possíveis:

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

- o projeto roda localmente e usa DuckDB WASM para processar dados no navegador;
- a persistência principal depende de conectar um arquivo de dados local em `Configurações`;
- a importação real atual está preparada para `CSV`, `TXT` e `XLSX`;
- o valor por nota é informado no momento da importação e passa a fazer parte do histórico daquele mês;
- titulares e auxiliares têm abatimentos separados; o vínculo do auxiliar com um titular é apenas informativo;
- para corrigir uma importação, o fluxo recomendado é excluir e importar novamente.
