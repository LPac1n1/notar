import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * O painel de Demandas de Moradia abre num mês e permite trocar.
 *
 * A fixture tem três competências (jan, fev e mar de 2026) com quantidades
 * DIFERENTES de notas por mês. Se os meses tivessem os mesmos números, um
 * seletor que não recortasse nada passaria no teste.
 *
 * O botão de ocultar valores é verificado pelo que a página EXIBE, e não pelo
 * estado interno: o desfoque vem de uma regra de CSS ancorada num atributo do
 * contêiner, e é esse contrato que precisa continuar valendo.
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

async function abrirPainel(page) {
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible({ timeout: 60000 });
}

async function escolherMes(page, rotulo) {
  await page
    .locator('[data-select-name="dashboardMonth"]')
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("listbox").last().getByRole("option", { name: rotulo }).click();
}

test("dá para trocar o mês e os números acompanham", async ({ page }) => {
  await semear(page);
  await abrirPainel(page);

  // Abre no mês mais recente com dados.
  await expect(
    page.getByRole("heading", { name: "Detalhe de Março de 2026" }),
  ).toBeVisible({ timeout: 60000 });

  await escolherMes(page, "Janeiro de 2026");

  await expect(
    page.getByRole("heading", { name: "Detalhe de Janeiro de 2026" }),
  ).toBeVisible({ timeout: 60000 });

  // Ao sair do mês mais recente, o painel avisa — senão os números pareceriam
  // ser os atuais.
  await expect(page.getByText("Você está vendo um mês anterior")).toBeVisible();

  // E voltando ao mais recente, o aviso some.
  await escolherMes(page, "Março de 2026");
  await expect(
    page.getByRole("heading", { name: "Detalhe de Março de 2026" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("Você está vendo um mês anterior")).toHaveCount(0);
});

test("os valores começam ocultos e a escolha é lembrada", async ({ page }) => {
  await semear(page);
  await abrirPainel(page);

  const conteudo = page.locator("[data-values-hidden]");

  // O padrão é ocultar: a página abre sem expor cifras para quem estiver por
  // perto, e mostrar passa a ser um ato deliberado.
  await expect(conteudo).toHaveAttribute("data-values-hidden", "true");
  await expect(
    page.getByRole("button", { name: "Mostrar valores" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mostrar valores" }).click();
  await expect(conteudo).toHaveAttribute("data-values-hidden", "false");

  // Sai do painel e volta: a escolha sobrevive à navegação.
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await abrirPainel(page);
  await expect(page.locator("[data-values-hidden]")).toHaveAttribute(
    "data-values-hidden",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Ocultar valores" }),
  ).toBeVisible();
});

test("os valores viram bolinhas e os rótulos continuam legíveis", async ({
  page,
}) => {
  await semear(page);
  await abrirPainel(page);

  await expect(page.locator("[data-values-hidden]")).toHaveAttribute(
    "data-values-hidden",
    "true",
  );

  const medido = await page.evaluate(() => {
    const ler = (seletor) => {
      const el = document.querySelector(seletor);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        textSecurity: cs.webkitTextSecurity ?? null,
        filtro: cs.filter,
      };
    };

    return {
      valor: ler("[data-values-hidden] .numeric"),
      rotulo: ler("[data-values-hidden] .eyebrow"),
    };
  });

  // Cada caractere do valor vira uma bolinha, como num campo de senha. O
  // desfoque só entra como retaguarda em navegador sem a propriedade — em
  // Chromium, que é onde este teste roda, o esperado é o mascaramento.
  expect(medido.valor.textSecurity).toBe("disc");
  expect(medido.valor.filtro).toBe("none");

  // O rótulo ao lado continua legível, senão a tela viraria um bloco
  // indistinguível em vez de uma estrutura com os números cobertos.
  expect(medido.rotulo.textSecurity).toBe("none");
  expect(medido.rotulo.filtro).toBe("none");
});

test("no texto de apoio, só os números somem", async ({ page }) => {
  await semear(page);
  await abrirPainel(page);

  // "2 de 2 doador(es) cadastrado(s) doaram." precisa continuar dizendo o que
  // descreve. Cobrir a frase inteira transformaria o apoio numa fileira de
  // pontinhos e o cartão perderia o significado junto com o valor.
  const apoio = page
    .getByText("doador(es) cadastrado(s) doaram", { exact: false })
    .first();
  await expect(apoio).toBeVisible();

  const partes = await apoio.evaluate((el) => ({
    mascarados: [...el.querySelectorAll(".numeric")].map((n) => n.textContent),
    // O parágrafo em si não pode estar mascarado — só os pedaços numéricos.
    textSecurityDoParagrafo: getComputedStyle(el).webkitTextSecurity,
  }));

  expect(partes.textSecurityDoParagrafo).toBe("none");
  expect(partes.mascarados.length).toBeGreaterThan(0);
  // O que foi marcado como valor é numérico, e não palavra solta.
  for (const trecho of partes.mascarados) {
    expect(trecho).toMatch(/\d/);
  }
});
