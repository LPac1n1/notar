import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Inteligência sobre as notas fiscais.
 *
 * A fixture tem nove compras de R$ 100,00 no MERCADO CENTRAL rendendo R$ 1,00
 * cada e duas de R$ 50,00 na FARMACIA POPULAR rendendo R$ 10,00 cada. O
 * MERCADO é o mais frequente; a FARMACIA é quem dá o maior crédito por nota e
 * o maior retorno. Nenhuma das perguntas tem a mesma resposta, então um código
 * que as confundisse falharia aqui.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

async function semear(page) {
  const backupPath = fileURLToPath(
    new URL("./fixtures/establishments-backup.json", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible({
    timeout: 120000,
  });
}

function tabela(page) {
  return page.getByRole("table", { name: /Notas fiscais do recorte atual/ });
}

async function abrirNotas(page) {
  await page.getByRole("link", { name: "Notas fiscais" }).click();
  await expect(tabela(page).locator("tbody tr").first()).toBeVisible({
    timeout: 60000,
  });
}

test("a lista abre ordenada por crédito, do maior para o menor", async ({
  page,
}) => {
  await semear(page);
  await abrirNotas(page);

  const primeira = tabela(page).locator("tbody tr").first();
  await expect(primeira).toContainText("FARMACIA POPULAR");
  await expect(primeira).toContainText("R$ 10,00");
  // Retorno é crédito sobre valor: R$ 10 de crédito em R$ 50 de compra.
  await expect(primeira).toContainText("20,0%");
});

test("ordenar por valor traz outra nota para o topo", async ({ page }) => {
  await semear(page);
  await abrirNotas(page);

  // A maior COMPRA é do mercado (R$ 100), mesmo rendendo menos crédito.
  await tabela(page).getByRole("button", { name: /^Valor/ }).click();
  const primeira = tabela(page).locator("tbody tr").first();
  await expect(primeira).toContainText("MERCADO CENTRAL");
  await expect(primeira).toContainText("R$ 100,00");

  // Clicar de novo inverte o sentido, e a menor compra assume o topo.
  await tabela(page).getByRole("button", { name: /^Valor/ }).click();
  await expect(tabela(page).locator("tbody tr").first()).toContainText(
    "FARMACIA POPULAR",
  );
});

test("os filtros recortam a lista e os indicadores juntos", async ({ page }) => {
  await semear(page);
  await abrirNotas(page);

  const totalInicial = page.getByText(/11 nota\(s\) no recorte atual/);
  await expect(totalInicial).toBeVisible();

  // Busca por texto, sem acento e sem diferenciar caixa.
  await page
    .getByPlaceholder("Estabelecimento, doador, número da nota ou CPF")
    .fill("farmacia");

  await expect(page.getByText(/2 nota\(s\) no recorte atual/)).toBeVisible({
    timeout: 30000,
  });
  await expect(tabela(page).locator("tbody tr")).toHaveCount(2);

  // Limpar devolve o recorte inteiro.
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText(/11 nota\(s\) no recorte atual/)).toBeVisible({
    timeout: 30000,
  });
});

test("as faixas de valor mostram onde o retorno é melhor", async ({ page }) => {
  await semear(page);
  await abrirNotas(page);

  const faixas = page.getByRole("table", {
    name: /agrupados por faixa de valor/,
  });
  await expect(faixas).toBeVisible();

  // As compras de R$ 50 rendem 20%; as de R$ 100 rendem 1%. É a diferença que
  // um total geral esconde.
  //
  // Os limites são meio-abertos: R$ 50,00 pertence à faixa que COMEÇA em 50,
  // e R$ 100,00 à que começa em 100.
  const cinquenta = faixas
    .locator("tbody tr")
    .filter({ hasText: "R$ 50 a R$ 100" });
  await expect(cinquenta).toContainText("20,0%");

  const cem = faixas.locator("tbody tr").filter({ hasText: "R$ 100 a R$ 200" });
  await expect(cem).toContainText("1,0%");
});

test("o perfil do doador lista só as notas dele", async ({ page }) => {
  await semear(page);

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Perfil", exact: true }).first().click();

  const secao = page
    .getByRole("heading", { name: "Histórico de doações" })
    .locator("xpath=ancestor::section[1]");
  await expect(secao).toBeVisible({ timeout: 60000 });

  // ALICE tem 8 das 11 notas; BRUNO tem as outras 3.
  await expect(secao.getByText(/8 nota\(s\) no recorte atual/)).toBeVisible({
    timeout: 60000,
  });

  // O filtro de doador não aparece: o doador é contexto da página, não escolha.
  await expect(secao.getByText("Doador", { exact: true })).toHaveCount(0);

  // E a coluna de doador some, porque seria a mesma em todas as linhas.
  const tabelaDoador = secao.getByRole("table", {
    name: /Notas fiscais do recorte atual/,
  });
  await expect(tabelaDoador).not.toContainText("ALICE MORADIA");
});

test("exporta o recorte filtrado, e não a página visível", async ({ page }) => {
  await semear(page);
  await abrirNotas(page);

  await page
    .getByPlaceholder("Estabelecimento, doador, número da nota ou CPF")
    .fill("farmacia");
  await expect(page.getByText(/2 nota\(s\) no recorte atual/)).toBeVisible({
    timeout: 30000,
  });

  const download = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "Exportar resultado" }).click();
  await download;

  await expect(page.getByText("2 nota(s) exportada(s).")).toBeVisible({
    timeout: 30000,
  });
});
