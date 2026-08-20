import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { expect, test } from "@playwright/test";

/**
 * O arquivo de backup gerado pelo sistema volta pelo próprio importador.
 *
 * O snapshot deixou de ser montado em JavaScript e passou a ser serializado
 * pelo DuckDB (`json_group_array`), porque montá-lo aqui travava a interface
 * por meio segundo a cada gravação. Isso mudou QUEM escreve o JSON — e é
 * exatamente o tipo de troca que pode passar por todos os testes de unidade e
 * ainda assim gerar um arquivo que não volta.
 *
 * O teste faz a volta completa contra o app de verdade: semeia, exporta,
 * importa o arquivo exportado e confere que os números batem.
 *
 * ATENÇÃO: o e2e roda com `VITE_NOTAR_AUTH_MODE=local`, em que o DuckDB é só
 * memória. Um `page.goto()` no meio do teste APAGA tudo — navegue por clique.
 */
test("o backup exportado é aceito de volta pelo importador", async ({ page }) => {
  const seedPath = fileURLToPath(
    new URL("./fixtures/moradia-credit-backup.json", import.meta.url),
  );

  await page.goto("/p/demandas-de-moradia");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();

  // 1) Semeia com uma fixture conhecida.
  await page.locator('input[type="file"]').setInputFiles(seedPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const seedDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(seedDialog).toBeVisible();
  await seedDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible({
    timeout: 120000,
  });

  // 2) Exporta o que acabou de entrar.
  const download = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "Salvar backup" }).click();
  const exportMessage = page.getByText("Backup exportado:");
  await expect(exportMessage).toBeVisible({ timeout: 120000 });
  // O que o arquivo declara conter.
  const declarado = ((await exportMessage.textContent()) ?? "").replace(
    "Backup exportado:",
    "",
  );
  const exported = await download;
  const exportedPath = path.join(os.tmpdir(), "notar-roundtrip.json");
  await exported.saveAs(exportedPath);

  // 3) Reimporta o arquivo gerado pelo próprio sistema.
  await page.locator('input[type="file"]').setInputFiles(exportedPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const backDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(backDialog).toBeVisible();
  await backDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });

  // A mensagem lista as contagens por tabela; se o arquivo tivesse perdido
  // alguma linha pelo caminho, o texto viria diferente do da semeadura.
  // O que voltou tem de ser o que o arquivo declarava — nem uma linha a
  // menos. Comparar com a fixture ORIGINAL não serviria: o restore deriva
  // os resumos mensais a partir dos CPFs consolidados e grava uma ação no
  // histórico, então o arquivo exportado legitimamente contém mais do que
  // a fixture que o gerou.
  await expect(page.getByText("Backup importado:" + declarado)).toBeVisible({
    timeout: 120000,
  });

  // E o dado continua alcançável pela interface, não só pela contagem.
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("2 resultado(s) na lista")).toBeVisible({
    timeout: 60000,
  });
});
