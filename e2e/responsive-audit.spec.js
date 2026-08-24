import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

test.setTimeout(900000);

/**
 * Vistoria de responsividade de toda a plataforma.
 *
 * Percorre as telas em quatro larguras e falha se alguma quebrar. Existe
 * porque responsividade regride em silêncio: uma coluna a mais numa tabela,
 * um rótulo mais longo, e três meses depois alguém descobre no celular.
 *
 * MEDE em vez de inspecionar classe. Três defeitos, todos verificáveis:
 *
 *   1. a página inteira rolar na horizontal;
 *   2. conteúdo transbordando o próprio contêiner sem rolagem prevista;
 *   3. elemento passando da borda direita da janela.
 *
 * Elemento dentro de um contêiner rolável é IGNORADO de propósito: tabela
 * larga que rola dentro de si mesma é o desenho pretendido, não defeito.
 * Sem essa exceção o relatório enchia de falso positivo — foi assim que a
 * primeira versão acusou 49 problemas que não existiam.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */

// Largura E altura. A altura importa tanto quanto: `baixa` reproduz a
// janela achatada em que a barra lateral quebrava.
const LARGURAS = [
  { nome: "movel   ", w: 375, h: 812 },
  { nome: "tablet  ", w: 768, h: 1024 },
  { nome: "notebook", w: 1024, h: 800 },
  { nome: "desktop ", w: 1440, h: 900 },
  { nome: "baixa   ", w: 1440, h: 600 },
];

// Roda no navegador. Procura três classes de defeito mensuráveis.
function auditar() {
  const vw = document.documentElement.clientWidth;
  const achados = [];

  const nomear = (el) => {
    const cls = String(el.className ?? "").slice(0, 42);
    const txt = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${el.tagName}${cls ? "." + cls : ""}${txt ? ` "${txt}"` : ""}`;
  };

  // 1. A página inteira rola na horizontal.
  const docScroll = document.documentElement.scrollWidth;
  if (docScroll > vw + 1) {
    achados.push(`PAGINA-ROLA-H doc=${docScroll} vw=${vw}`);
  }

  // Elemento dentro de um contêiner que rola na horizontal NÃO é defeito:
  // é o desenho das tabelas largas, que rolam dentro de si mesmas em vez de
  // empurrar a página. Sem esta checagem o relatório enche de falso
  // positivo e esconde os problemas reais.
  const temAncestralQueRola = (el) => {
    let atual = el.parentElement;
    while (atual && atual !== document.body) {
      const ox = getComputedStyle(atual).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      atual = atual.parentElement;
    }
    return false;
  };

  const todos = [...document.querySelectorAll("body *")];

  for (const el of todos) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;

    // 2. Conteúdo transbordando o próprio container, sem rolagem prevista.
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      el.clientWidth > 0 &&
      cs.overflowX === "visible"
    ) {
      achados.push(
        `TRANSBORDA ${nomear(el)} ${el.scrollWidth}>${el.clientWidth}`,
      );
    }

    // 3. Elemento passando da borda direita da janela.
    if (rect.right > vw + 1 && cs.position !== "fixed" && !temAncestralQueRola(el)) {
      achados.push(
        `SAI-DA-TELA ${nomear(el)} right=${Math.round(rect.right)} vw=${vw}`,
      );
    }
  }

  // 4. Item de navegação comprimido.
  //
  // Item de flex nasce encolhível: faltando altura, a barra lateral
  // achatava as linhas até virarem ilegíveis em vez de deixar a lista
  // rolar. A altura da linha não pode depender do tamanho da janela.
  for (const link of document.querySelectorAll("aside a[href]")) {
    const r = link.getBoundingClientRect();
    if (r.height > 0 && r.height < 32) {
      achados.push(
        `NAV-ESPREMIDO ${nomear(link)} h=${Math.round(r.height)}`,
      );
    }
  }

  return { achados: [...new Set(achados)] };
}

async function medir(page, tela) {
  for (const { nome, w, h } of LARGURAS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const { achados } = await page.evaluate(auditar);

    expect(
      achados,
      `${tela.trim()} em ${nome.trim()} (${w}px): ${achados.join(" // ")}`,
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
}

test("nenhuma tela quebra em nenhuma largura", async ({ page }) => {
  const backupPath = fileURLToPath(
    new URL("./fixtures/establishments-backup.json", import.meta.url),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Restaurar backup" }).click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible({ timeout: 120000 });

  await medir(page, "configuracoes");

  const paradas = [
    ["Dashboard", "dashboard      "],
    ["Doadores", "doadores       "],
    ["Gestão Mensal", "mensal         "],
    ["Pessoas", "pessoas        "],
    ["Demandas", "demandas       "],
    ["Anotações", "anotacoes-proj "],
    ["Painel", "painel-plat    "],
    ["Importações", "importacoes    "],
    ["Notas fiscais", "notas-fiscais  "],
    ["Anotações gerais", "anotacoes-plat "],
    ["Lixeira", "lixeira        "],
    ["Histórico", "historico      "],
  ];

  for (const [link, rotulo] of paradas) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await page.waitForTimeout(1400);
    await medir(page, rotulo);
  }

  // Perfil do doador.
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Perfil", exact: true }).first().click();
  await page.waitForTimeout(1800);
  await medir(page, "perfil-doador  ");
});
