import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-0/-home-user-whole-performance/467102a6-ef0b-547f-8348-0d312f1c55a5/scratchpad/shots";
const B = "http://localhost:3111";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle","--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${B}/app/project/sample-home`, { waitUntil: "networkidle" });
await page.getByText("The Garden Courtyard").first().waitFor({ timeout: 40000 });
await page.waitForTimeout(1200);

// First concept's floor-plan figure, close up
const plan = page.locator("svg").nth(1);
await plan.scrollIntoViewIfNeeded();
await plan.screenshot({ path: `${OUT}/03-floorplan.png` });
console.log("floorplan box", JSON.stringify(await plan.boundingBox()));

// 3D viewer on the first concept
await page.getByRole("button", { name: "3D viewer" }).first().click();
await page.waitForTimeout(6000);
const card = page.locator("section,article,div").filter({ hasText: "The Garden Courtyard" }).last();
await page.screenshot({ path: `${OUT}/04-3d.png` });

// Elevations
await page.getByRole("button", { name: "Elevations" }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/05-elevations.png` });

// Costs
await page.getByRole("button", { name: "Checks, costs & savings" }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/06-costs.png`, fullPage: true });
console.log("done");
await browser.close();
