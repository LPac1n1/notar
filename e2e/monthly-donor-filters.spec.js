import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("button", { name: label }).first().click();
}

test("monthly management shows donors with and without donations", async ({ page }) => {
  const backupPath = fileURLToPath(
    new URL("./fixtures/monthly-donor-filters-backup.json", import.meta.url),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar backup" }).click();

  const restoreDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado com sucesso")).toBeVisible();

  await page.getByRole("link", { name: "Gestão Mensal" }).click();

  const monthlySection = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");

  await monthlySection.locator('input[name="referenceMonth"]').fill("03/2026");

  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CARLOS SOUZA" })).toBeVisible();
  await expect(page.getByText("Com doação no mês")).toBeVisible();
  await expect(page.getByText("Sem doação no mês")).toBeVisible();
  await expect(page.getByText(/^Doou no mês$/)).toBeVisible();
  await expect(page.getByText(/^Não doou no mês$/)).toBeVisible();
  await expect(page.getByText("Sem doações no mês")).toBeVisible();
  await expect(page.getByText("Nenhum abatimento gerado")).toBeVisible();

  await selectOption(page, monthlySection, "donationActivity", "Doaram no mês");
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CARLOS SOUZA" })).toHaveCount(0);

  await selectOption(
    page,
    monthlySection,
    "donationActivity",
    "Não doaram no mês",
  );
  await expect(page.getByRole("button", { name: "CARLOS SOUZA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toHaveCount(0);
  await expect(
    monthlySection
      .locator('[data-select-name="abatementStatus"]')
      .getByRole("button")
      .first(),
  ).toBeDisabled();

  await selectOption(
    page,
    monthlySection,
    "donationActivity",
    "Todos os doadores",
  );
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CARLOS SOUZA" })).toBeVisible();
});
