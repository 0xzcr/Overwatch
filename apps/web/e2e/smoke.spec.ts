import { test, expect } from "@playwright/test";

test("landing renders the title and the control map preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("The Protocol Watchdog");
  await expect(page.getByRole("link", { name: /All \d+ protocols/ })).toBeVisible();
});

test("leaderboard lists protocols and links to the detail page", async ({ page }) => {
  await page.goto("/protocols");
  await page.getByRole("link", { name: /Drift Protocol/ }).first().click();
  await expect(page).toHaveURL(/\/protocols\/drift$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Drift Protocol");
  await expect(page.getByText("Who can move your money")).toBeVisible();
});

test("case study replays alerts from the rules engine", async ({ page }) => {
  await page.goto("/case/drift");
  await expect(page).toHaveURL(/\/case-study$/);
  await expect(page.locator("body")).not.toHaveClass(/is-loading/);
  await page.locator("#driftNext").click();
  await expect(page.getByText(/never-expiring/).first()).toBeVisible();
});

test("methodology, API docs, events and alerts pages render", async ({ page }) => {
  for (const [url, text] of [
    ["/methodology", "Facts first,"],
    ["/docs/api", "Read the watch"],
    ["/events", "Every change,"],
    ["/alerts", "Get the alarm"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(text);
  }
});

// Real devnet transactions: only when explicitly enabled.
test("demo console: remove timelock → CRITICAL alert, registry update, vault shield", async ({ page }) => {
  test.skip(process.env.E2E_DEVNET !== "true", "set E2E_DEVNET=true (needs DEMO_MODE, indexer running, demo set up)");
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: /Remove timelock/ })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: /Remove timelock/ }).click();
  await expect(page.getByText(/removed its 2 days safety delay/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("REGISTRY UPDATED · devnet").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("VAULT SHIELD TRIGGERED").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Reset demo/ }).click();
});
