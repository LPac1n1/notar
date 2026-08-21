import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";

/**
 * A planilha de abatimento baixada pelo app abre no formato que o sistema de
 * baixa espera.
 *
 * O teste de unidade já compara o gerador com o modelo real, mas ele exercita a
 * função direto. Aqui o arquivo passa pelo caminho completo — consulta no
 * DuckDB do navegador, montagem do .xlsx e download — e é aberto de volta. É a
 * diferença entre "a função monta certo" e "o arquivo que a pessoa baixa está
 * certo".
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
test("o arquivo baixado tem o cabeçalho do modelo e uma linha por doador", async ({
  page,
}) => {
  const backupPath = fileURLToPath(
    new URL("./fixtures/moradia-credit-backup.json", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible({
    timeout: 120000,
  });

  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const secao = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await secao.locator('input[name="referenceMonth"]').fill("01/2026");

  const download = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "Planilha de abatimento" }).click();
  const arquivo = await download;

  // A fixture tem uma demanda só, então baixa a planilha direta em vez do zip.
  expect(arquivo.suggestedFilename()).toMatch(/\.xlsx$/);

  const destino = path.join(os.tmpdir(), "notar-abatimento-e2e.xlsx");
  await arquivo.saveAs(destino);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(destino);
  const planilha = workbook.worksheets[0];

  // Bloco de parâmetros do modelo.
  expect(planilha.name).toBe("Planilha1");
  expect(planilha.getCell("A1").value).toBe("AGENCA");
  expect(planilha.getCell("B1").value).toBe(0);
  expect(planilha.getCell("A3").value).toBe("COD. BANCO");
  expect(planilha.getCell("B3").value).toBe("NFP2607");

  // Cabeçalho na linha 6, dados a partir da 7.
  expect(planilha.getCell("A6").value).toBe("DATA");
  expect(planilha.getCell("B6").value).toBe("VALOR");
  expect(planilha.getCell("C6").value).toBe("DESCRIÇÃO");
  expect(planilha.getCell("D6").value).toBe("NOME");
  expect(planilha.getCell("E6").value).toBe("CPF");

  const primeira = planilha.getRow(7);
  expect(primeira.getCell(4).value).toBeTruthy();
  // VALOR é a quantidade de doações — número, para o destino somar.
  expect(typeof primeira.getCell(2).value).toBe("number");
  expect(primeira.getCell(2).value).toBeGreaterThan(0);
  // A data é a competência escolhida, não o dia da geração.
  expect(primeira.getCell(1).value instanceof Date).toBe(true);
  expect(primeira.getCell(1).value.toISOString().slice(0, 10)).toBe("2026-01-01");
  // A descrição já sai pronta no texto que o destino espera.
  expect(String(primeira.getCell(3).value)).toContain("Doações NFP");
});
