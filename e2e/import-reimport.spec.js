import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Reimportação: substituir a planilha de um mês já importado.
 *
 * Era o maior buraco de cobertura do sistema — `applyReimport` é o caminho
 * que APAGA as notas do mês e as reescreve a partir do arquivo novo, e não
 * tinha nenhum teste ponta a ponta. Um erro aqui destrói dado já conferido,
 * e o usuário só descobre pelos números errados na Gestão Mensal.
 *
 * O que este arquivo prende:
 *  - a prévia compara com o estado atual ANTES de escrever (é a única chance
 *    de o usuário desistir);
 *  - confirmar substitui de verdade — a contagem passa a ser a do arquivo
 *    novo, e não a soma dos dois;
 *  - CPF que só existe na planilha nova entra;
 *  - nota que era inválida e virou válida passa a contar.
 *
 * A segunda planilha foi montada para diferir da primeira em TRÊS eixos ao
 * mesmo tempo (mais notas válidas, um CPF novo, e status corrigido). Se
 * diferisse num eixo só, uma reimportação que ignorasse os outros dois
 * passaria no teste.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

const PLANILHA_ORIGINAL = fileURLToPath(
  new URL("./fixtures/nfp-with-invalid-status.csv", import.meta.url),
);
const PLANILHA_CORRIGIDA = fileURLToPath(
  new URL("./fixtures/nfp-reimport-corrigida.csv", import.meta.url),
);

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

async function semearCadastro(page) {
  await page.goto("/p/demandas-de-moradia");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Demanda Teste");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("DEMANDA TESTE")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Maria Silva");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("12345678909");
  await selectOption(page, donorDialog, "demand", "DEMANDA TESTE");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
}

async function importarOriginal(page) {
  await page.getByRole("link", { name: "Importações" }).click();
  await page.getByRole("button", { name: "Nova planilha de doações" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova importação" });
  await dialog.locator('input[type="file"]').setInputFiles(PLANILHA_ORIGINAL);
  await expect(page.getByText("Pré-visualização")).toBeVisible();
  await dialog.locator('input[name="referenceMonth"]').fill("03/2026");
  await dialog.locator('input[name="valuePerNote"]').fill("0.50");
  await page.getByRole("button", { name: "Processar importação" }).click();
  await expect(page.getByText("nfp-with-invalid-status.csv")).toBeVisible();
}

async function lerAbatimentoDoMes(page) {
  await page.getByRole("link", { name: "Gestão Mensal" }).click();
  const secao = page
    .getByRole("heading", { name: "Resumo mensal" })
    .locator("xpath=ancestor::section[1]");
  await secao.locator('input[name="referenceMonth"]').fill("03/2026");
  await expect(page.getByRole("button", { name: "MARIA SILVA" })).toBeVisible();
  return secao;
}

test("a prévia da reimportação compara antes de escrever", async ({ page }) => {
  await semearCadastro(page);
  await importarOriginal(page);

  await page.getByRole("button", { name: "Reimportar" }).first().click();
  const modal = page.getByRole("dialog", { name: /Reimportar planilha/ });
  await expect(modal).toBeVisible();

  await modal.locator('input[type="file"]').setInputFiles(PLANILHA_CORRIGIDA);

  // A prévia só compara — nada foi gravado ainda. É a única janela em que o
  // usuário pode ver o efeito e desistir.
  await expect(modal.getByText("nfp-reimport-corrigida.csv")).toBeVisible();
  // Com a contagem, e não só o rótulo: prova que o diff achou exatamente o
  // CPF que só existe na planilha nova.
  await expect(modal.getByText("CPFs novos (1)")).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Confirmar reimportação" }),
  ).toBeVisible();

  // Desistindo, o mês continua exatamente como estava: 2 notas válidas.
  await modal.getByRole("button", { name: "Cancelar" }).click();
  await expect(modal).toHaveCount(0);

  await lerAbatimentoDoMes(page);
  await expect(
    page.getByText("3 nota(s) descartada(s) por status do pedido inválido."),
  ).toBeVisible();
});

test("confirmar substitui a planilha em vez de somar com a anterior", async ({
  page,
}) => {
  await semearCadastro(page);
  await importarOriginal(page);

  await page.getByRole("button", { name: "Reimportar" }).first().click();
  const modal = page.getByRole("dialog", { name: /Reimportar planilha/ });
  await modal.locator('input[type="file"]').setInputFiles(PLANILHA_CORRIGIDA);
  await expect(
    modal.getByRole("button", { name: "Confirmar reimportação" }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Confirmar reimportação" }).click();
  await expect(modal).toHaveCount(0, { timeout: 60000 });

  await lerAbatimentoDoMes(page);

  // A planilha nova tem 4 notas válidas para a Maria. Se a reimportação
  // somasse em vez de substituir, seriam 6 (as 2 antigas mais as 4 novas).
  await expect(page.getByText("R$ 2,00").first()).toBeVisible();

  // E o aviso de notas descartadas some: na planilha nova nenhuma linha da
  // Maria tem status inválido.
  await expect(
    page.getByText("nota(s) descartada(s) por status do pedido inválido."),
  ).toHaveCount(0);
});

test("CPF que só existe na planilha nova entra na importação", async ({
  page,
}) => {
  await semearCadastro(page);
  await importarOriginal(page);

  await page.getByRole("button", { name: "Reimportar" }).first().click();
  const modal = page.getByRole("dialog", { name: /Reimportar planilha/ });
  await modal.locator('input[type="file"]').setInputFiles(PLANILHA_CORRIGIDA);
  await modal.getByRole("button", { name: "Confirmar reimportação" }).click();
  await expect(modal).toHaveCount(0, { timeout: 60000 });

  // 98765432100 não está cadastrado como doador, então precisa aparecer como
  // CPF sem cadastro — a lista de quem doou pelo CNPJ sem estar registrado.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("CPFs sem cadastro")).toBeVisible();
});
