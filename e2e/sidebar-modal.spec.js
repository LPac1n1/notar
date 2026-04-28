import { test, expect } from "@playwright/test";

test("sidebar stays stable when opening a modal after scrolling content", async ({ page }) => {
  await page.goto("/pessoas");
  await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();

  const sidebar = page.locator("aside > div").first();
  const addPersonButton = page.getByRole("button", { name: "Adicionar pessoa" });
  await expect(sidebar).toBeVisible();
  await expect(addPersonButton).toBeVisible();

  await page.evaluate(() => {
    const container = document.getElementById("app-scroll-container");
    const spacer = document.createElement("div");
    spacer.setAttribute("data-test-spacer", "true");
    spacer.style.height = "1200px";
    container?.append(spacer);
    container?.scrollTo({ top: 500, behavior: "auto" });
  });

  const beforeBox = await sidebar.boundingBox();
  const scrollBefore = await page.evaluate(
    () => document.getElementById("app-scroll-container")?.scrollTop ?? 0,
  );

  await addPersonButton.evaluate((button) => button.click());
  await expect(page.getByRole("dialog", { name: "Adicionar pessoa" })).toBeVisible();

  const afterBox = await sidebar.boundingBox();
  const scrollAfter = await page.evaluate(
    () => document.getElementById("app-scroll-container")?.scrollTop ?? 0,
  );

  expect(Math.round(afterBox?.y ?? 0)).toBe(Math.round(beforeBox?.y ?? 0));
  expect(scrollAfter).toBe(scrollBefore);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
