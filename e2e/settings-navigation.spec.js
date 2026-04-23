import { test, expect } from "@playwright/test";

const SOURCES = ["Dashboard", "Demandas", "Doadores", "Gestão Mensal", "Importações", "Lixeira"];

for (const source of SOURCES) {
  test(`navegacao para configuracoes saindo de ${source}`, async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/");

    if (source !== "Dashboard") {
      await page.getByRole("link", { name: source }).click();
      await expect(page.getByRole("heading", { name: source, exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Configurações" }).click();
    await page.waitForTimeout(1000);

    const titleVisible = await page
      .getByRole("heading", { name: "Configurações" })
      .isVisible()
      .catch(() => false);

    if (!titleVisible) {
      await page.screenshot({
        path: `playwright-temp-results/settings-nav-${source.replaceAll(" ", "-")}.png`,
        fullPage: true,
      });
      console.log(
        JSON.stringify(
          {
            source,
            titleVisible,
            pathname: page.url(),
            pageErrors,
            consoleErrors,
            bodyText: await page.locator("body").innerText(),
          },
          null,
          2,
        ),
      );
    }

    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Armazenamento local" })).toBeVisible();
  });
}
