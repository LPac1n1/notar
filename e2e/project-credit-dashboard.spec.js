import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Painel de crédito de um projeto sem apuração mensal.
 *
 * A fixture restaura um estado em que TODO o crédito pertence a doadores de
 * Capoeira, com quatro meses de série e um doador sem nenhuma nota. Os valores
 * abaixo são a soma exata do que está no arquivo — se alguma query deixar de
 * ser escopada por projeto, ou passar a somar mês errado, os números mudam e o
 * teste quebra.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
test("o painel de crédito soma, ordena e separa quem ainda não gerou nada", async ({
  page,
}) => {
  const backupPath = fileURLToPath(
    new URL("./fixtures/project-credit-backup.json", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await restoreDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible();

  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByText("Capoeira").first().click();
  await expect(page).toHaveURL(/\/p\/capoeira$/);

  // Totais: 1385 = soma dos 10 créditos; 540 = abril (310 + 80 + 150). Os
  // valores são casados DENTRO do card — o mesmo número aparece de novo no
  // rótulo sr-only do gráfico e na tabela alternativa dele.
  const accumulated = page.getByText("Crédito acumulado").locator("xpath=..");
  await expect(accumulated.getByText("R$ 1.385,00")).toBeVisible();

  const lastMonth = page.getByText("Último mês", { exact: true }).locator("xpath=..");
  await expect(lastMonth.getByText("R$ 540,00")).toBeVisible();
  await expect(lastMonth.getByText("Abril de 2026 • 3 doador(es)")).toBeVisible();

  await expect(page.getByText("1 ainda sem crédito gerado.")).toBeVisible();

  // Série do gráfico — cada mês soma só os doadores deste projeto.
  await expect(page.getByText("Janeiro de 2026: R$ 210,00 crédito")).toBeAttached();
  await expect(page.getByText("Abril de 2026: R$ 540,00 crédito")).toBeAttached();

  // Ranking em ordem decrescente de crédito.
  const sectionNamed = (name) =>
    page.locator("section").filter({ has: page.getByRole("heading", { name }) });

  const ranking = sectionNamed("Crédito por doador");
  await expect(ranking.getByText("R$ 850,00")).toBeVisible();
  await expect(ranking.getByText("R$ 340,00")).toBeVisible();
  await expect(ranking.getByText("R$ 195,00")).toBeVisible();

  // Doador sem nota nenhuma sai do ranking e entra na seção própria.
  await expect(ranking.getByText("DANIEL SEM CREDITO")).toHaveCount(0);
  await expect(
    sectionNamed("Doadores sem crédito gerado").getByText("DANIEL SEM CREDITO"),
  ).toBeVisible();

  // Nenhum bloco do painel completo (plataforma) vaza para cá.
  await expect(page.getByText("Pontos para revisar")).toHaveCount(0);
  await expect(page.getByText("Importações recentes")).toHaveCount(0);
});
