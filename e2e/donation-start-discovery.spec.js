import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * O início das doações se descobre sozinho.
 *
 * A data sempre esteve nas planilhas — quem cadastra um doador tinha de
 * procurá-la e redigitá-la, e quase nunca fazia. Agora o CPF dispara a busca no
 * cadastro, e cada importação preenche quem ficou sem data.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

async function importarPlanilha(page, arquivo, mes) {
  await page.getByRole("link", { name: "Importações" }).click();
  await page.getByRole("button", { name: "Nova planilha de doações" }).click();
  const modal = page.getByRole("dialog", { name: "Nova importação" });
  await modal.locator('input[type="file"]').setInputFiles(arquivo);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await modal.locator('input[name="referenceMonth"]').fill(mes);
  await modal.locator('input[name="valuePerNote"]').fill("0.50");
  await expect(
    modal.locator('[data-select-name="cpfColumn"]').getByRole("button", { name: "CPF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("nfp-sample.csv")).toBeVisible({ timeout: 60000 });
}

async function criarDemanda(page, nome) {
  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const modal = page.getByRole("dialog", { name: "Adicionar demanda" });
  await modal.getByPlaceholder("Nome da demanda").fill(nome);
  await modal.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(modal).toBeHidden();
}

test("o CPF preenche o início das doações a partir das planilhas", async ({
  page,
}) => {
  const fixture = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await criarDemanda(page, "CESTAS");
  await importarPlanilha(page, fixture, "03/2026");

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const modal = page.getByRole("dialog", { name: "Adicionar doador" });

  const inicio = modal.locator('input[name="donationStartDate"]');
  await expect(inicio).toHaveValue("");

  // 12345678909 aparece na planilha de março/2026.
  await modal.getByPlaceholder("CPF", { exact: true }).fill("12345678909");

  await expect(inicio).toHaveValue("03/2026", { timeout: 15000 });
  await expect(
    modal.getByText("Preenchido com o primeiro mês em que este CPF aparece"),
  ).toBeVisible();
});

test("CPF fora das planilhas deixa o campo vazio", async ({ page }) => {
  const fixture = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await criarDemanda(page, "CESTAS");
  await importarPlanilha(page, fixture, "03/2026");

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const modal = page.getByRole("dialog", { name: "Adicionar doador" });

  // CPF válido que não está em planilha nenhuma.
  await modal.getByPlaceholder("CPF", { exact: true }).fill("52998224725");

  await expect(
    modal.getByText("Este CPF ainda não aparece em nenhuma planilha"),
  ).toBeVisible({ timeout: 15000 });
  await expect(modal.locator('input[name="donationStartDate"]')).toHaveValue("");
});

test("a importação preenche o início de quem foi cadastrado sem data", async ({
  page,
}) => {
  const fixture = fileURLToPath(
    new URL("./fixtures/nfp-sample.csv", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await criarDemanda(page, "CESTAS");

  // Cadastrado ANTES de qualquer planilha existir: nada para descobrir ainda.
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const modal = page.getByRole("dialog", { name: "Adicionar doador" });
  await modal.locator('input[name="name"]').fill("Ana Sem Data");
  await modal.getByPlaceholder("CPF", { exact: true }).fill("12345678909");
  await modal
    .locator('[data-select-name="demand"]')
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("listbox").last().getByRole("option", { name: "CESTAS" }).click();
  await expect(modal.locator('input[name="donationStartDate"]')).toHaveValue("");
  await modal.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(modal).toBeHidden();

  await importarPlanilha(page, fixture, "03/2026");

  // Sem nenhuma ação manual, o cadastro passa a ter a competência importada.
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("ANA SEM DATA")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  const edicao = page.getByRole("dialog", { name: "Editar doador" });
  await expect(edicao.locator('input[name="donationStartDate"]')).toHaveValue(
    "03/2026",
  );
});
