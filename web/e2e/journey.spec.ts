import { expect, test, type Page } from "@playwright/test";

/**
 * The homeowner journey, end to end against the production build:
 * interview → three concepts → the document suite each concept feeds.
 * These are the checks that were run by hand on every increment, made
 * permanent.
 */

async function generateProject(page: Page): Promise<void> {
  await page.goto("/app/new");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\/project\//, { timeout: 30_000 });
}

test("interview defaults generate three priced, health-checked concepts", async ({ page }) => {
  await generateProject(page);
  const body = await page.textContent("body");
  expect(body).toContain("The Courtyard");
  expect(body).toContain("The Compact Two-Story");
  expect(body).toContain("The Wide Ranch");
  expect(await page.getByText(/Health \d+/).count()).toBeGreaterThanOrEqual(3);
  expect(body).toMatch(/\$\d{3},\d{3}/); // real dollar totals
});

test("erasing a number field leaves it empty, and an empty budget falls back", async ({ page }) => {
  await page.goto("/app/new");
  const bedrooms = page.locator('label:has-text("Bedrooms") input');
  await bedrooms.press("ControlOrMeta+a");
  await bedrooms.press("Backspace");
  await expect(bedrooms).toHaveValue(""); // regression: no phantom 0
  const budget = page.locator('label:has-text("Budget") input');
  await budget.press("ControlOrMeta+a");
  await budget.press("Backspace");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\/project\//, { timeout: 30_000 });
  expect(await page.textContent("body")).toContain("450,000"); // default budget applied
});

test("bid package: trade sheets with scopes, owner budget kept out of print", async ({ page }) => {
  await generateProject(page);
  await page.getByRole("link", { name: "Bid package" }).click();
  await page.waitForURL(/\/bids/);
  await expect(page.locator(".bid-sheet")).toHaveCount(11);
  const body = await page.textContent("body");
  expect(body).toContain("Scope of work");
  expect(body).toContain("concept drawings"); // quantity honesty (L8)
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".card.no-print")).toBeHidden(); // owner budget never prints
});

test("construction schedule: gantt, milestones, draws reconciling to 100%", async ({ page }) => {
  await generateProject(page);
  await page.getByRole("link", { name: "Schedule" }).click();
  await page.waitForURL(/\/schedule/);
  expect(await page.locator("svg[aria-label='Construction timeline'] rect").count()).toBe(10);
  const body = await page.textContent("body");
  expect(body).toMatch(/About \d+ weeks/);
  expect(body).toContain("100%");
  expect(body).toContain("not a builder's commitment");
});

test("maintenance plan follows the chosen materials", async ({ page }) => {
  await page.goto("/app/new");
  await page.locator('label:has-text("Roofing") select').selectOption("cedar_shake");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\/project\//, { timeout: 30_000 });
  await page.getByRole("link", { name: "Maintenance" }).click();
  await page.waitForURL(/\/maintenance/);
  const body = await page.textContent("body");
  expect(body).toContain("Treat shakes"); // cedar-specific task
  expect(body).toContain("Professional HVAC service"); // universal system
  expect(body).toContain("30-year care plan");
});

test("design report downloads a real multi-page PDF", async ({ page }) => {
  await generateProject(page);
  await page.getByRole("link", { name: "Design report" }).click();
  await page.waitForURL(/\/report/);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: /Download PDF/ }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(20_000);
});

test("landing folio renders the engine drawings without horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.locator(".frame").count()).toBe(3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("3D viewer renders a non-black scene and walk mode responds", async ({ page }) => {
  await generateProject(page);
  await page.getByRole("button", { name: "3D viewer" }).first().click();
  await page.waitForSelector("canvas", { timeout: 20_000 });
  await page.waitForTimeout(2_500);
  const orbit = await page.screenshot();
  await page.getByRole("button", { name: "Walk inside" }).click();
  await page.waitForTimeout(2_500);
  const inside = await page.screenshot();
  expect(Buffer.compare(orbit, inside)).not.toBe(0);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(300);
  const moved = await page.screenshot();
  expect(Buffer.compare(inside, moved)).not.toBe(0);
});

test("password reset pages serve both halves honestly", async ({ page }) => {
  await page.goto("/reset");
  await page.fill('input[type="email"]', "someone@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  // On a deployment without DATABASE_URL/RESEND the reply names the fix.
  await expect(page.getByText(/not configured|on its way/)).toBeVisible({ timeout: 10_000 });
  await page.goto("/reset?token=abc");
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
