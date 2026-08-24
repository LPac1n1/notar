import { expect, test } from "@playwright/test";

/**
 * O salvamento automático das anotações.
 *
 * É o único ponto do sistema que pode perder trabalho do usuário sem deixar
 * rastro: todo o resto vem de planilha e pode ser reimportado, mas anotação
 * é texto digitado à mão, sem origem para recuperar.
 *
 * São duas máquinas de estado paralelas — uma para criar e outra para editar
 * — que se entrelaçam por mais de uma dezena de referências. O que este
 * arquivo prende é o COMPORTAMENTO observável delas, não a implementação:
 * um refactor futuro pode reorganizar tudo por dentro desde que estes casos
 * continuem valendo.
 *
 * O temporizador dispara 800ms depois da última tecla (AUTO_SAVE_DELAY_MS).
 * Os dois lados dessa janela são testados de propósito: fechar ANTES dela
 * exercita o flush no fechamento, e esperar exercita o temporizador.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

const AUTO_SAVE_DELAY_MS = 800;

async function abrirAnotacoes(page) {
  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Anotações", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Anotações" }),
  ).toBeVisible();
}

// O card não abre pelo texto: ele tem um botão "Editar" próprio, e mirar o
// botão do card certo evita pegar o de outra anotação da lista.
function abrirParaEditar(page, titulo) {
  return page
    .getByRole("article")
    .filter({ hasText: titulo })
    .getByRole("button", { name: "Editar" })
    .click();
}

// Sai da página e volta, para provar que o texto foi ao banco em vez de ter
// ficado só no estado do React.
async function recarregarPelaNavegacao(page) {
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Doadores" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Anotações", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Anotações" }),
  ).toBeVisible();
}

test("fechar antes do temporizador disparar não perde o texto", async ({
  page,
}) => {
  await abrirAnotacoes(page);

  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill("Fechada às pressas");

  // Fecha IMEDIATAMENTE, dentro da janela de 800ms. O temporizador ainda não
  // rodou, então quem precisa salvar é o caminho de fechamento. Sem ele, o
  // texto sumiria sem nenhum aviso.
  await page.keyboard.press("Escape");

  await expect(page.getByText("Fechada às pressas")).toBeVisible();

  await recarregarPelaNavegacao(page);
  await expect(page.getByText("Fechada às pressas")).toBeVisible();
});

test("esperar o temporizador salva sem duplicar ao fechar", async ({
  page,
}) => {
  await abrirAnotacoes(page);

  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill("Salva pelo temporizador");

  // Passa da janela: agora quem grava é o temporizador.
  await page.waitForTimeout(AUTO_SAVE_DELAY_MS + 600);

  // E então fecha. O fechamento também tenta gravar — se ele criasse um
  // registro novo em vez de atualizar o mesmo rascunho, a lista terminaria
  // com duas anotações iguais.
  await page.keyboard.press("Escape");

  await recarregarPelaNavegacao(page);
  await expect(page.getByText("Salva pelo temporizador")).toHaveCount(1);
});

test("abrir e fechar uma anotação intocada não a altera nem duplica", async ({
  page,
}) => {
  await abrirAnotacoes(page);

  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill("Intocada");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Intocada")).toBeVisible();

  await recarregarPelaNavegacao(page);

  // Abre para ler e fecha sem digitar nada. A impressão digital do conteúdo
  // não mudou, então nada deve ser gravado — nem uma cópia, nem uma versão
  // vazia por cima da boa.
  await abrirParaEditar(page, "Intocada");
  await expect(page.getByPlaceholder("Título")).toHaveValue("Intocada");
  await page.keyboard.press("Escape");

  await recarregarPelaNavegacao(page);
  await expect(page.getByText("Intocada")).toHaveCount(1);
});

test("editar uma anotação existente preserva o texto novo", async ({
  page,
}) => {
  await abrirAnotacoes(page);

  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill("Antes da edição");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Antes da edição")).toBeVisible();

  await recarregarPelaNavegacao(page);

  // A máquina de EDIÇÃO é a outra das duas, e tem o mesmo risco: fechar
  // dentro da janela de 800ms depois de trocar o texto.
  await abrirParaEditar(page, "Antes da edição");
  await page.getByPlaceholder("Título").fill("Depois da edição");
  await page.keyboard.press("Escape");

  await recarregarPelaNavegacao(page);
  await expect(page.getByText("Depois da edição")).toBeVisible();
  await expect(page.getByText("Antes da edição")).toHaveCount(0);
});
