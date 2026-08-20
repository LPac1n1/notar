import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Inteligência de estabelecimentos e histórico do doador.
 *
 * A fixture é montada para que a rede MAIS FREQUENTADA não seja a que MAIS
 * RENDE — nove compras no MERCADO CENTRAL rendendo R$ 9,00 contra duas na
 * FARMACIA POPULAR rendendo R$ 20,00. Se as duas coincidissem, um código que
 * confundisse "onde mais compra" com "onde mais rende" passaria no teste.
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

test("o ranking de estabelecimentos ordena por crédito", async ({ page }) => {
  await semear(page);

  await page.getByRole("link", { name: "Painel", exact: true }).click();
  const secao = page
    .getByRole("heading", { name: "Onde as doações rendem mais" })
    .locator("xpath=ancestor::section[1]");
  await expect(secao).toBeVisible({ timeout: 60000 });

  const linhas = secao
    .getByRole("table", { name: /Estabelecimentos ordenados/ })
    .locator("tbody tr");
  await expect(linhas).toHaveCount(2);

  // A farmácia tem menos de um quarto das compras e vem primeiro.
  await expect(linhas.nth(0)).toContainText("FARMACIA POPULAR");
  await expect(linhas.nth(0)).toContainText("R$ 20,00");
  await expect(linhas.nth(1)).toContainText("MERCADO CENTRAL");
  await expect(linhas.nth(1)).toContainText("R$ 9,00");

  // A participação soma o total do recorte.
  await expect(linhas.nth(0)).toContainText("69,0%");
  await expect(linhas.nth(1)).toContainText("31,0%");
});

test("escolher um estabelecimento abre a evolução dele", async ({ page }) => {
  await semear(page);

  await page.getByRole("link", { name: "Painel", exact: true }).click();
  const secao = page
    .getByRole("heading", { name: "Onde as doações rendem mais" })
    .locator("xpath=ancestor::section[1]");
  await expect(secao).toBeVisible({ timeout: 60000 });

  // Espera a tabela antes de olhar o resto: o cabeçalho da seção aparece
  // imediatamente, mas o ranking chega depois da consulta.
  await expect(
    secao.getByRole("table", { name: /Estabelecimentos ordenados/ }).locator("tbody tr"),
  ).toHaveCount(2, { timeout: 60000 });

  await expect(
    secao.getByText("Escolha um estabelecimento acima"),
  ).toBeVisible();

  await secao.getByRole("button", { name: "MERCADO CENTRAL" }).click();

  // O rótulo é um `Eyebrow` (um <p> com uppercase por CSS), não um heading —
  // e a caixa vem do estilo, então a comparação ignora maiúsculas.
  await expect(
    secao.getByText(/Crédito por mês — MERCADO CENTRAL/i),
  ).toBeVisible({ timeout: 30000 });
});

test("o perfil do doador conta o histórico inteiro de compras", async ({
  page,
}) => {
  await semear(page);

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Perfil", exact: true }).first().click();

  const secao = page
    .getByRole("heading", { name: "Histórico de doações" })
    .locator("xpath=ancestor::section[1]");
  await expect(secao).toBeVisible({ timeout: 60000 });

  // ALICE: 6 compras de R$ 100,00 no mercado e 2 de R$ 50,00 na farmácia.
  await expect(secao.getByText("Compras", { exact: true })).toBeVisible();
  await expect(secao).toContainText("R$ 700,00");

  // Onde mais comprou e onde mais rendeu são estabelecimentos DIFERENTES.
  const maisComprou = secao
    .getByText("Onde mais comprou")
    .locator("xpath=ancestor::div[1]");
  await expect(maisComprou).toContainText("MERCADO CENTRAL");

  const maisRendeu = secao
    .getByText("Onde mais rendeu")
    .locator("xpath=ancestor::div[1]");
  await expect(maisRendeu).toContainText("FARMACIA POPULAR");

  // A tabela é buscada pelo NOME ACESSÍVEL, que vem da legenda. Um
  // `tbody tr` solto pegaria a tabela alternativa do gráfico — ela é
  // `sr-only`, mas continua no DOM e vem antes desta.
  const tabela = secao.getByRole("table", { name: /Compras registradas/ });
  const primeira = tabela.locator("tbody tr").first();
  await expect(primeira).toContainText("R$ ");

  // A data da nota tem de cair DENTRO da própria competência. Enquanto a
  // formatação passava por `new Date("2026-03-01")`, a data era lida como
  // meia-noite em UTC e voltava um dia no fuso local: a linha de março
  // aparecia como 28/02/2026, um mês antes da competência dela.
  await expect(primeira).toContainText("01/03/2026");
  await expect(primeira).toContainText("Março de 2026");
});

test("o painel de Demandas de Moradia não mostra o ranking", async ({
  page,
}) => {
  await semear(page);

  // A exceção pedida: Moradia tem dinâmica própria e o painel dela não usa
  // essas métricas. Sai da divisão que já existe — projeto com Gestão Mensal
  // usa o painel completo, que não inclui a seção.
  await page.getByRole("link", { name: "Dashboard" }).click();
  // Pelo nível 1: "Dashboard" também aparece como título de outra seção da
  // página, e sem o nível a busca casa com dois elementos.
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByRole("heading", { name: "Onde as doações rendem mais" }),
  ).toHaveCount(0);
});
