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
  // The project page renders client-side after the URL changes; wait for a
  // concept card before asserting on content (CI runners are slower than dev).
  await page.getByText("The Glass Courtyard").first().waitFor({ timeout: 30_000 });
}

test("interview defaults generate three priced, health-checked concepts", async ({ page }) => {
  await generateProject(page);
  const body = await page.textContent("body");
  expect(body).toContain("The Glass Courtyard");
  expect(body).toContain("The Stacked Modern");
  expect(body).toContain("The Long Horizon");
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
  await expect(page.locator("body")).toContainText("450,000", { timeout: 30_000 }); // default budget applied
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
  await expect(page.locator("svg[aria-label='Construction timeline'] rect")).toHaveCount(10, { timeout: 30_000 });
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
  await page.getByText("The Glass Courtyard").first().waitFor({ timeout: 30_000 });
  await page.getByRole("link", { name: "Maintenance" }).click();
  await page.waitForURL(/\/maintenance/);
  await expect(page.locator("body")).toContainText("Treat shakes", { timeout: 30_000 }); // cedar-specific task
  const body = await page.textContent("body");
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

test("the sample project builds itself from the landing CTA", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Tour a sample project" }).click();
  await page.waitForURL(/\/app\/project\/sample-home/, { timeout: 30_000 });
  await page.getByText("The Garden Courtyard").first().waitFor({ timeout: 30_000 });
  await expect(page.locator("body")).toContainText("The Sample Home");
  // Revisiting reuses the stored copy instead of regenerating.
  await page.goto("/sample");
  await page.waitForURL(/\/app\/project\/sample-home/, { timeout: 30_000 });
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

test("interiors: schemes restyle the rooms and the stylist falls back honestly", async ({ page }) => {
  await generateProject(page);
  await page.getByRole("link", { name: "Interiors" }).click();
  await page.waitForURL(/\/interiors/);
  // The interview's default Modern style wears the Modern Minimal scheme.
  await expect(page.locator("h2")).toContainText("Modern Minimal");
  expect(await page.locator("svg[aria-label$='furnished plan']").count()).toBeGreaterThan(5);
  // Manual scheme change restyles the header.
  await page.getByRole("button", { name: "Japandi", exact: true }).click();
  await expect(page.locator("h2")).toContainText("Japandi");
  // The stylist without an API key falls back to the keyword matcher and says so.
  await page.fill('input[placeholder^="How should it feel"]', "breezy beach house vacation feeling");
  await page.getByRole("button", { name: "Style it" }).click();
  await expect(page.locator("h2")).toContainText("Coastal", { timeout: 10_000 });
  await expect(page.getByText(/keyword matcher/)).toBeVisible();
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

test("editing a layout: drag a room, refuse an illegal move, save one revision", async ({ page }) => {
  await generateProject(page);

  await page.getByRole("button", { name: "Edit this layout" }).first().click();
  const editor = page.getByRole("application", { name: /Editable floor plan/ }).first();
  await editor.waitFor({ timeout: 15_000 });
  const room = editor.getByRole("button").first();

  // Keyboard path: the editor has to be usable without a pointer. Generated
  // plans pack rooms tightly, so whichever direction has clearance is the
  // one that moves — any of them proves the path works.
  await room.focus();
  let moved = false;
  for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
    await page.keyboard.press(key);
    if ((await page.textContent("body"))?.includes("unsaved change")) {
      moved = true;
      break;
    }
  }
  expect(moved).toBe(true);

  // A drag far past the setback line must be refused with a reason — not
  // silently clamped to the edge, and not accepted.
  const box = (await room.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4000, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("editor-message")).toContainText(/buildable|overlap/, { timeout: 10_000 });

  // Saving commits the accumulated edits as one rollback-able revision, and
  // the health score and estimate re-run through the normal loop.
  await page.getByRole("button", { name: /^Save \d+ change/ }).click();
  await expect(page.locator("body")).toContainText(/rev 1/, { timeout: 15_000 });
  await expect(page.locator("body")).toContainText(/Moved /, { timeout: 15_000 });
});

test("walk mode offers the metered renders and refuses honestly when unconfigured", async ({ page }) => {
  await generateProject(page);
  await page.getByRole("button", { name: "3D viewer" }).first().click();
  await page.getByRole("button", { name: "Walk inside" }).first().click();

  const scene360 = page.getByRole("button", { name: "360° scene" }).first();
  const tour = page.getByRole("button", { name: "Photoreal walkthrough" }).first();
  await expect(scene360).toBeVisible({ timeout: 30_000 });
  await expect(tour).toBeVisible();
  // Enabled only once the scene has rendered a frame to capture.
  await expect(scene360).toBeEnabled({ timeout: 30_000 });

  // No render provider is configured in CI: the honest answer is the exact
  // fix, never a silent failure or a fake image.
  await scene360.click();
  await expect(page.locator(".status-warn").filter({ hasText: /REPLICATE_API_TOKEN|license/ }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("a major revision still commits on a signed-out, local-only project", async ({ page }) => {
  await generateProject(page);
  // Adding a room is unambiguously major. A signed-out project lives only in
  // this browser and has no server record to meter against, so it must still
  // land. Signed-in projects draw on the free allowance instead; that
  // boundary is covered by the licenses unit tests.
  await page.getByPlaceholder(/Request a change/).first().fill("add an office");
  await page.getByRole("button", { name: "Revise" }).first().click();
  await expect(page.locator("body")).toContainText(/rev 1/, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(/Office/i, { timeout: 30_000 });
});
