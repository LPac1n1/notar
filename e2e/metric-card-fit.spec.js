import { expect, test } from "@playwright/test";

/**
 * O valor de uma ficha de métrica nunca estoura a largura do próprio card.
 *
 * Já quebrou duas vezes. Na primeira, o valor quebrava em duas linhas e
 * "R$ 1,00" virava "R$ 1," + "00" — que se lê como outro número. A correção
 * foi uma escada de tamanhos com `whitespace-nowrap`, calibrada num card de
 * ~250px úteis.
 *
 * Na segunda, a escada AUMENTAVA a fonte no `lg` — exatamente o ponto em que
 * a grade passa de 2 para 3 colunas e a ficha encolhe. O card tinha 156px
 * úteis a 1024px e 167px a 1280px, enquanto "R$ 70,00" a 40px pede 169px.
 *
 * Por isso o teste MEDE em vez de inspecionar classe: a falha nasce da
 * relação entre a largura que a GRADE concede e o tamanho que a ESCADA
 * escolhe, e nenhum dos dois lados sozinho denuncia o problema.
 *
 * A sonda usa a fonte REALMENTE renderizada pela ficha, e não a que a escada
 * deveria ter escolhido — senão o teste passaria a validar a minha suposição
 * sobre o componente em vez do componente.
 *
 * Basta cobrir o valor curto: a escada só desce de degrau para textos mais
 * longos, então se o degrau mais alto cabe, os de baixo também cabem.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

// Valor curto e comum: 8 caracteres, o degrau mais alto da escada. Foi
// exatamente ele que estourou quando a fonte subia no `lg`.
const SHORT_CURRENCY = "R$ 70,00";

// Roda no navegador: só enxerga o argumento recebido.
function measureNarrowestCard(sample) {
  const cards = [...document.querySelectorAll('[class*="p-5"]')].filter(
    (el) =>
      el.querySelector(".numeric") &&
      el.className.toString().includes("bg-[var(--surface-elevated)]"),
  );
  if (!cards.length) return { erro: "nenhuma ficha de métrica encontrada" };

  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:nowrap;font-weight:500;font-variant-numeric:tabular-nums;";
  document.body.appendChild(probe);

  let worst = null;
  for (const card of cards) {
    const cs = getComputedStyle(card);
    const util =
      card.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight);

    const valueStyle = getComputedStyle(card.querySelector(".numeric"));
    probe.style.fontSize = valueStyle.fontSize;
    probe.style.fontFamily = valueStyle.fontFamily;
    probe.textContent = sample;
    const need = probe.offsetWidth;

    // Guarda a ficha com a menor folga, que é a que denuncia o problema.
    if (!worst || need - util > worst.need - worst.util) {
      worst = {
        need: Math.round(need),
        util: Math.round(util),
        font: valueStyle.fontSize,
        label: (card.textContent || "").trim().slice(0, 30),
      };
    }
  }
  probe.remove();
  return worst;
}

for (const width of [1024, 1280, 1536, 1920]) {
  test(`o valor da ficha cabe no card em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("link", { name: "Painel", exact: true }).click();
    await expect(page.getByText("Crédito nas planilhas")).toBeVisible();

    const worst = await page.evaluate(measureNarrowestCard, SHORT_CURRENCY);
    expect(worst.erro).toBeUndefined();
    expect(
      worst.need,
      `"${SHORT_CURRENCY}" a ${worst.font} pede ${worst.need}px, e a ficha "${worst.label}" tem ${worst.util}px úteis em ${width}px`,
    ).toBeLessThanOrEqual(worst.util);
  });
}
