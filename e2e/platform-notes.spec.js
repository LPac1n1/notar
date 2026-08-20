import { expect, test } from "@playwright/test";

/**
 * Anotações da plataforma convivem com as do projeto, sem se misturar.
 *
 * O projeto continua tendo as dele — que é como já funcionava. O que passou a
 * existir é um espaço acima dos projetos, para o que vale para o sistema
 * inteiro e não pertence a nenhum contexto específico.
 *
 * O teste verifica os DOIS sentidos: nem a anotação do projeto vaza para a
 * plataforma, nem a da plataforma aparece dentro do projeto. Verificar só um
 * lado deixaria passar um filtro escrito ao contrário.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

// O cabeçalho da tela de carregamento tem outro subtítulo; esperar pelo
// botão garante que a lista já chegou antes de ler o texto.
async function abrirAnotacoes(page, { plataforma = false } = {}) {
  // Os dois links convivem na barra lateral quando um projeto está aberto,
  // e o nome é o que os separa.
  await page
    .getByRole("link", {
      name: plataforma ? "Anotações gerais" : "Anotações",
      exact: true,
    })
    .click();
  await expect(page.getByRole("button", { name: "Nova anotação" })).toBeVisible({
    timeout: 60000,
  });
}

async function criarAnotacao(page, titulo) {
  await page.getByRole("button", { name: "Nova anotação" }).click();
  await page.getByPlaceholder("Título").fill(titulo);
  // O editor salva sozinho; fechar força a gravação pendente.
  await page.keyboard.press("Escape");
  await expect(page.getByText(titulo)).toBeVisible();
}

test("a plataforma tem anotações próprias, separadas das do projeto", async ({
  page,
}) => {
  await page.goto("/p/demandas-de-moradia");

  await abrirAnotacoes(page);
  await expect(page.getByText("deste projeto")).toBeVisible();
  await criarAnotacao(page, "Lembrete do projeto");

  // Sai do projeto e abre as anotações da plataforma.
  await page.locator("aside").first().getByRole("button").first().click();
  await abrirAnotacoes(page, { plataforma: true });

  await expect(page.getByText("da plataforma")).toBeVisible();
  await expect(page.getByText("Nenhuma anotação cadastrada")).toBeVisible();
  await expect(page.getByText("Lembrete do projeto")).toHaveCount(0);

  await criarAnotacao(page, "Aviso para todos os projetos");

  // E o que nasce na plataforma não aparece dentro do projeto. Volta pela
  // tela de escolha: estando em /plataforma/anotacoes, o cartão do projeto
  // não está na página.
  await page.locator("aside").first().getByRole("button").first().click();
  await page.getByRole("button", { name: /Demandas de Moradia/ }).first().click();
  await abrirAnotacoes(page);

  await expect(page.getByText("Lembrete do projeto")).toBeVisible();
  await expect(page.getByText("Aviso para todos os projetos")).toHaveCount(0);
});

test("a busca alcança o conteúdo, não só o título", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");
  await abrirAnotacoes(page);

  await criarAnotacao(page, "Reunião de terça");
  await criarAnotacao(page, "Outro assunto");

  const busca = page.getByPlaceholder("Procure por qualquer texto");

  // Sem acento: quem digita "reuniao" espera achar "Reunião".
  await busca.fill("reuniao");
  await expect(page.getByText("Reunião de terça")).toBeVisible();
  await expect(page.getByText("Outro assunto")).toHaveCount(0);

  // Termo que não existe leva ao vazio de BUSCA, e não ao de lista vazia:
  // sugerir "crie a primeira" mandaria cadastrar quem só precisa limpar
  // o campo.
  await busca.fill("nada disso existe");
  await expect(page.getByText("Nenhuma anotação encontrada")).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(page.getByText("Reunião de terça")).toBeVisible();
  await expect(page.getByText("Outro assunto")).toBeVisible();
});
