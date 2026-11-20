import { expect, test } from "../helpers/fixtures.js";

test("the page loads in a real browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "V1be Coding" })).toBeVisible();
});

test("the API answers through the page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API: ok")).toBeVisible();
});

// The edge maps only S3's 403 to the 404 page, so the API's own JSON 404
// reaches the client (v1be-infra #61). A pages = true episode adds the same
// check for an unknown page, which returns 404 as text/html.
test("an unknown API path returns the API's JSON 404", async ({ request }) => {
  const response = await request.get(`/api/no-such-path-${crypto.randomUUID()}`);

  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toEqual({ error: "Not found" });
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
