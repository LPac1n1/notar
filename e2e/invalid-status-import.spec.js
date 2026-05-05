import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

test("imports drop invalid status rows and report them per donor", async ({
  page,
}) => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/nfp-with-invalid-status.csv", import.meta.url),
  );

  await page.goto("/");
  await expect(
    page.getByText("Nenhum arquivo de dados conectado"),
  ).toBeVisible();

  // Cadastra demanda mínima
  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Demanda Teste");
  await demandDialog
    .getByRole("button", { name: "Adicionar demanda" })
    .click();
  await expect(page.getByText("DEMANDA TESTE")).toBeVisible();

  // Cadastra doador titular
  await page.getByRole("link", { name: "Doadores" }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Maria Silva");
  await donorDialog
    .getByPlaceholder("CPF", { exact: true })
    .fill("12345678909");
  await selectOption(page, donorDialog, "demand", "DEMANDA TESTE");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();

  // Importa a planilha com 2 válidas + 3 inválidas
  await page.getByRole("link", { name: "Importações" }).click();
  await page.getByRole("button", { name: "Nova importação" }).click();
  const importSection = page.getByRole("dialog", { name: "Nova importação" });
  await importSection.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await importSection.locator('input[name="referenceMonth"]').fill("03/2026");
  await importSection.locator('input[name="valuePerNote"]').fill("0.50");
  await expect(
    importSection
      .locator('[data-select-name="cpfColumn"]')
      .getByRole("button", { name: "CPF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("nfp-with-invalid-status.csv")).toBeVisible();

  // Vai para Gestão Mensal e seleciona o mês
  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const monthlySection = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await monthlySection
    .locator('input[name="referenceMonth"]')
    .fill("03/2026");
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();

  // Indicador de notas inválidas deve aparecer
  await expect(
    page.getByText("3 nota(s) descartada(s) por status do pedido inválido."),
  ).toBeVisible();

  // E o total de notas válidas deve ser 2 (não 5)
  // O abatimento total = 2 * R$ 0,50 = R$ 1,00
  await expect(
    page.getByText(/^R\$\s*1,00$/, { exact: true }).first(),
  ).toBeVisible();
});
