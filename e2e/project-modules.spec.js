import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Um projeto sem os módulos Demandas e Gestão Mensal não pode exibir o
 * vocabulário nem os campos da apuração mensal. O risco não é cosmético: a
 * demanda subdivide o projeto, então oferecer o campo onde não há nenhuma pede
 * um dado impossível de preencher, e falar em abatimento descreve um fluxo que
 * ali não roda.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

async function setUpProject(page) {
  const backupPath = fileURLToPath(
    new URL("./fixtures/ranking-backup.json", import.meta.url),
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

  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Adicionar projeto" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar projeto" });
  await dialog.locator('input[name="name"]').fill("Capoeira");
  await dialog.getByRole("button", { name: "Adicionar projeto" }).click();
  await expect(page.getByText('Projeto "Capoeira" criado.')).toBeVisible();
  await page.getByText("Capoeira").first().click();
  await expect(page).toHaveURL(/\/p\/capoeira$/);
}

test("projeto sem Demandas não pede demanda em lugar nenhum", async ({ page }) => {
  await setUpProject(page);
  await page.getByRole("link", { name: "Doadores", exact: true }).click();

  // Filtro e busca.
  await expect(page.getByText("Todas as demandas")).toHaveCount(0);
  await expect(page.getByPlaceholder("Digite nome ou CPF...")).toBeVisible();

  // Formulário.
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await expect(dialog.locator('[data-select-name="demand"]')).toHaveCount(0);

  await dialog.locator('input[name="name"]').fill("Carla Capoeira");
  await dialog.getByPlaceholder("CPF", { exact: true }).fill("71428793860");
  await dialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(dialog).toBeHidden();

  // Card da lista e perfil.
  await expect(page.getByText("Demanda:")).toHaveCount(0);
  await page.getByRole("button", { name: /CARLA CAPOEIRA/ }).first().click();
  await expect(page.getByText("Conciliação de créditos")).toBeVisible();
  await expect(page.getByText("Demanda", { exact: true })).toHaveCount(0);
});

test("projeto sem Gestão Mensal não fala em abatimento", async ({ page }) => {
  await setUpProject(page);
  await page.getByRole("link", { name: "Doadores", exact: true }).click();

  await expect(
    page.getByText("Cadastre o primeiro doador para começar a acompanhar o crédito gerado."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await dialog.locator('input[name="name"]').fill("Carla Capoeira");
  await dialog.getByPlaceholder("CPF", { exact: true }).fill("71428793860");
  await dialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /CARLA CAPOEIRA/ }).first().click();
  await expect(page.getByText("Crédito real gerado", { exact: true })).toBeVisible();

  // Nenhum resquício da apuração mensal no perfil.
  await expect(page.getByRole("button", { name: "Lançar acumulado" })).toHaveCount(0);
  await expect(page.getByText("Total acumulado")).toHaveCount(0);
  await expect(page.getByText("Meses com abatimento")).toHaveCount(0);
  await expect(page.getByText("Total abatido")).toHaveCount(0);
  await expect(page.getByText("Histórico mensal")).toHaveCount(0);
});

test("rota de módulo desligado volta para o painel do projeto", async ({ page }) => {
  await setUpProject(page);

  // Sem `goto`: empurra pelo próprio router para não apagar o banco em memória.
  for (const path of ["pessoas", "demandas", "mensal"]) {
    await page.evaluate((target) => {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/p/capoeira/${path}`);

    await expect(page).toHaveURL(/\/p\/capoeira$/);
  }
});

test("CPF de doador de outro projeto explica onde ele está", async ({ page }) => {
  await setUpProject(page);
  await page.getByRole("link", { name: "Doadores", exact: true }).click();

  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await dialog.locator('input[name="name"]').fill("Teste Capoeira");
  // CPF que pertence a um doador do projeto principal. Sem o nome do projeto,
  // o operador procura o doador na lista de Capoeira, não acha, e conclui que
  // a mensagem está errada.
  await dialog.getByPlaceholder("CPF", { exact: true }).fill("52998224725");
  await dialog.getByRole("button", { name: "Adicionar doador" }).click();

  await expect(
    dialog.getByText("no projeto Demandas de Moradia", { exact: false }),
  ).toBeVisible();
});
