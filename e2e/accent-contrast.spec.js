import { expect, test } from "@playwright/test";

/**
 * Contraste do texto sobre a cor de acento, nos dois temas.
 *
 * O valor era um hexadecimal cravado no componente, e por isso não variava com
 * o tema: quase-preto funcionava no escuro (acento claro) e reprovava no claro
 * (acento escuro), medindo 3,0:1 contra o mínimo AA de 4,5:1 — no botão
 * primário, que é o mais usado do sistema.
 *
 * Este teste existe para o token não voltar a ser cor fixa sem alguém notar.
 */
function parse(color) {
  const n = color.match(/[\d.]+/g).map(Number);
  return { r: n[0], g: n[1], b: n[2] };
}

function luminance({ r, g, b }) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("o texto sobre o acento passa AA nos dois temas", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");
  await page.locator("aside").first().getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

  const botao = page.getByRole("button", { name: "Adicionar projeto" }).first();

  for (const tema of ["Claro", "Escuro"]) {
    await page.getByRole("link", { name: "Configurações" }).click();
    await page.getByRole("button", { name: tema, exact: true }).click();
    await page.locator("aside").first().getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

    const cores = await botao.evaluate((node) => {
      const cs = getComputedStyle(node);
      return { cor: cs.color, fundo: cs.backgroundColor };
    });

    const razao = contrast(parse(cores.cor), parse(cores.fundo));
    expect(razao, `tema ${tema}: ${cores.cor} sobre ${cores.fundo}`).toBeGreaterThanOrEqual(4.5);
  }
});
