import { expect, test } from "@playwright/test";

/**
 * Quando a barra lateral mantém o projeto e quando ela o esquece.
 *
 * São dois caminhos com respostas OPOSTAS, e o sistema já errou os dois em
 * momentos diferentes:
 *
 *   de dentro do projeto → Importações  ......  MANTÉM (é preciso poder voltar)
 *   projeto → escolha → Importações/Painel ...  ESQUECE (o projeto foi fechado)
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
// O texto no DOM é em caixa normal — a maiúscula vem do CSS.
const NAV_DO_PROJETO = "Neste projeto";

test("sair do projeto direto para a plataforma mantém o caminho de volta", async ({
  page,
}) => {
  await page.goto("/p/demandas-de-moradia");
  await expect(
    page.getByRole("link", { name: "Doadores", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Importações" }).click();
  await expect(page.getByRole("heading", { name: "Importações" })).toBeVisible();

  const lateral = page.locator("aside").first();
  await expect(lateral).toContainText(NAV_DO_PROJETO);
  await expect(lateral).toContainText("Demandas de Moradia");
});

test("passar pela escolha de projeto faz a barra lateral esquecê-lo", async ({
  page,
}) => {
  await page.goto("/p/demandas-de-moradia");
  await expect(
    page.getByRole("link", { name: "Doadores", exact: true }),
  ).toBeVisible();

  await page.locator("aside").first().getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

  const lateral = page.locator("aside").first();

  // O projeto foi fechado: nenhuma das telas de plataforma pode trazê-lo de
  // volta sem o usuário escolher de novo.
  for (const destino of ["Importações", "Painel"]) {
    await page.getByRole("link", { name: destino }).click();
    await expect(lateral).not.toContainText(NAV_DO_PROJETO);
  }

  // E escolher de novo devolve a navegação.
  await lateral.getByRole("button").first().click();
  await page.getByRole("button", { name: /Demandas de Moradia/ }).first().click();
  await expect(lateral).toContainText(NAV_DO_PROJETO);
});
