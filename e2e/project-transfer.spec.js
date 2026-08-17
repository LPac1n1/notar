import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Transferência de doador entre projetos.
 *
 * O que precisa ser provado não é que o botão funciona: é que o histórico NÃO
 * se move. A fixture tem crédito em março e abril para o mesmo doador; depois
 * de transferir a partir de abril, março tem de continuar somando para o
 * projeto antigo. Se a transferência reescrevesse o vínculo em vez de fechar a
 * janela, o crédito de março migraria junto e o teste pegaria.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

async function restoreFixture(page) {
  const backupPath = fileURLToPath(
    new URL("./fixtures/project-credit-backup.json", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Restaurar backup" })
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible();
}

test("transferir doador move o crédito futuro e preserva o passado", async ({
  page,
}) => {
  await restoreFixture(page);

  // Carla está em Capoeira, com R$45 em março e R$150 em abril.
  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByText("Capoeira").first().click();
  await expect(page).toHaveURL(/\/p\/capoeira$/);

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: /CARLA CAPOEIRA/ }).first().click();

  const projectSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Projeto", exact: true }) });
  await expect(projectSection.getByText("Capoeira")).toBeVisible();

  await projectSection.getByRole("button", { name: "Transferir de projeto" }).click();
  const dialog = page.getByRole("dialog", { name: "Transferir de projeto" });
  await dialog.locator('[data-select-name="projectId"]').getByRole("button").first().click();
  await page
    .getByRole("listbox")
    .last()
    .getByRole("option", { name: "Demandas de Moradia" })
    .click();

  await dialog.locator('input[name="effectiveMonth"]').fill("04/2026");
  // O texto tem de anunciar o mês que o banco realmente grava: a janela fecha
  // em março, não em abril.
  await expect(dialog.getByText("As doações até Março de 2026", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Transferir" }).click();

  await expect(page.getByText("Doador transferido para Demandas de Moradia.")).toBeVisible();
  await expect(projectSection.getByText("Vínculos anteriores")).toBeVisible();
  await expect(projectSection.getByText("Capoeira")).toBeVisible();
  await expect(projectSection.getByText("Encerrado")).toBeVisible();

  // O crédito de março continua em Capoeira; abril saiu.
  await page.locator("aside").first().getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
  await page.getByRole("button", { name: /Capoeira/ }).first().click();
  await expect(page).toHaveURL(/\/p\/capoeira$/);

  const accumulated = page.getByText("Crédito acumulado").locator("xpath=..");
  // 2 + 45 = 47 (Ana e Bruno de março/abril seguem intactos; some só o abril
  // de Carla, R$150). Total anterior: R$1.385.
  await expect(accumulated.getByText("R$ 1.235,00")).toBeVisible();
});

/**
 * O card de doadores sem projeto não oferece ação quando não há o que
 * resolver.
 *
 * A resolução em si (o modal de vínculo) NÃO é exercitada aqui de propósito:
 * nenhum caminho da interface produz um doador órfão — criar já vincula,
 * transferir sempre deixa uma janela aberta, e o restore de backup reexecuta
 * o backfill. O card é rede de segurança para dado que chegue por fora, e a
 * consulta que o alimenta é coberta por teste de integração contra o banco.
 */
test("card de doadores sem projeto não oferece ação quando não há órfão", async ({
  page,
}) => {
  await restoreFixture(page);

  await page.locator("aside").first().getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

  const orphanCard = page
    .getByText("Doadores sem projeto")
    .locator("xpath=..");
  await expect(orphanCard.getByText("0")).toBeVisible();
  await expect(orphanCard.getByRole("button", { name: "Ver e vincular" })).toHaveCount(0);
});
