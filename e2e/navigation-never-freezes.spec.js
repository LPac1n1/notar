import { expect, test } from "@playwright/test";

/**
 * A navegação não pode congelar.
 *
 * O contrato: depois de qualquer sequência de navegação, o conteúdo tem de
 * corresponder à URL, e o clique seguinte tem de continuar funcionando.
 *
 * Contexto honesto de por que este arquivo existe: houve um relato de tela
 * congelada — conteúdo parado numa página antiga enquanto a URL mudava, com
 * os botões de navegação aparentemente mortos. Eu observei esse estado UMA
 * vez, navegando a cada 90ms, e não consegui reproduzi-lo de novo. Portanto
 * este teste NÃO é a reprodução daquele defeito; ele trava o comportamento
 * que precisa valer, para que uma regressão futura desta forma seja pega.
 *
 * A causa raiz do relato segue em aberto. O que foi removido de propósito
 * (ver `PageTransition`) foi um acoplamento que tornava esse estado possível:
 * o `<Routes>` ficava dentro de um filho de `AnimatePresence` em
 * `mode="wait"`, então a troca de conteúdo dependia de uma animação de saída
 * terminar. Era uma fragilidade real, independentemente de ser ou não a causa
 * do que o usuário viu.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique
 * ou pelo history.
 */

const PROJETO = "/p/demandas-de-moradia";

// O título que cada rota precisa mostrar quando é ela que está no ar.
const TITULO_POR_ROTA = new Map([
  [`${PROJETO}`, "Dashboard"],
  [`${PROJETO}/doadores`, "Doadores"],
  [`${PROJETO}/mensal`, "Gestão Mensal"],
  [`${PROJETO}/anotacoes`, "Anotações"],
  [`${PROJETO}/pessoas`, "Pessoas"],
  [`${PROJETO}/demandas`, "Demandas"],
  ["/importacoes", "Importações"],
  ["/configuracoes", "Configurações"],
]);

function irPara(page, rota) {
  // Empurra pelo history, que é o mesmo caminho que o React Router usa por
  // dentro — e permite cravar o intervalo entre navegações.
  return page.evaluate((destino) => {
    window.history.pushState({}, "", destino);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, rota);
}

function tituloNaTela(page) {
  return page.getByRole("heading", { level: 1 }).first().innerText();
}

// 90ms cai dentro da janela de saída de 180ms — era exatamente onde o
// congelamento aparecia. Os outros valores cercam a janela dos dois lados.
for (const intervalo of [40, 90, 150]) {
  test(`o conteúdo acompanha a URL navegando a cada ${intervalo}ms`, async ({
    page,
  }) => {
    await page.goto(PROJETO);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Esta sequência não é decorativa: foi ela que reproduziu o
    // congelamento. Ela alterna entre rotas de projeto e rotas de plataforma,
    // que é quando o `ProjectGate` entra e sai — e o gate renderiza
    // `<Navigate>` e `<LoadingScreen>`, disparando remontagens extras dentro
    // da janela da animação. Mexer na ordem faz o caso deixar de reproduzir.
    const rotas = [
      `${PROJETO}/doadores`,
      `${PROJETO}/mensal`,
      `${PROJETO}/anotacoes`,
      `${PROJETO}/pessoas`,
      `${PROJETO}/demandas`,
      "/importacoes",
      `${PROJETO}`,
      `${PROJETO}/doadores`,
      "/configuracoes",
      `${PROJETO}/mensal`,
    ];

    for (const rota of rotas) {
      await irPara(page, rota);
      await page.waitForTimeout(intervalo);
    }

    // Depois da rajada, a tela precisa corresponder à última rota.
    const ultima = rotas[rotas.length - 1];
    await expect
      .poll(() => tituloNaTela(page), { timeout: 15000 })
      .toBe(TITULO_POR_ROTA.get(ultima));

    // E a navegação por clique tem de continuar viva — era isto que o usuário
    // via como "nenhum botão funciona mais".
    await page.getByRole("link", { name: "Doadores", exact: true }).first().click();
    await expect
      .poll(() => tituloNaTela(page), { timeout: 15000 })
      .toBe("Doadores");
  });
}

test("voltar pelo navegador durante a transição não congela a tela", async ({
  page,
}) => {
  await page.goto(PROJETO);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).first().click();
  await expect.poll(() => tituloNaTela(page)).toBe("Doadores");

  await page.getByRole("link", { name: "Gestão Mensal", exact: true }).first().click();
  // Volta ANTES de a transição terminar.
  await page.waitForTimeout(60);
  await page.goBack();

  await expect.poll(() => tituloNaTela(page), { timeout: 15000 }).toBe("Doadores");

  // E segue navegável.
  await page.getByRole("link", { name: "Anotações", exact: true }).first().click();
  await expect
    .poll(() => tituloNaTela(page), { timeout: 15000 })
    .toBe("Anotações");
});
