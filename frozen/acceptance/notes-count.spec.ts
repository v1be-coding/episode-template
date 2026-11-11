import { expect, test } from "../helpers/fixtures.js";

// Spec #42: show how many notes are saved. Each title starts with the
// test contract lines (in the spec issue) that it checks.

const COUNT_ROUTE = /\/api\/notes\/count(\?.*)?$/;
const NOTES_SAVED = /Notes saved: \d+/;

test("C1, C2: the count route returns the number of saved notes", { tag: ["@C1", "@C2"] }, async ({ request }) => {
  const response = await request.get("/api/notes/count");

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["count"]);
  expect(Number.isInteger(body.count)).toBe(true);
  expect(body.count).toBeGreaterThanOrEqual(1);
});

test("C3, C4: a new note adds one to the count, and saving it again doesn't", { tag: ["@C3", "@C4"] }, async ({ request }) => {
  const id = crypto.randomUUID();
  const note = { data: { text: `count test ${crypto.randomUUID()}` } };

  const before = await request.get("/api/notes/count");
  expect(before.status()).toBe(200);
  const { count: countBefore } = await before.json();

  expect((await request.put(`/api/notes/${id}`, note)).status()).toBe(200);
  const afterFirst = await request.get("/api/notes/count");
  expect(afterFirst.status()).toBe(200);
  expect(await afterFirst.json()).toEqual({ count: countBefore + 1 });

  expect((await request.put(`/api/notes/${id}`, note)).status()).toBe(200);
  const afterSecond = await request.get("/api/notes/count");
  expect(afterSecond.status()).toBe(200);
  expect(await afterSecond.json()).toEqual({ count: countBefore + 1 });
});

test("C5: other methods on the count route return 405", { tag: ["@C5"] }, async ({ request }) => {
  const notAllowed = { error: "Method not allowed" };
  const body = { data: { text: `count test ${crypto.randomUUID()}` } };

  const post = await request.post("/api/notes/count", body);
  expect(post.status()).toBe(405);
  expect(await post.json()).toEqual(notAllowed);

  const put = await request.put("/api/notes/count", body);
  expect(put.status()).toBe(405);
  expect(await put.json()).toEqual(notAllowed);

  const patch = await request.patch("/api/notes/count", body);
  expect(patch.status()).toBe(405);
  expect(await patch.json()).toEqual(notAllowed);

  const remove = await request.delete("/api/notes/count");
  expect(remove.status()).toBe(405);
  expect(await remove.json()).toEqual(notAllowed);
});

test("C6: the page shows how many notes are saved, below the API line", { tag: ["@C6"] }, async ({ page }) => {
  await page.goto("/");

  const apiLine = page.getByText("API: ok");
  const countLine = page.getByText(NOTES_SAVED);
  await expect(apiLine).toBeVisible();
  await expect(countLine).toBeVisible();

  const count = Number(/Notes saved: (\d+)/.exec((await countLine.textContent()) ?? "")?.[1]);
  expect(count).toBeGreaterThanOrEqual(1);

  const apiBox = await apiLine.boundingBox();
  const countBox = await countLine.boundingBox();
  expect(countBox?.y).toBeGreaterThan(apiBox?.y ?? Number.POSITIVE_INFINITY);
});

test("C7: a reload after saving a new note shows the count one higher", { tag: ["@C7"] }, async ({ page, request }) => {
  await page.goto("/");
  const countLine = page.getByText(NOTES_SAVED);
  await expect(countLine).toBeVisible();
  const before = Number(/Notes saved: (\d+)/.exec((await countLine.textContent()) ?? "")?.[1]);

  const id = crypto.randomUUID();
  expect((await request.put(`/api/notes/${id}`, { data: { text: `count test ${crypto.randomUUID()}` } })).status()).toBe(200);

  await page.reload();

  await expect(page.getByText(new RegExp(`Notes saved: ${before + 1}(?!\\d)`))).toBeVisible();
});

test("C8: the page shows unavailable when the count request gets no response", { tag: ["@C8"] }, async ({ page }) => {
  await page.route(COUNT_ROUTE, (route) => route.abort("failed"));

  await page.goto("/");

  await expect(page.getByText("Notes saved: unavailable")).toBeVisible();
});

test("C9: the page shows unavailable when the count request fails with a 500 or a 404", { tag: ["@C9"] }, async ({ page }) => {
  await page.route(COUNT_ROUTE, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal error" }) }),
  );
  await page.goto("/");
  await expect(page.getByText("Notes saved: unavailable")).toBeVisible();

  await page.unroute(COUNT_ROUTE);
  await page.route(COUNT_ROUTE, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) }),
  );
  await page.reload();
  await expect(page.getByText("Notes saved: unavailable")).toBeVisible();
});

test.describe("a rate-limited count", () => {
  // The 429 here is a stand-in from page.route, not a real one.
  test.use({ allow429: true });

  test("C10: the page shows the limit message when the count request is rate-limited", { tag: ["@C10"] }, async ({ page }) => {
    await page.route(COUNT_ROUTE, (route) =>
      route.fulfill({
        status: 429,
        headers: { "retry-after": "30" },
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited" }),
      }),
    );

    await page.goto("/");

    await expect(page.getByText("API: ok")).toBeVisible();
    await expect(page.getByText(/Too many requests\. Try again in \d+ seconds\./)).toBeVisible();
  });
});
