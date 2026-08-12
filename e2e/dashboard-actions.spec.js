import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

async function addDonor(page, { name, cpf, demand }) {
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.getByPlaceholder("CPF", { exact: true }).fill(cpf);
  await selectOption(page, dialog, "demand", demand);
  // Início das doações deixado em branco de propósito.
  await dialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(dialog).toBeHidden();
}

test("dashboard resolve doadores sem início pelo próprio modal", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Cestas Basicas");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("CESTAS BASICAS")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await addDonor(page, {
    name: "Alice Sem Inicio",
    cpf: "52998224725",
    demand: "CESTAS BASICAS",
  });
  await addDonor(page, {
    name: "Bruno Sem Inicio",
    cpf: "11144477735",
    demand: "CESTAS BASICAS",
  });

  await page.getByRole("link", { name: "Dashboard" }).click();

  // O card deve contar os 2 doadores sem início.
  const reviewCard = page
    .locator("button")
    .filter({ hasText: "Sem início" })
    .first();
  await expect(reviewCard).toContainText("2");
  await reviewCard.click();

  const dialog = page.getByRole("dialog", {
    name: "Doadores sem início das doações",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("ALICE SEM INICIO")).toBeVisible();
  await expect(dialog.getByText("BRUNO SEM INICIO")).toBeVisible();

  // ── Correção inline ──────────────────────────────────────────────
  const aliceRow = dialog
    .locator("div")
    .filter({ hasText: "ALICE SEM INICIO" })
    .filter({ has: page.locator('input[name="donationStartDate"]') })
    .last();
  await aliceRow.locator('input[name="donationStartDate"]').fill("03/2026");
  await aliceRow.getByRole("button", { name: "Definir início" }).click();

  await expect(
    dialog.getByText("Início das doações definido para Março de 2026"),
  ).toBeVisible();
  await expect(dialog.getByText("ALICE SEM INICIO")).toBeHidden();
  await expect(dialog.getByText("BRUNO SEM INICIO")).toBeVisible();

  // ── Exclusão com confirmação em duas etapas + desfazer ───────────
  const brunoRow = dialog
    .locator("div")
    .filter({ hasText: "BRUNO SEM INICIO" })
    .filter({ has: page.getByRole("button", { name: "Excluir doador" }) })
    .last();
  await brunoRow.getByRole("button", { name: "Excluir doador" }).click();
  await expect(dialog.getByText("Excluir BRUNO SEM INICIO?")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar" }).click();

  await expect(
    dialog.getByText("BRUNO SEM INICIO foi enviado para a lixeira"),
  ).toBeVisible();
  await expect(dialog.getByText("Nenhum doador sem início encontrado")).toBeVisible();

  await dialog.getByRole("button", { name: "Desfazer" }).click();
  await expect(dialog.getByText("BRUNO SEM INICIO")).toBeVisible();

  // Fechar limpa o feedback do modal anterior.
  await dialog.getByRole("button", { name: "Fechar modal" }).click();
  await reviewCard.click();
  await expect(
    dialog.getByText("foi enviado para a lixeira"),
  ).toBeHidden();

  // Confirma que a correção persistiu no cadastro.
  await dialog.getByRole("button", { name: "Fechar modal" }).click();
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("Março de 2026").first()).toBeVisible();
});

test("dashboard vincula demanda de doador sem demanda pelo próprio modal", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  const demandDialog = page.getByRole("dialog", { name: "Adicionar demanda" });
  await demandDialog.getByPlaceholder("Nome da demanda").fill("Remedios");
  await demandDialog.getByRole("button", { name: "Adicionar demanda" }).click();
  await expect(page.getByText("REMEDIOS")).toBeVisible();

  // Pessoa de referência não tem demanda, então o auxiliar ligado a ela não
  // tem nada para herdar — é assim que um doador sem demanda nasce.
  await page.getByRole("link", { name: "Pessoas" }).click();
  await page.getByRole("button", { name: "Adicionar pessoa" }).click();
  const personDialog = page.getByRole("dialog", { name: "Adicionar pessoa" });
  await personDialog.getByPlaceholder("Nome da pessoa").fill("Carla Referencia");
  await personDialog.getByPlaceholder("CPF").fill("52998224725");
  await personDialog.getByRole("button", { name: "Adicionar pessoa" }).click();
  await expect(page.getByText("CARLA REFERENCIA")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await selectOption(page, donorDialog, "donorType", "Auxiliar");
  await selectOption(page, donorDialog, "holderPersonId", /CARLA REFERENCIA/);
  await donorDialog.locator('input[name="name"]').fill("Diego Sem Demanda");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("11144477735");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(donorDialog).toBeHidden();

  await page.getByRole("link", { name: "Dashboard" }).click();

  const reviewCard = page
    .locator("button")
    .filter({ hasText: "Sem demanda" })
    .first();
  await expect(reviewCard).toContainText("1");
  await reviewCard.click();

  const dialog = page.getByRole("dialog", { name: "Doadores sem demanda" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("DIEGO SEM DEMANDA")).toBeVisible();

  const row = dialog
    .locator("div")
    .filter({ hasText: "DIEGO SEM DEMANDA" })
    .filter({ has: page.getByRole("button", { name: "Vincular demanda" }) })
    .last();
  await selectOption(page, row, "demand", "REMEDIOS");
  await row.getByRole("button", { name: "Vincular demanda" }).click();

  await expect(dialog.getByText('Demanda "REMEDIOS" vinculada ao doador')).toBeVisible();
  await expect(dialog.getByText("Nenhum doador sem demanda encontrado")).toBeVisible();

  await dialog.getByRole("button", { name: "Fechar modal" }).click();
  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("REMEDIOS").first()).toBeVisible();
});

