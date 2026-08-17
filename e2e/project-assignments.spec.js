import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

/**
 * Fase 1 da plataforma multiprojeto é deliberadamente invisível: nenhuma tela
 * muda. Passar nos outros testes só prova que nada quebrou — não prova que o
 * vínculo está sendo criado.
 *
 * Este teste fecha essa lacuna pelo backup, que é a janela para o estado real
 * do banco: exporta o arquivo e confere que o projeto padrão existe e que o
 * doador recém-cadastrado saiu vinculado a ele. Cobre a cadeia inteira no
 * runtime de verdade — migration no navegador, criação do doador, vínculo e
 * serialização do snapshot.
 */
test("doador cadastrado nasce vinculado ao projeto padrão", async ({ page }) => {
  await page.goto("/p/demandas-de-moradia");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Cestas Basicas");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("CESTAS BASICAS")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Alice Vinculada");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("52998224725");
  await selectOption(page, donorDialog, "demand", "CESTAS BASICAS");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(donorDialog).toBeHidden();
  await expect(page.getByText("ALICE VINCULADA")).toBeVisible();

  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar backup" }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  const projects = backup.data.projects ?? [];
  expect(projects).toHaveLength(1);
  expect(projects[0].name).toBe("Demandas de Moradia");
  // O projeto padrão é o sistema como ele existe hoje: Gestão Mensal ligada.
  expect(JSON.parse(projects[0].modules).monthly).toBe(true);

  const assignments = backup.data.donorProjectAssignments ?? [];
  expect(assignments).toHaveLength(1);
  expect(assignments[0].project_id).toBe(projects[0].id);
  // Vigência aberta e sem limite inferior: uma planilha retroativa anterior
  // ao cadastro precisa ser atribuída a este projeto, não ficar órfã.
  expect(assignments[0].valid_from).toContain("1900-01-01");
  expect(assignments[0].valid_to).toContain("9999-12-01");

  const donors = backup.data.donors ?? [];
  expect(assignments[0].donor_id).toBe(donors[0].id);
});
