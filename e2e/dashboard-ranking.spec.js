import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Fixture `ranking-backup.json` semeia 3 meses e 2 demandas de forma que as
 * três ordenações deem resultados DIFERENTES — senão o teste passaria mesmo
 * se o filtro de ordenação não fizesse nada:
 *
 *   Ana   — R$ 120,00 | 120 notas | 1 mês  (Cestas)
 *   Carla — R$ 100,00 | 100 notas | 2 meses (Remédios)
 *   Bruno — R$  60,00 | 330 notas | 3 meses (Cestas)
 *
 * Os resumos mensais são derivados de `import_cpf_summary` no restore, então
 * a fixture semeia essa tabela e não `monthly_donor_summary`.
 */

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

test("ranking de maiores doadores filtra por mês, demanda e ordenação", async ({ page }) => {
  const backupPath = fileURLToPath(
    new URL("./fixtures/ranking-backup.json", import.meta.url),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  const section = page
    .getByRole("heading", { name: "Maiores doadores" })
    .locator("xpath=ancestor::section[1]");
  await expect(section.getByText("ANA CRISTINA DOS SANTOS")).toBeVisible();

  const rankedNames = async () =>
    (await section.locator("p.font-medium").allInnerTexts()).map(
      (text) => text.split("\n")[0].trim(),
    );

  // Padrão: por abatimento.
  expect(await rankedNames()).toEqual([
    "ANA CRISTINA DOS SANTOS",
    "CARLA MENDES",
    "BRUNO OLIVEIRA LIMA",
  ]);
  await expect(section.getByText("R$ 120,00")).toBeVisible();

  // Por notas Bruno passa à frente, mesmo somando menos abatimento.
  await selectOption(page, section, "sort", "Mais notas");
  await expect
    .poll(rankedNames)
    .toEqual([
      "BRUNO OLIVEIRA LIMA",
      "ANA CRISTINA DOS SANTOS",
      "CARLA MENDES",
    ]);

  // Um mês só: fevereiro tem apenas Bruno, e com o valor DAQUELE mês
  // (R$ 30,00), não o total de vida dele (R$ 60,00).
  await selectOption(page, section, "referenceMonth", "Fevereiro de 2026");
  await expect.poll(rankedNames).toEqual(["BRUNO OLIVEIRA LIMA"]);
  await expect(section.getByText("R$ 30,00")).toBeVisible();
  await expect(section.getByText("330 nota(s)")).toBeHidden();

  // Com mês fixo, "meses doando" seria sempre 1 — a opção sai da lista.
  await section
    .locator('[data-select-name="sort"]')
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("listbox").last().getByRole("option"),
  ).toHaveText(["Maior abatimento", "Mais notas"]);
  await page.keyboard.press("Escape");

  // Demanda recorta o conjunto.
  await selectOption(page, section, "referenceMonth", "Todos os meses");
  await selectOption(page, section, "demand", "REMEDIOS");
  await expect.poll(rankedNames).toEqual(["CARLA MENDES"]);

  // Recorte sem resultado avisa que é filtro, não ausência de cadastro.
  await selectOption(page, section, "referenceMonth", "Fevereiro de 2026");
  await expect(section.getByText("Nenhum doador nesse recorte")).toBeVisible();
});