test("sem início distingue quem já doou e pré-preenche o mês da primeira nota", async ({ page }) => {
  // Fixture: Ana tem 20 notas (jan e mar/2026) e nenhum início; Bruno não
  // tem nota nenhuma e também nenhum início.
  const backupPath = fileURLToPath(
    new URL("./fixtures/donors-without-start-backup.json", import.meta.url),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.locator("button").filter({ hasText: "Sem início" }).first().click();

  const dialog = page.getByRole("dialog", {
    name: "Doadores sem início das doações",
  });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByText("Já doou", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Nunca doou", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(
      "20 nota(s) em 2 mês(es) — da primeira em Janeiro de 2026 até Março de 2026.",
    ),
  ).toBeVisible();

  // Quem já doou vem primeiro: é quem está gerando nota sem início declarado.
  const names = await dialog.locator("p.font-medium").allInnerTexts();
  expect(names[0]).toContain("ANA QUE DOOU");

  // Só a linha de quem já doou vem preenchida — e com o mês da PRIMEIRA nota,
  // senão salvar fecharia esta pendência e abriria uma "antes do início".
  await expect
    .poll(() =>
      dialog
        .locator('input[name="donationStartDate"]')
        .evaluateAll((nodes) => nodes.map((node) => node.value)),
    )
    .toEqual(["01/2026", ""]);

  // Salvar o valor sugerido não pode criar a inconsistência vizinha.
  await dialog.getByRole("button", { name: "Definir início" }).first().click();
  await expect(
    dialog.getByText("Início das doações definido para Janeiro de 2026"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar modal" }).click();
  await expect(
    page.locator("button").filter({ hasText: "Antes do início" }),
  ).toHaveCount(0);
});

test("titular sem doação vira pessoa de referência mantendo o vínculo do auxiliar", async ({ page }) => {
  // Fixture: Bruno é titular, nunca doou e não tem início; Carla é auxiliar
  // ATIVA vinculada a ele. É essa condição que faz a linha em `people`
  // sobreviver à remoção do cadastro de doador.
  const backupPath = fileURLToPath(
    new URL("./fixtures/donors-without-start-backup.json", import.meta.url),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Cópia de segurança" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog
    .getByRole("button", { name: "Restaurar backup" })
    .click({ force: true });
  await expect(page.getByText("Backup importado:")).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.locator("button").filter({ hasText: "Sem início" }).first().click();

  const dialog = page.getByRole("dialog", {
    name: "Doadores sem início das doações",
  });
  await expect(dialog).toBeVisible();

  await expect(
    dialog.getByText("1 auxiliar(es) vinculado(s):"),
  ).toBeVisible();
  await expect(dialog.getByText("CARLA AUXILIAR")).toBeVisible();

  // Ana também está sem início, mas não tem auxiliar — converter apagaria a
  // pessoa junto, então a ação não pode ser oferecida para ela.
  await expect(
    dialog.getByRole("button", { name: "Tornar pessoa de referência" }),
  ).toHaveCount(1);

  await dialog
    .getByRole("button", { name: "Tornar pessoa de referência" })
    .click();
  await expect(
    dialog.getByText(
      "Remover o cadastro de doador de BRUNO QUE NAO DOOU e manter só a pessoa?",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar" }).click();

  await expect(
    dialog.getByText("BRUNO QUE NAO DOOU agora é uma pessoa de referência"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar modal" }).click();

  // O cadastro de doador some, a pessoa fica — e o auxiliar continua ligado.
  await page.getByRole("link", { name: "Pessoas" }).click();
  await expect(page.getByText("1 pessoa(s) sem papel de doador.")).toBeVisible();
  await expect(page.getByText("BRUNO QUE NAO DOOU")).toBeVisible();
  await expect(page.getByText("via auxiliar")).toBeVisible();

  await page.getByRole("link", { name: "Doadores", exact: true }).click();
  await expect(page.getByText("2 doador(es) cadastrado(s).")).toBeVisible();
});
