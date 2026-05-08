import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

async function expectClipboardText(page, value) {
  await expect
    .poll(async () => {
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      return clipboardText.replace(/\r\n/g, "\n");
    })
    .toBe(value.replace(/\r\n/g, "\n"));
}

test("import CPF copy buttons copy the expected CPF", async ({
  context,
  page,
}) => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Demanda Copy");
  await demandDialog
    .getByRole("button", { name: "Adicionar demanda" })
    .click();
  await expect(page.getByText("DEMANDA COPY")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Maria Copy");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("12345678909");
  await selectOption(page, donorDialog, "demand", "DEMANDA COPY");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByRole("button", { name: "MARIA COPY" })).toBeVisible();

  await page.getByRole("link", { name: "Importações" }).click();
  await page.getByRole("button", { name: "Nova importação" }).click();
  const importDialog = page.getByRole("dialog", { name: "Nova importação" });
  await importDialog.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await importDialog.locator('input[name="referenceMonth"]').fill("03/2026");
  await importDialog.locator('input[name="valuePerNote"]').fill("0.50");
  await expect(
    importDialog
      .locator('[data-select-name="cpfColumn"]')
      .getByRole("button", { name: "CPF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("nfp-sample.csv")).toBeVisible();

  const cpfSummarySection = page
    .getByRole("heading", { name: "CPFs encontrados" })
    .locator("xpath=ancestor::section[1]");
  const summaryCopyButton = cpfSummarySection
    .getByRole("button", { name: "Copiar CPF" })
    .first();

  await summaryCopyButton.click();
  await expect(summaryCopyButton).toHaveAttribute("data-copy-state", "copied");
  await expectClipboardText(page, "123.456.789-09");

  await cpfSummarySection
    .getByRole("button", { name: "Ver meses e arquivos" })
    .first()
    .click();
  const detailsDialog = page.getByRole("dialog", {
    name: "Meses e arquivos do CPF",
  });
  const detailsCopyButton = detailsDialog
    .getByRole("button", { name: "Copiar CPF" })
    .first();

  await detailsCopyButton.click();
  await expect(detailsCopyButton).toHaveAttribute("data-copy-state", "copied");
  await expectClipboardText(page, "123.456.789-09");
  await detailsDialog.getByRole("button", { name: "Fechar modal" }).click();

  const cpfListSearchSection = page
    .getByRole("heading", { name: "Busca por lista de CPFs" })
    .locator("xpath=ancestor::section[1]");
  const unregisteredCpfs = [
    "11122233344",
    "22233344455",
    "33344455566",
    "44455566677",
    "55566677788",
    "66677788899",
    "77788899900",
    "88899900011",
    "99900011122",
    "10101010101",
    "20202020202",
  ];
  const formattedUnregisteredCpfs = [
    "101.010.101-01",
    "111.222.333-44",
    "202.020.202-02",
    "222.333.444-55",
    "333.444.555-66",
    "444.555.666-77",
    "555.666.777-88",
    "666.777.888-99",
    "777.888.999-00",
    "888.999.000-11",
    "999.000.111-22",
  ];

  await cpfListSearchSection
    .locator("#cpf-list-input")
    .fill(["12345678909", ...unregisteredCpfs].join("\n"));
  await cpfListSearchSection.getByRole("button", { name: "Buscar CPFs" }).click();
  await expect(
    cpfListSearchSection.getByRole("heading", {
      name: "Doaram e estão cadastrados",
    }),
  ).toBeVisible();

  const registeredGroup = cpfListSearchSection.getByTestId(
    "cpf-list-result-registeredWithDonations",
  );
  const registeredCopyAllButton = registeredGroup.locator(
    '[data-copy-label="Copiar todos os CPFs de Doaram e estão cadastrados"]',
  );

  await registeredCopyAllButton.click();
  await expect(registeredCopyAllButton).toHaveAttribute(
    "data-copy-state",
    "copied",
  );
  await expectClipboardText(page, "123.456.789-09");

  const searchCopyButton = cpfListSearchSection
    .getByRole("button", { name: "Copiar CPF" })
    .first();
  await searchCopyButton.click();
  await expect(searchCopyButton).toHaveAttribute("data-copy-state", "copied");
  await expectClipboardText(page, "123.456.789-09");

  const unregisteredGroup = cpfListSearchSection.getByTestId(
    "cpf-list-result-unregisteredWithoutDonations",
  );
  const unregisteredCopyAllButton = unregisteredGroup.locator(
    '[data-copy-label="Copiar todos os CPFs de Não doaram e não estão cadastrados"]',
  );

  await expect(
    unregisteredGroup.getByText("Mostrando 1-10 de 11").first(),
  ).toBeVisible();
  await expect(unregisteredGroup.getByText("101.010.101-01")).toBeVisible();
  await expect(unregisteredGroup.getByText("999.000.111-22")).toHaveCount(0);

  await unregisteredCopyAllButton.click();
  await expect(unregisteredCopyAllButton).toHaveAttribute(
    "data-copy-state",
    "copied",
  );
  await expectClipboardText(page, formattedUnregisteredCpfs.join("\n"));

  await unregisteredGroup
    .getByRole("button", { name: "Próxima página" })
    .first()
    .click();
  await expect(
    unregisteredGroup.getByText("Mostrando 11-11 de 11").first(),
  ).toBeVisible();
  await expect(unregisteredGroup.getByText("999.000.111-22")).toBeVisible();
  await expect(unregisteredGroup.getByText("101.010.101-01")).toHaveCount(0);
});
