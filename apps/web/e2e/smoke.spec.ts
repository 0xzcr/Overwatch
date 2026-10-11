import { test, expect } from "@playwright/test";

test("landing renders the edition and the headline numbers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("The Vigil Edition");
  await expect(page.getByText("Know who can move your money.").first()).toBeVisible();
  await expect(page.getByText("multisigs with no timelock")).toBeVisible();
});

test("control map lists protocols and opens a protocol in the modal", async ({ page }) => {
  await page.goto("/");
  const drift = page.locator("[data-proto=drift]");
  await drift.scrollIntoViewIfNeeded();
  await drift.click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Drift Protocol" })).toBeVisible();
  await expect(page).toHaveURL(/#protocol\/drift$/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).toHaveAttribute("aria-hidden", "true");
});

test("old protocol URLs land on the protocol modal", async ({ page }) => {
  await page.goto("/protocols/drift");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Drift Protocol" })).toBeVisible();
});

test("drift case study replays alerts from the rules engine", async ({ page }) => {
  await page.goto("/#drift");
  await page.locator("#driftNext").click();
  await expect(page.getByText(/never-expiring/).first()).toBeVisible();
});

test("capability index filters by search", async ({ page }) => {
  await page.goto("/#index");
  await expect(page.locator("body")).not.toHaveClass(/is-loading/);
  await page.locator("#search").fill("webhook");
  await expect(page.locator("#resultCount")).not.toHaveText(/Showing 40 of/);
  await page.locator(".row:not(.is-hidden)").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
