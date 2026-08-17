import { expect, test } from "@playwright/test";

/**
 * O projeto é o ambiente de trabalho; Importações é a exceção compartilhada.
 * Este teste trava as três propriedades que sustentam esse desenho.
 */
test("o projeto é o ambiente, e Importações fica fora dele", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  // A abertura é a escolha do projeto.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
  await expect(page.getByText("Demandas de Moradia")).toBeVisible();

  await page.getByText("Demandas de Moradia").first().click();
  await expect(page).toHaveURL(/\/p\/demandas-de-moradia$/);

  // A lateral separa o que é do projeto do que é compartilhado. O rótulo é
  // o que impede a leitura de que Importações pertence a este projeto.
  const sidebar = page.locator("aside").first();
  await expect(sidebar.getByText("Neste projeto")).toBeVisible();
  await expect(sidebar.getByText("Plataforma")).toBeVisible();

  // Páginas do projeto ficam sob o prefixo.
  await sidebar.getByRole("link", { name: "Doadores" }).click();
  await expect(page).toHaveURL(/\/p\/demandas-de-moradia\/doadores$/);

  // Importações NÃO ganha prefixo: uma planilha para todos os projetos.
  await sidebar.getByRole("link", { name: "Importações" }).click();
  await expect(page).toHaveURL(/\/importacoes$/);

  expect(pageErrors).toEqual([]);
});

test("rotas anteriores ao multiprojeto redirecionam em vez de 404", async ({ page }) => {
  // Favoritos e links que o próprio app gerou antes da mudança precisam
  // continuar chegando ao lugar certo.
  await page.goto("/doadores");
  await expect(page).toHaveURL(/\/p\/demandas-de-moradia\/doadores$/);

  await page.goto("/mensal");
  await expect(page).toHaveURL(/\/p\/demandas-de-moradia\/mensal$/);

  // Slug inexistente volta para a escolha, sem tela vazia.
  await page.goto("/p/projeto-que-nao-existe");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
});
