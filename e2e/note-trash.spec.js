import { expect, test } from "@playwright/test";

/**
 * Excluir anotação é reversível.
 *
 * Era a ÚNICA exclusão irreversível do sistema: doador, pessoa, demanda e
 * projeto já iam para a lixeira, mas a anotação sumia de vez — levando junto
 * um texto escrito à mão, que não tem de onde ser recuperado.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
async function criarNota(page, titulo) {
  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill(titulo);
  await page.keyboard.press("Escape");
  await expect(page.getByText(titulo)).toBeVisible();
}

async function excluirPrimeira(page) {
  await page.getByRole("button", { name: "Excluir" }).first().click();
  await page
    .getByRole("dialog")
    .filter({ hasText: "Excluir anotação" })
    .getByRole("button", { name: "Excluir" })
    .click();
}

test("desfazer traz a anotação de volta", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Anotações" }).click();
  await criarNota(page, "Lembrete importante");

  await excluirPrimeira(page);
  await expect(page.getByText("Anotação movida para a lixeira.")).toBeVisible();
  await expect(page.getByText("Lembrete importante")).toHaveCount(0);

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Anotação restaurada.")).toBeVisible();
  await expect(page.getByText("Lembrete importante")).toBeVisible();
});

test("a anotação excluída pode ser restaurada pela lixeira", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Anotações" }).click();
  await criarNota(page, "Texto que nao pode sumir");

  await excluirPrimeira(page);
  await expect(page.getByText("Anotação movida para a lixeira.")).toBeVisible();

  await page.getByRole("link", { name: "Lixeira" }).click();
  await expect(page.getByText("Texto que nao pode sumir")).toBeVisible();
  await page.getByRole("button", { name: "Restaurar" }).first().click();

  await page.locator("aside").first().getByRole("link", { name: "Anotações" }).click();
  await expect(page.getByText("Texto que nao pode sumir")).toBeVisible();
});
