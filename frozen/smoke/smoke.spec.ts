import { expect, test } from "@playwright/test";

test("the page loads in a real browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "V1be Coding" })).toBeVisible();
});

test("the API answers through the page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API: ok")).toBeVisible();
});
