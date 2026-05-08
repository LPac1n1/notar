import { test, expect } from "@playwright/test";

async function selectOption(page, container, name, label) {
  const select = container.locator(`[data-select-name="${name}"]`);
  await select.getByRole("button").first().click();
  const listbox = page.getByRole("listbox").last();
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: label }).first().click();
}

test("copy buttons and notes flow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  await page
    .getByRole("dialog", { name: "Adicionar demanda" })
    .getByPlaceholder("Nome da demanda")
    .fill("Demanda Copy");
  await page
    .getByRole("dialog", { name: "Adicionar demanda" })
    .getByRole("button", { name: "Adicionar demanda" })
    .click();
  await expect(page.getByText("DEMANDA COPY")).toBeVisible();

  await page.getByRole("link", { name: "Doadores" }).click();
  await page.getByRole("button", { name: "Adicionar doador" }).click();
  const donorDialog = page.getByRole("dialog", { name: "Adicionar doador" });
  await donorDialog.locator('input[name="name"]').fill("Ana Copia");
  await donorDialog.getByPlaceholder("CPF", { exact: true }).fill("12345678909");
  await selectOption(page, donorDialog, "demand", "DEMANDA COPY");
  await donorDialog.locator('input[name="donationStartDate"]').fill("01/2026");
  await donorDialog.getByRole("button", { name: "Adicionar doador" }).click();
  await expect(page.getByRole("button", { name: "ANA COPIA" })).toBeVisible();

  const copyNameButton = page.getByRole("button", { name: "Copiar nome" }).first();
  await copyNameButton.click();
  await expect(copyNameButton).toHaveAttribute("data-copy-state", "copied");
  await expect(copyNameButton).toHaveAttribute("title", "Copiado");

  await page.getByRole("link", { name: "Anotações" }).click();
  await page.getByRole("button", { name: "Nova anotação" }).click();
  const noteDialog = page.getByRole("dialog", { name: "Nova anotação" });
  await noteDialog.getByPlaceholder("Título da anotação").fill("Nota de teste");
  await expect(noteDialog.getByText("Prévia")).toHaveCount(0);
  const editor = noteDialog.getByTestId("note-rich-editor");
  await editor.click();
  await page.keyboard.type("# ");
  await expect(editor.locator("h2")).toBeVisible();
  await page.keyboard.type("Titulo imediato");
  await expect(
    noteDialog.getByRole("heading", { name: "Titulo imediato" }),
  ).toBeVisible();
  await editor.evaluate((element) => {
    element.innerHTML = "<p><br></p>";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await editor.click();
  await noteDialog.getByRole("button", { name: "Título", exact: true }).click();
  await page.keyboard.type("Titulo por botão");
  await expect(
    editor.locator("h2").filter({ hasText: "Titulo por botão" }),
  ).toBeVisible();

  await editor.evaluate((element) => {
    element.innerHTML = "<p><strong>Negrito</strong> normal</p>";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const paragraph = element.querySelector("p");
    const strongText = paragraph.querySelector("strong").firstChild;
    const normalText = paragraph.childNodes[1];
    const range = document.createRange();
    range.setStart(strongText, 0);
    range.setEnd(normalText, normalText.textContent.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await noteDialog.getByRole("button", { name: "Negrito" }).click();
  await expect(editor.locator("strong")).toHaveText("Negrito normal");

  await editor.evaluate((element) => {
    element.innerHTML = "<p><strong>Negrito</strong> normal</p>";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const strongText = element.querySelector("strong").firstChild;
    const range = document.createRange();
    range.setStart(strongText, 0);
    range.setEnd(strongText, strongText.textContent.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await noteDialog.getByRole("button", { name: "Negrito" }).click();
  await expect(editor.locator("strong")).toHaveCount(0);
  await expect(editor).toContainText("Negrito normal");

  await editor.evaluate((element) => {
    element.innerHTML = "<p>palavra</p>";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const textNode = element.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "nova ");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });
  await expect(editor).toContainText("nova palavra");

  await editor.evaluate((element) => {
    element.innerHTML = [
      "<h2>Principal</h2>",
      "<h3>Seção</h3>",
      "<ul><li>Um tópico</li></ul>",
      "<ol><li>Primeiro item</li></ol>",
      '<div data-note-checklist="true" data-checked="false">Tarefa pendente</div>',
      '<div data-note-checklist="true" data-checked="true">Tarefa concluída</div>',
      "<p><strong>Negrito</strong> <em>Itálico</em> <s>Tachado</s></p>",
      "<p>palavramuitograndesemespacoparavalidarqueeelanãovazadocard</p>",
    ].join("");
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await expect(noteDialog.getByRole("heading", { name: "Principal" })).toBeVisible();
  await expect(editor.locator('[data-note-checklist="true"]').first()).toBeVisible();
  await noteDialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(noteDialog).not.toBeVisible();
  await expect(page.getByText("Nota de teste")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Principal" })).toBeVisible();
  await expect(page.getByText("Um tópico")).toBeVisible();
  await expect(page.getByText("Tarefa pendente")).toBeVisible();

  await page.getByRole("button", { name: "Editar" }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar anotação" });
  await expect(editDialog.getByText("Prévia")).toHaveCount(0);
  await expect(editDialog.getByRole("heading", { name: "Principal" })).toBeVisible();
  await expect(editDialog.locator('[data-note-checklist="true"]', { hasText: "Tarefa concluída" })).toBeVisible();
  await editDialog.getByPlaceholder("Título da anotação").fill("Nota editada");
  await expect(editDialog.getByText("Salvo automaticamente")).toBeVisible();
  await editDialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByText("Nota editada")).toBeVisible();

  await page.getByRole("button", { name: "Excluir" }).click();
  await page
    .getByRole("dialog", { name: "Excluir anotação" })
    .getByRole("button", { name: "Excluir anotação" })
    .click();
  await expect(page.getByText("Nenhuma anotação cadastrada")).toBeVisible();
});
