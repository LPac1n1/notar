import { test } from "node:test";
import assert from "node:assert/strict";
import { detectOrderStatusColumn } from "../src/utils/import.js";

/**
 * Detecção da coluna de status do pedido.
 *
 * Sem ela o pipeline trata TODA linha como doação válida: a contagem de
 * "notas não encontradas" fica zero e o total de notas fica inflado — e isso
 * acontecia em silêncio, sem nada na tela indicando que a coluna não tinha
 * sido reconhecida.
 */
test("recognizes the order-status header in the spellings NFP exports use", () => {
  const grafias = [
    "Status do Pedido",
    "STATUS DO PEDIDO",
    "Status Pedido",
    "Situação do Pedido",
    "Situacao do Pedido",
    "Situação",
    "Status",
  ];

  for (const grafia of grafias) {
    assert.equal(
      detectOrderStatusColumn(["CPF", grafia, "Valor da Nota"]),
      grafia,
      `não reconheceu "${grafia}"`,
    );
  }
});

test("does not mistake unrelated columns for the order status", () => {
  // Nenhuma outra coluna da planilha de doações tem "status" no nome; o
  // teste trava isso para o dia em que uma aparecer.
  assert.equal(
    detectOrderStatusColumn([
      "CPF",
      "CNPJ Estabelecimento",
      "Número da Nota",
      "Valor da Nota",
      "Data da Nota",
      "Tipo da Doação",
    ]),
    "",
  );
});
