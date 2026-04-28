import { test, expect } from "@playwright/test";

test("records system actions in the dedicated history page", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Demandas" }).click();
  await page.getByRole("button", { name: "Adicionar demanda" }).click();
  await page
    .getByRole("dialog", { name: "Adicionar demanda" })
    .getByPlaceholder("Nome da demanda")
    .fill("Demanda Historico");
  await page
    .getByRole("dialog", { name: "Adicionar demanda" })
    .getByRole("button", { name: "Adicionar demanda" })
    .click();
  await expect(page.getByText("DEMANDA HISTORICO")).toBeVisible();

  await page.getByRole("link", { name: "Histórico" }).click();
  await expect(
    page.getByRole("heading", { name: "Histórico", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Demanda DEMANDA HISTORICO cadastrada."),
  ).toBeVisible();
  await expect(page.getByText("Criação").first()).toBeVisible();
});
