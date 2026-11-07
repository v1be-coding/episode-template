import { expect, test } from "@playwright/test";

test("the page loads in a real browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "V1be Coding" })).toBeVisible();
});

test("the API answers through the page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API: ok")).toBeVisible();
});

test("a write and a read reach the database", async ({ request }) => {
  const id = crypto.randomUUID();
  const note = { data: { text: "smoke test" } };

  // Twice, because any write may be retried (ADR-0003).
  expect((await request.put(`/api/notes/${id}`, note)).status()).toBe(200);
  expect((await request.put(`/api/notes/${id}`, note)).status()).toBe(200);

  const read = await request.get(`/api/notes/${id}`);

  expect(read.status()).toBe(200);
  expect(await read.json()).toEqual({ id, text: "smoke test" });
});
