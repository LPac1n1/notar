import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

/**
 * Números da sorte: uma nota doada, um número, na ordem da compra.
 *
 * O que este arquivo prende é o que torna a lista utilizável num sorteio:
 * a numeração começa em 1 e é contínua, o CSV baixado traz os mesmos números
 * da tela, e nem a tela nem o arquivo expõem o CPF inteiro, o nome completo,
 * o valor da nota ou o crédito gerado.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

const BACKUP = fileURLToPath(
  new URL("./fixtures/establishments-backup.json", import.meta.url),
);

async function semear(page) {
  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(BACKUP);
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

async function abrirSorteio(page) {
  await page.getByRole("link", { name: "Números da sorte" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Números da sorte" }),
  ).toBeVisible({ timeout: 60000 });
  // A lista só existe depois de o período ancorar no mês mais recente e a
  // consulta voltar. Sem esperar, o teste leria a tabela vazia da primeira
  // pintura e falharia por motivo que não é o que ele investiga.
  await expect(page.locator("table tbody tr").first()).toBeVisible({
    timeout: 60000,
  });
}

test("a lista numera as notas a partir de 1, sem buraco", async ({ page }) => {
  await semear(page);
  await abrirSorteio(page);

  const numeros = await page
    .locator("table tbody tr td:first-child")
    .allInnerTexts();

  expect(numeros.length).toBeGreaterThan(0);

  // Contínua e começando em 1: um buraco significaria um bilhete sem dono, e
  // um começo em outro número quebraria a correspondência com o sorteio.
  const comoNumeros = numeros.map((t) => Number(t.replace(/\D/g, "")));
  expect(comoNumeros[0]).toBe(1);
  for (let i = 1; i < comoNumeros.length; i += 1) {
    expect(comoNumeros[i]).toBe(comoNumeros[i - 1] + 1);
  }
});

test("a tela não mostra CPF inteiro, valor da nota nem crédito", async ({
  page,
}) => {
  await semear(page);
  await abrirSorteio(page);

  const tabela = await page.locator("table").first().innerText();

  // CPF sempre mascarado: nenhuma sequência de 11 dígitos, e nenhum CPF
  // formatado com os três primeiros à mostra.
  expect(tabela).not.toMatch(/\d{11}/);
  expect(tabela).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  expect(tabela).toMatch(/\*\*\*\.\d{3}\.\d{3}-\*\*/);

  // Nenhuma cifra: a lista não fala de dinheiro em lugar nenhum.
  expect(tabela).not.toContain("R$");

  // As colunas são exatamente estas quatro — e nenhuma de valor. Comparado
  // em minúsculas porque o cabeçalho é exibido em versalete por CSS.
  const cabecalhos = await page.locator("table thead th").allInnerTexts();
  expect(cabecalhos.map((t) => t.trim().toLowerCase())).toEqual([
    "número",
    "nome",
    "cpf",
    "data da nota",
  ]);
});

test("o CSV baixado traz os mesmos números e o mesmo mascaramento", async ({
  page,
}) => {
  await semear(page);
  await abrirSorteio(page);

  const numerosNaTela = await page
    .locator("table tbody tr td:first-child")
    .allInnerTexts();

  const baixa = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "Exportar lista" }).click();
  const arquivo = await baixa;
  const fluxo = await arquivo.createReadStream();
  const pedacos = [];
  for await (const pedaco of fluxo) pedacos.push(pedaco);
  const csv = Buffer.concat(pedacos).toString("utf8");

  expect(csv).toContain("Número");
  expect(csv).toContain("Data da nota");
  // Mesma proteção do lado do arquivo — é ele que circula por e-mail.
  expect(csv).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  expect(csv).toContain("***.");
  expect(csv).not.toContain("R$");

  // O primeiro número da tela precisa existir no arquivo.
  const primeiro = numerosNaTela[0].replace(/\D/g, "");
  expect(csv).toMatch(new RegExp(`(^|\\n)"?${primeiro}"?[;,]`));
});

test("dá para trocar entre o recorte mensal e o anual", async ({ page }) => {
  await semear(page);
  await abrirSorteio(page);

  const contarLinhas = () => page.locator("table tbody tr").count();
  const doMes = await contarLinhas();

  await page.locator('[data-select-name="raffleScope"]').getByRole("button").first().click();
  await page.getByRole("listbox").last().getByRole("option", { name: "Ano" }).click();

  // Espera a MUDANÇA, não um valor que o resultado antigo já satisfaz: a
  // fixture tem três meses, então o ano precisa somar mais notas que um mês.
  await expect
    .poll(() => contarLinhas(), { timeout: 30000 })
    .toBeGreaterThan(doMes);
});
