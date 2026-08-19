import { expect, test } from "@playwright/test";

/**
 * Ordem dos cards de projeto.
 *
 * A ordem é escolha do usuário e mora no banco, não no navegador — precisa
 * sobreviver ao recarregar e acompanhar a conta entre dispositivos, como o
 * resto do estado.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

/** A ordem visível, lida pelos rótulos dos botões de mover. */
async function readOrder(page) {
  const labels = await page
    .getByRole("button", { name: /Mover .* para cima/ })
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        (node.getAttribute("aria-label") ?? "")
          .replace("Mover ", "")
          .replace(" para cima", ""),
      ),
    );
  return labels;
}

test("a ordem dos projetos é trocável e persiste", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");
  await page.locator("aside").first().getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

  for (const nome of ["Capoeira", "Zumbi"]) {
    await page.getByRole("button", { name: "Adicionar projeto" }).click();
    const dialog = page.getByRole("dialog", { name: "Adicionar projeto" });
    await dialog.locator('input[name="name"]').fill(nome);
    await dialog.getByRole("button", { name: "Adicionar projeto" }).click();
    await expect(page.getByText(`Projeto "${nome}" criado.`)).toBeVisible();
  }

  // Projeto novo entra no FIM, sem deslocar o que já estava posicionado.
  await expect(async () => {
    expect(await readOrder(page)).toEqual([
      "Demandas de Moradia",
      "Capoeira",
      "Zumbi",
    ]);
  }).toPass();

  // O primeiro não sobe e o último não desce — a interface não oferece a ação.
  await expect(
    page.getByRole("button", { name: "Mover Demandas de Moradia para cima" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Mover Zumbi para baixo" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Mover Zumbi para cima" }).click();
  await expect(async () => {
    expect(await readOrder(page)).toEqual([
      "Demandas de Moradia",
      "Zumbi",
      "Capoeira",
    ]);
  }).toPass();

  await page.getByRole("button", { name: "Mover Zumbi para cima" }).click();
  await expect(async () => {
    expect(await readOrder(page)).toEqual([
      "Zumbi",
      "Demandas de Moradia",
      "Capoeira",
    ]);
  }).toPass();

  // Sai da tela e volta: a ordem tem de continuar a mesma.
  await page.getByRole("link", { name: "Importações" }).click();
  await expect(page.getByRole("heading", { name: "Importações" })).toBeVisible();
  await page.locator("aside").first().getByRole("button").first().click();

  await expect(async () => {
    expect(await readOrder(page)).toEqual([
      "Zumbi",
      "Demandas de Moradia",
      "Capoeira",
    ]);
  }).toPass();
});
