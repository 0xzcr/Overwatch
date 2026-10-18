import { test, expect } from "@playwright/test";

test("landing renders the title and the navbar reaches the docs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("The Protocol Watchdog");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Documentation" }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Documentation");
});

test("leaderboard lists protocols and links to the detail page", async ({ page }) => {
  await page.goto("/protocols");
  await page
    .getByRole("link", { name: /Drift Protocol/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/protocols\/drift$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Drift Protocol");
  await expect(page.getByRole("heading", { name: "Who can move your money" })).toBeVisible();
});

test("case study replays alerts from the rules engine", async ({ page }) => {
  await page.goto("/case/drift");
  await expect(page).toHaveURL(/\/case-study$/);
  await expect(page.locator("body")).not.toHaveClass(/is-loading/);
  await page.locator("#driftNext").click();
  await expect(page.getByText(/never-expiring/).first()).toBeVisible();
});

test("documentation, API docs, events and alerts pages render", async ({ page }) => {
  for (const [url, text] of [
    ["/docs", "Documentation"],
    ["/docs/api", "API"],
    ["/events", "Live events"],
    ["/alerts", "Alerts"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(text);
  }
});

test.describe("red palette", () => {
  test.use({ timezoneId: "Etc/GMT" });
  test("is red regardless of the clock, and the navbar shows a ticking GMT clock", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-time", "night");
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mint").trim()),
    ).toBe("#ff1f3d");
    await expect(page.locator('link[rel="icon"]').last()).toHaveAttribute("href", "/favicon-night.svg");
    // WebGL start-up can hold the main thread (and the clock's timer) for seconds in a software-rendered CI browser.
    await expect(page.locator("body")).not.toHaveClass(/is-loading/, { timeout: 15_000 });
    const clock = page.locator(".nav__status time");
    await expect(clock).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const first = await clock.textContent();
    await expect(clock).not.toHaveText(first!, { timeout: 3000 });
  });
});
