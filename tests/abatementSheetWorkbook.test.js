import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  ABATEMENT_TEMPLATE,
  buildAbatementWorkbookBytes,
  toCompetenceDate,
} from "../src/services/monthly/abatementSheetWorkbook.js";

/**
 * A planilha de abatimento tem de sair no formato que o sistema de baixa lê.
 *
 * O modelo real está em `tests/fixtures/base-extrato-modelo.xlsx` — é o arquivo
 * que o usuário forneceu. Os testes comparam o que geramos CONTRA ELE, em vez
 * de contra uma descrição do formato: uma descrição pode estar errada desde o
 * começo, e o arquivo não.
 *
 * A estrutura não é uma tabela simples. São três parâmetros no topo, uma nota
 * mesclada em D1:E3, duas linhas em branco e só então o cabeçalho das colunas
 * na linha 6. Errar qualquer uma dessas posições faz o destino ler a planilha
 * inteira deslocada.
 */

const MODELO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "base-extrato-modelo.xlsx",
);

const LINHAS = [
  {
    cpf: "529.982.247-25",
    donorName: "ANA MARIA DE SOUZA",
    notesCount: 12,
    description: "Doações NFP - Abr/2026",
  },
  {
    cpf: "011.444.777-35",
    donorName: "BRUNO SILVA",
    notesCount: 5,
    description: "Doações NFP - BRUNO SILVA - Abr/2026",
  },
];

async function carregarModelo() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(MODELO);
  return workbook.worksheets[0];
}

async function gerar(options = {}) {
  const bytes = await buildAbatementWorkbookBytes({
    rows: LINHAS,
    referenceMonth: "2026-04-01",
    ...options,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook.worksheets[0];
}

function textoDe(valor) {
  if (valor && typeof valor === "object" && Array.isArray(valor.richText)) {
    return valor.richText.map((parte) => parte.text).join("");
  }

  return valor;
}

test("o bloco de cabeçalho reproduz o modelo célula a célula", async () => {
  const modelo = await carregarModelo();
  const gerado = await gerar();

  // Endereços conferidos contra o modelo: mudar qualquer um desloca a leitura
  // do sistema de destino.
  const enderecos = ["A1", "B1", "A2", "B2", "A3", "B3", "D1"];

  for (const endereco of enderecos) {
    assert.deepEqual(
      textoDe(gerado.getCell(endereco).value),
      textoDe(modelo.getCell(endereco).value),
      `${endereco} divergiu do modelo`,
    );
  }

  // O marcador escondido na coluna 235 da linha 3. Não é decoração conhecida —
  // é reproduzido porque o destino pode consultá-lo, e removê-lo faria a
  // importação falhar sem explicação visível.
  assert.equal(
    gerado.getCell(3, ABATEMENT_TEMPLATE.markerColumn).value,
    modelo.getCell(3, ABATEMENT_TEMPLATE.markerColumn).value,
  );
});

test("o cabeçalho das colunas fica na linha 6, com os mesmos rótulos", async () => {
  const modelo = await carregarModelo();
  const gerado = await gerar();

  for (let coluna = 1; coluna <= ABATEMENT_TEMPLATE.columns.length; coluna += 1) {
    assert.equal(
      gerado.getCell(ABATEMENT_TEMPLATE.headerRow, coluna).value,
      modelo.getCell(ABATEMENT_TEMPLATE.headerRow, coluna).value,
      `coluna ${coluna} do cabeçalho divergiu`,
    );
  }

  // As linhas 4 e 5 existem em branco no modelo. Preenchê-las empurraria os
  // dados uma linha e o destino leria o cabeçalho como registro.
  for (const linha of [4, 5]) {
    for (let coluna = 1; coluna <= 5; coluna += 1) {
      assert.equal(
        gerado.getCell(linha, coluna).value ?? null,
        null,
        `L${linha}C${coluna} deveria estar vazia`,
      );
    }
  }
});

test("a planilha, a mesclagem e as larguras são as do modelo", async () => {
  const modelo = await carregarModelo();
  const gerado = await gerar();

  assert.equal(gerado.name, modelo.name);
  assert.deepEqual(gerado.model.merges, modelo.model.merges);

  for (let coluna = 1; coluna <= ABATEMENT_TEMPLATE.columns.length; coluna += 1) {
    assert.equal(
      gerado.getColumn(coluna).width,
      modelo.getColumn(coluna).width,
      `largura da coluna ${coluna} divergiu`,
    );
  }
});

test("cada doador vira uma linha a partir da 7", async () => {
  const gerado = await gerar();

  const primeira = gerado.getRow(7);
  assert.equal(primeira.getCell(2).value, 12, "VALOR é a quantidade de doações");
  assert.equal(primeira.getCell(3).value, "Doações NFP - Abr/2026");
  assert.equal(primeira.getCell(4).value, "ANA MARIA DE SOUZA");
  assert.equal(primeira.getCell(5).value, "529.982.247-25");

  const segunda = gerado.getRow(8);
  assert.equal(segunda.getCell(2).value, 5);
  assert.equal(segunda.getCell(4).value, "BRUNO SILVA");

  // Nada além das duas linhas de dado.
  assert.equal(gerado.getCell(9, 4).value ?? null, null);
});

test("a data é a competência, e não o dia da geração", async () => {
  const gerado = await gerar();
  const celula = gerado.getCell(7, 1);

  // Precisa ser data de verdade, não texto: a coluna se chama DATA e entra na
  // chave única do destino.
  assert.ok(celula.value instanceof Date, "a célula deveria conter uma data");
  assert.equal(celula.value.toISOString().slice(0, 10), "2026-04-01");
  assert.equal(celula.numFmt, "dd/mm/yyyy");
});

test("a data não desliza de dia por causa do fuso", () => {
  // Construir a data em horário local faria, em UTC-3, o valor virar as 03:00
  // do dia anterior — e a planilha mostraria o último dia do mês anterior.
  // É o mesmo defeito que já apareceu na formatação de datas da interface.
  for (const mes of ["2026-01-01", "2026-04-01", "2025-12-01"]) {
    assert.equal(
      toCompetenceDate(mes).toISOString().slice(0, 10),
      mes,
      `${mes} deslizou de dia`,
    );
  }

  assert.equal(toCompetenceDate(""), null);
  assert.equal(toCompetenceDate("qualquer coisa"), null);
});

test("gerar duas vezes o mesmo mês produz a mesma chave única", async () => {
  // A chave do destino é (Agencia, Conta, Cod. Banco, Data, Valor, Nome). Se a
  // data viesse do dia da geração, reexportar o mesmo mês criaria lançamentos
  // novos em vez de o destino reconhecer os mesmos.
  const primeira = await gerar();
  const segunda = await gerar();

  const chave = (planilha) =>
    [7, 8]
      .map((linha) =>
        [1, 2, 4]
          .map((coluna) => {
            const valor = planilha.getCell(linha, coluna).value;
            return valor instanceof Date ? valor.toISOString() : valor;
          })
          .join("|"),
      )
      .join("\n");

  assert.equal(chave(primeira), chave(segunda));
});

test("sem doador nenhum, a planilha sai só com o cabeçalho", async () => {
  const gerado = await gerar({ rows: [] });

  assert.equal(gerado.getCell(ABATEMENT_TEMPLATE.headerRow, 1).value, "DATA");
  assert.equal(gerado.getCell(7, 1).value ?? null, null);
});
