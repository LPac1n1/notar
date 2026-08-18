import { expect, test } from "@playwright/test";

/**
 * Doador que ficou apontando para um projeto excluído.
 *
 * A sequência é alcançável só com cliques: excluir o doador remove as linhas
 * de vínculo (elas vão para o payload da lixeira), e o guard de exclusão do
 * projeto conta exatamente essas linhas — então o projeto passa a ser
 * excluível. Restaurar o doador reinsere o vínculo apontando para um projeto
 * que já não existe.
 *
 * Antes da correção o doador voltava invisível: fora da lista de todo projeto
 * (o vínculo não bate com nenhum projeto existente) e fora do contador de
 * "sem projeto" (ele TEM vínculo). Sem caminho de volta pela interface, e com
 * o CPF preso.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
test("doador cujo projeto foi excluído reaparece como sem projeto e é religável", async ({
  page,
}) => {
  await page.goto("/p/demandas-de-moradia");

  // Projeto novo com um doador só dele.
  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Adicionar projeto" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Adicionar projeto" });
  await projectDialog.locator('input[name="name"]').fill("Capoeira");
  await projectDialog.getByRole("button", { name: "Adicionar projeto" }).click();
  await expect(page.getByText('Projeto "Capoeira" criado.')).toBeVisible();
  await page.getByRole("button", { name: /Capoeira/ }).first().click();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Carla Capoeira");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("71428793860");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(donorDialog).toBeHidden();

  // Exclui o doador — é isso que solta o vínculo e libera o projeto.
  await page.getByRole("button", { name: "Remover" }).first().click();
  await page
    .getByRole("dialog")
    .filter({ hasText: "Remover doador" })
    .getByRole("button", { name: "Remover" })
    .click();
  await expect(page.getByText("0 doador(es) cadastrado(s).")).toBeVisible();

  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Excluir" }).last().click();
  await page
    .getByRole("dialog")
    .filter({ hasText: "Excluir projeto" })
    .getByRole("button", { name: "Excluir" })
    .click();
  await expect(page.getByRole("button", { name: /Capoeira/ })).toHaveCount(0);

  // Restaura só o doador. A lixeira lista o projeto primeiro e o doador
  // depois; restaurar o projeto junto esconderia o defeito.
  await page.getByRole("link", { name: "Lixeira" }).click();
  await expect(page.getByText("CARLA CAPOEIRA")).toBeVisible();
  await page.getByRole("button", { name: "Restaurar" }).nth(1).click();

  // Ele não pertence a projeto nenhum, mas precisa estar VISÍVEL e resolvível.
  await page.locator("aside").first().getByRole("button").first().click();
  const orphanCard = page.getByText("Doadores sem projeto").locator("xpath=..");
  await expect(orphanCard.getByText("1")).toBeVisible();

  await orphanCard.getByRole("button", { name: "Ver e vincular" }).click();
  const orphanDialog = page.getByRole("dialog", { name: "Doadores sem projeto" });
  await expect(orphanDialog.getByText("CARLA CAPOEIRA")).toBeVisible();

  await orphanDialog
    .locator('[data-select-name="projectId"]')
    .getByRole("button")
    .first()
    .click();
  await page
    .getByRole("listbox")
    .last()
    .getByRole("option", { name: "Demandas de Moradia" })
    .click();

  await orphanDialog
    .getByRole("button", { name: "Vincular", exact: true })
    .click();

  await expect(orphanDialog.getByText("Nenhum doador sem projeto")).toBeVisible();
  await orphanDialog.getByRole("button", { name: "Fechar" }).click();

  // E agora aparece de verdade na lista do projeto escolhido.
  await page.getByRole("button", { name: /Demandas de Moradia/ }).first().click();
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("CARLA CAPOEIRA")).toBeVisible();
});
