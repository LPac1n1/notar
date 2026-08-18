import { expect, test } from "@playwright/test";

/**
 * Anotações são de cada projeto, não da plataforma.
 *
 * Anotação é contexto de trabalho: quem abre um projeto para acompanhar o
 * crédito dele não deve encontrar os lembretes da apuração mensal do projeto
 * principal, nem o contrário.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

async function createNote(page, title) {
  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill(title);
  // O editor salva sozinho; fechar força o flush pendente.
  await page.keyboard.press("Escape");
  await expect(page.getByText(title)).toBeVisible();
}

test("cada projeto vê apenas as próprias anotações", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");

  await page.getByRole("link", { name: "Anotações" }).click();
  await createNote(page, "Lembrete de Moradia");

  // Projeto novo começa sem anotação nenhuma.
  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Adicionar projeto" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Adicionar projeto" });
  await projectDialog.locator('input[name="name"]').fill("Capoeira");
  await projectDialog.getByRole("button", { name: "Adicionar projeto" }).click();
  await expect(page.getByText('Projeto "Capoeira" criado.')).toBeVisible();
  await page.getByRole("button", { name: /Capoeira/ }).first().click();

  await page.getByRole("link", { name: "Anotações" }).click();
  await expect(page.getByText("Nenhuma anotação cadastrada")).toBeVisible();
  await expect(page.getByText("Lembrete de Moradia")).toHaveCount(0);

  // E o que nasce aqui não volta para o projeto principal.
  await createNote(page, "Lembrete de Capoeira");

  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByRole("button", { name: /Demandas de Moradia/ }).first().click();
  await page.getByRole("link", { name: "Anotações" }).click();

  await expect(page.getByText("Lembrete de Moradia")).toBeVisible();
  await expect(page.getByText("Lembrete de Capoeira")).toHaveCount(0);
});
