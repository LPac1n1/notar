import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

test("auxiliary donor can link to a reference person who is not an active donor", async ({ page }) => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await page.goto("/");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Demanda Conversao");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("DEMANDA CONVERSAO")).toBeVisible();

  await page.getByRole("link", { name: "Pessoas" }).click();
  await page.getByRole("button", { name: "Adicionar pessoa" }).click();
  const personDialog = page.getByRole("dialog", { name: "Adicionar pessoa" });
  await personDialog.getByPlaceholder("Nome da pessoa").fill("Carlos Referencia");
  await personDialog.getByPlaceholder("CPF").fill("11122233344");
  await personDialog.getByRole("button", { name: "Adicionar pessoa" }).click();
  await expect(page.getByText("CARLOS REFERENCIA")).toBeVisible();
  await expect(page.getByText("Pessoa de referência")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await selectOption(page, donorDialog, "donorType", "Auxiliar");
  await selectOption(
    page,
    donorDialog,
    "holderPersonId",
    /CARLOS REFERENCIA/,
  );
  await donorDialog.locator('input[name="name"]').fill("Joao Auxiliar");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("98765432100");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();

  const auxiliaryCard = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "JOAO AUXILIAR" }) })
    .first();
  await expect(auxiliaryCard.getByText("Vinculado a")).toBeVisible();
  await expect(auxiliaryCard.getByText("CARLOS REFERENCIA")).toBeVisible();
  await expect(auxiliaryCard.getByText("Pessoa de referência")).toBeVisible();
  await auxiliaryCard.getByRole("button", { name: "Perfil" }).click();

  await expect(page.getByText("Perfil completo do doador")).toBeVisible();
  await expect(page.getByText("CARLOS REFERENCIA")).toBeVisible();
  await expect(page.getByText("Pessoa de referência")).toBeVisible();

  await page.getByRole("link", { name: "Importações" }).click();
  await page.getByRole("button", { name: "Nova importação" }).click();
  const importDialog = page.getByRole("dialog", { name: "Nova importação" });
  await importDialog.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await importDialog.locator('input[name="referenceMonth"]').fill("03/2026");
  await importDialog.locator('input[name="valuePerNote"]').fill("0.50");
  await expect(
    importDialog.locator('[data-select-name="cpfColumn"]').getByRole("button", { name: "CPF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("JOAO AUXILIAR").first()).toBeVisible();
  await expect(page.getByText("Vinculado a: CARLOS REFERENCIA").first()).toBeVisible();
  await expect(page.getByText("Pessoa de referência").first()).toBeVisible();

  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const monthlySection = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await monthlySection.locator('input[name="referenceMonth"]').fill("03/2026");
  await expect(page.getByRole("button", { name: "JOAO AUXILIAR" })).toBeVisible();
  await expect(page.getByText("Vinculado a: CARLOS REFERENCIA").first()).toBeVisible();
  await expect(page.getByText("Pessoa de referência").first()).toBeVisible();

  await page.getByRole("link", { name: "Pessoas" }).click();
  const referenceCard = page.locator("li").filter({ hasText: "CARLOS REFERENCIA" }).first();
  await referenceCard.getByRole("button", { name: "Converter" }).click();
  const convertDialog = page.getByRole("dialog", {
    name: "Converter pessoa em doador",
  });
  await expect(convertDialog.locator('input[name="name"]')).toHaveValue("CARLOS REFERENCIA");
  await expect(convertDialog.getByText("conversão como auxiliar")).toBeVisible();
  await selectOption(page, convertDialog, "demand", "DEMANDA CONVERSAO");
  await convertDialog.locator('input[name="donationStartDate"]').fill("02/2026");
  await convertDialog.getByRole("button", { name: "Converter em doador" }).click();
  await expect(page.getByText("Pessoa convertida em doador")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  const convertedHolderCard = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "CARLOS REFERENCIA" }) })
    .first();
  await expect(convertedHolderCard.getByText("Titular")).toBeVisible();
  await expect(convertedHolderCard.getByText("DEMANDA CONVERSAO")).toBeVisible();
  await expect(convertedHolderCard.getByText("1 auxiliar(es)")).toBeVisible();
  await expect(convertedHolderCard.getByText("JOAO AUXILIAR")).toBeVisible();
});
