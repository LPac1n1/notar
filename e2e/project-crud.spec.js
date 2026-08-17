import { expect, test } from "@playwright/test";

/**
 * ATENÇÃO ao navegar aqui: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que
 * o DuckDB é só memória. Um `page.goto()` no meio do teste recarrega a página
 * e APAGA tudo que foi criado até ali. Toda navegação depois do `goto` inicial
 * precisa ser por clique.
 */

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  await page
    .getByRole("listbox")
    .last()
    .getByRole("option", { name: label })
    .first()
    .click();
}

async function addDonor(page, { name, cpf, demand = "" }) {
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.getByPlaceholder("CPF", { exact: true }).fill(cpf);
  if (demand) await selectOption(page, dialog, "demand", demand);
  await dialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(dialog).toBeHidden();
}

/** O seletor no topo da barra lateral leva para a escolha de projeto. */
async function openProjectChooser(page) {
  await page.locator("aside").first().getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
}

async function createProject(page, name) {
  await page.getByRole("button", { name: "Adicionar projeto" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar projeto" });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.getByRole("button", { name: "Adicionar projeto" }).click();
  await expect(page.getByText(`Projeto "${name}" criado.`)).toBeVisible();
}

test("projeto novo nasce mínimo e com base de doadores própria", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");

  // Doador no projeto principal, para provar o isolamento adiante.
  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Cestas Basicas");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("CESTAS BASICAS")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await addDonor(page, {
    name: "Alice Moradia",
    cpf: "52998224725",
    demand: "CESTAS BASICAS",
  });
  await expect(page.getByText("ALICE MORADIA")).toBeVisible();

  // ── Criar o segundo projeto ──────────────────────────────────────
  await openProjectChooser(page);
  await createProject(page, "Capoeira");

  await page.getByText("Capoeira").first().click();
  await expect(page).toHaveURL(/\/p\/capoeira$/);

  // Projeto novo nasce com o conjunto mínimo: Gestão Mensal, Pessoas e
  // Demandas não aparecem porque os módulos estão desligados.
  const sidebar = page.locator("aside").first();
  await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Doadores" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Anotações" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Gestão Mensal" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Pessoas" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Demandas" })).toHaveCount(0);

  // ── Isolamento da base de doadores ───────────────────────────────
  await sidebar.getByRole("link", { name: "Doadores" }).click();
  await expect(page.getByText("0 doador(es) cadastrado(s).")).toBeVisible();
  await expect(page.getByText("ALICE MORADIA")).toHaveCount(0);

  // Sem o módulo Demandas, o cadastro NÃO pode exigir demanda — não haveria
  // como satisfazer a exigência. Vale no formulário e no serviço.
  await addDonor(page, { name: "Bruno Capoeira", cpf: "11144477735" });
  await expect(page.getByText("BRUNO CAPOEIRA")).toBeVisible();
  await expect(page.getByText("1 doador(es) cadastrado(s).")).toBeVisible();

  // E o doador criado dentro de Capoeira não vaza para o projeto principal.
  await openProjectChooser(page);
  await page.getByText("Demandas de Moradia").first().click();
  await expect(page).toHaveURL(/\/p\/demandas-de-moradia$/);
  await sidebar.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("ALICE MORADIA")).toBeVisible();
  await expect(page.getByText("BRUNO CAPOEIRA")).toHaveCount(0);
});

test("o projeto principal não pode ser excluído; o novo pode, com desfazer", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");
  await openProjectChooser(page);
  await createProject(page, "Capoeira");

  // O projeto principal é a casa de todo doador não transferido: sem botão.
  await expect(
    page.getByText("Projeto principal — não pode ser excluído"),
  ).toBeVisible();

  // Projeto recém-criado, sem vínculo nenhum: pode ser excluído.
  await page.getByRole("button", { name: "Excluir" }).click();
  const confirm = page.getByRole("dialog", { name: "Excluir projeto" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Excluir projeto" }).click();
  await expect(
    page.getByText('Projeto "Capoeira" enviado para a lixeira.'),
  ).toBeVisible();

  // Desfazer é clicado ANTES de conferir o sumiço do card: o texto do aviso
  // contém "Capoeira", então esperar a contagem zerar esperaria o aviso
  // expirar — e o botão sai junto com ele.
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("button", { name: "Excluir" })).toBeVisible();
});
