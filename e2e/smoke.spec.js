import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

test("main flow smoke test", async ({ page }) => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await page.goto("/");
  await expect(page.getByText("Nenhum arquivo de dados conectado")).toBeVisible();

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  await page.getByRole("dialog", { name: "Adicionar demanda" }).getByPlaceholder("Nome da demanda").fill("Demanda Teste");
  await page.getByRole("dialog", { name: "Adicionar demanda" }).getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("DEMANDA TESTE")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  let donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Maria Silva");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("12345678909");
  await selectOption(page, donorDialog, "demand", "DEMANDA TESTE");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar doador" }).click();
  donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await selectOption(page, donorDialog, "donorType", "Auxiliar");
  await selectOption(page, donorDialog, "holderPersonId", /MARIA SILVA/);
  await donorDialog.locator('input[name="name"]').fill("Joao Auxiliar");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("98765432100");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByRole("button", { name: "JOAO AUXILIAR" })).toBeVisible();

  await page.getByRole("button", { name: "Perfil" }).first().click();
  await expect(page.getByText("Perfil completo do doador")).toBeVisible();
  await page.getByRole("button", { name: "Voltar para doadores" }).click();

  await page.getByRole("link", { name: "Importações" }).click();
  await page.getByRole("button", { name: "Nova importação" }).click();
  const importSection = page.getByRole("dialog", { name: "Nova importação" });
  await importSection.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await importSection.locator('input[name="referenceMonth"]').fill("03/2026");
  await importSection.locator('input[name="valuePerNote"]').fill("0.50");
  await expect(
    importSection.locator('[data-select-name="cpfColumn"]').getByRole("button", { name: "CPF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("nfp-sample.csv")).toBeVisible();
  await expect(page.getByRole("button", { name: "JOAO AUXILIAR" }).first()).toBeVisible();
  await expect(page.getByText("Vinculado a: MARIA SILVA").first()).toBeVisible();

  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const monthlySection = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await monthlySection.locator('input[name="referenceMonth"]').fill("03/2026");
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await expect(page.getByText("JOAO AUXILIAR").first()).toBeVisible();
  await expect(page.getByText(/^R\$\s*1,00$/, { exact: true })).toBeVisible();
  await expect(page.getByText(/^R\$\s*0,50$/, { exact: true }).first()).toBeVisible();
  await selectOption(page, monthlySection, "demand", "DEMANDA TESTE");
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await page.getByRole("button", { name: /Março de 2026/i }).click();
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
});

test("old auxiliary donor model is migrated from backup", async ({ page }) => {
  const oldBackupPath = fileURLToPath(
    new URL("./fixtures/old-model-backup.json", import.meta.url),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.locator('input[type="file"]').setInputFiles(oldBackupPath);
  await page.getByRole("button", { name: "Importar backup" }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog.getByRole("button", { name: "Restaurar backup" }).click({ force: true });
  await expect(page.getByText("Backup importado com sucesso")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "JOAO AUXILIAR" })).toBeVisible();
  const auxiliaryCard = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "JOAO AUXILIAR" }) })
    .first();
  await expect(auxiliaryCard.getByText("Vinculado a")).toBeVisible();
  await expect(auxiliaryCard.getByText("MARIA SILVA")).toBeVisible();

  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const monthlySection = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await monthlySection.locator('input[name="referenceMonth"]').fill("03/2026");
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await expect(page.getByText("JOAO AUXILIAR").first()).toBeVisible();
  await expect(page.getByText(/^R\$\s*1,00$/, { exact: true })).toBeVisible();
  await expect(page.getByText(/^R\$\s*0,50$/, { exact: true }).first()).toBeVisible();
});
