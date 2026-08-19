import { expect, test } from "@playwright/test";

/**
 * As ações do card de doador ficam sempre visíveis.
 *
 * Elas eram reveladas no hover. Isso escondia do usuário o que ele pode fazer
 * até que passasse o mouse por cima — e no toque não há hover nenhum. Pessoas,
 * Demandas e Lixeira já mostravam as suas o tempo todo; só esta lista divergia.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
test("as ações do doador aparecem sem precisar do mouse em cima", async ({
  page,
}) => {
  await page.goto("/p/demandas-de-moradia");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Cestas");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("CESTAS")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Ana Teste");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("52998224725");
  await donorDialog
    .locator('[data-select-name="demand"]')
    .getByRole("button")
    .first()
    .click();
  await page
    .getByRole("listbox")
    .last()
    .getByRole("option", { name: "CESTAS" })
    .click();
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(donorDialog).toBeHidden();

  // O cursor sai de cima de tudo antes da verificação.
  await page.mouse.move(0, 0);

  for (const acao of ["Perfil", "Editar", "Desativar", "Remover"]) {
    await expect(page.getByRole("button", { name: acao }).first()).toBeVisible();
  }

  // E a coluna não pode estar apenas transparente — isso deixaria os botões
  // "visíveis" para o teste e invisíveis para o usuário.
  const opacidade = await page.evaluate(() => {
    const coluna = [...document.querySelectorAll("li > div")].find((node) =>
      node.className.includes("w-40"),
    );
    return coluna ? getComputedStyle(coluna).opacity : "";
  });
  expect(opacidade).toBe("1");
});
