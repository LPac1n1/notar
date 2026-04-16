import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("button", { name: label }).first().click();
}

test("main flow smoke test", async ({ page }) => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await page.goto("/");
  await expect(page.getByText("Nenhum arquivo de dados conectado")).toBeVisible();

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByPlaceholder("Nome da demanda").fill("Demanda Teste");
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("Demanda Teste")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  const donorForm = page
    .getByRole("heading", { name: "Novo doador" })
    .locator("xpath=ancestor::section[1]");
  await donorForm.locator('input[name="name"]').fill("Maria Silva");
  await donorForm.getByPlaceholder("CPF", { exact: true }).fill("12345678909");
  await selectOption(page, donorForm, "demand", "Demanda Teste");
  await donorForm.locator('input[name="donationStartDate"]').fill("2026-01");
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByText("Maria Silva")).toBeVisible();

  await page.getByRole("link", { name: "Importações" }).click();
  const importSection = page
    .getByRole("heading", { name: "Nova importação" })
    .locator("xpath=ancestor::section[1]");
  await importSection.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await importSection.locator('input[name="referenceMonth"]').fill("2026-03");
  await importSection.locator('input[name="valuePerNote"]').fill("0.50");
  await expect(
    importSection.locator('[data-select-name="cpfColumn"]').getByRole("button", { name: "CPF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("nfp-sample.csv")).toBeVisible();
  await expect(page.getByText("CPF ainda nao cadastrado")).toBeVisible();

  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const monthlySection = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await monthlySection.locator('input[name="referenceMonth"]').fill("2026-03");
  await expect(page.getByText("Maria Silva")).toBeVisible();
  await expect(page.getByText(/^R\$\s*1,00$/, { exact: true })).toBeVisible();
  await selectOption(page, monthlySection, "demand", "Demanda Teste");
  await expect(page.getByText("Maria Silva")).toBeVisible();
  await page.getByRole("button", { name: /Março de 2026/i }).click();
  await expect(page.getByText("Selecione um mês para começar")).toBeVisible();
});
