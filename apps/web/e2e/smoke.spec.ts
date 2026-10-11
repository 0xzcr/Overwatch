import { test, expect } from "@playwright/test";

test("landing renders the live headline stat", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("your money");
  await expect(page.getByText(/top Solana protocols can be changed by ≤2 people/)).toBeVisible();
});

test("leaderboard lists seeded protocols and links to detail", async ({ page }) => {
  await page.goto("/protocols");
  await expect(page.getByRole("link", { name: /Drift Protocol/ })).toBeVisible();
  await page.getByRole("link", { name: /Drift Protocol/ }).click();
  await expect(page.getByRole("heading", { name: "Drift Protocol" })).toBeVisible();
  await expect(page.getByText("Who can move your money")).toBeVisible();
  await expect(page.getByText("7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM").first()).toBeVisible();
});

test("drift case study replays alerts", async ({ page }) => {
  await page.goto("/case/drift");
  await page.getByRole("button", { name: "next step" }).click();
  await expect(page.getByText(/never-expiring/).first()).toBeVisible();
});

// Real devnet transactions: only when explicitly enabled.
test("demo console: remove timelock → CRITICAL alert, registry update, vault shield", async ({ page }) => {
  test.skip(process.env.E2E_DEVNET !== "true", "set E2E_DEVNET=true (needs DEMO_MODE, indexer running, demo set up)");
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: /Remove timelock/ })).toBeEnabled({ timeout: 30_000 });
  const t0 = Date.now();
  await page.getByRole("button", { name: /Remove timelock/ }).click();
  await expect(page.getByText(/removed its 2 days safety delay/).first()).toBeVisible({ timeout: 60_000 });
  console.log(`alert visible ${((Date.now() - t0) / 1000).toFixed(1)}s after click`);
  await expect(page.getByText("REGISTRY UPDATED · devnet").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("VAULT SHIELD TRIGGERED").first()).toBeVisible({ timeout: 60_000 });
  console.log(`shield visible ${((Date.now() - t0) / 1000).toFixed(1)}s after click`);
  await page.screenshot({ path: "test-results/demo-console.png", fullPage: true });
  await page.getByRole("button", { name: /Reset demo/ }).click();
  await expect(page.getByText(/demo epoch reset/)).toBeVisible({ timeout: 120_000 });
});
