import { describe, expect, it } from "vitest";
import { effectivePlan, gradeChangeSeverity, priceUsd, wantsAlert, PLANS } from "../src";

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 1000);
const pub = { id: 1, visibility: "public", ownerAccountId: null };

describe("grade change alerts", () => {
  it("red is CRITICAL, a two-grade drop is HIGH, one grade is MEDIUM, a rise is INFO", () => {
    expect(gradeChangeSeverity({ from: "C", to: "F", red: true, best90d: null })).toBe("CRITICAL");
    expect(gradeChangeSeverity({ from: "B", to: "D", red: false, best90d: null })).toBe("HIGH");
    expect(gradeChangeSeverity({ from: "B", to: "C", red: false, best90d: "B" })).toBe("MEDIUM");
    expect(gradeChangeSeverity({ from: "D", to: "C", red: false, best90d: null })).toBe("INFO");
  });
  it("slow erosion: one step that lands two below the 90-day best is HIGH", () => {
    expect(gradeChangeSeverity({ from: "C", to: "D", red: false, best90d: "B" })).toBe("HIGH");
  });
});

describe("plans", () => {
  it("a paid plan applies until it ends, then falls back to free", () => {
    expect(effectivePlan({ plan: "pro", planExpiresAt: future }).id).toBe("pro");
    expect(effectivePlan({ plan: "pro", planExpiresAt: past }).id).toBe("free");
    expect(effectivePlan({ plan: "bogus", planExpiresAt: future }).id).toBe("free");
    expect(effectivePlan(null).id).toBe("free");
  });
  it("12 months costs 10", () => {
    expect(priceUsd("pro", 12)).toBe(PLANS.pro.monthlyUsd * 10);
    expect(priceUsd("team", 1)).toBe(PLANS.team.monthlyUsd);
  });
});

describe("who gets an alert", () => {
  const sub = (
    o: Partial<{ accountId: number | null; channel: string; minSeverity: string; protocolIds: number[] | null }> = {},
  ) => ({
    accountId: 7,
    channel: "email",
    minSeverity: "INFO",
    protocolIds: null,
    ...o,
  });
  const free = { id: 7, plan: "free", planExpiresAt: null, watchlist: [] as number[] };
  const pro = { ...free, plan: "pro", planExpiresAt: future };

  it("free accounts always get CRITICAL and HIGH, never below (safety alerts are free)", () => {
    expect(wantsAlert({ subscription: sub(), account: free, protocol: pub, severity: "CRITICAL" })).toBe(true);
    expect(wantsAlert({ subscription: sub(), account: free, protocol: pub, severity: "HIGH" })).toBe(true);
    expect(wantsAlert({ subscription: sub(), account: free, protocol: pub, severity: "MEDIUM" })).toBe(false);
    expect(wantsAlert({ subscription: sub(), account: pro, protocol: pub, severity: "MEDIUM" })).toBe(true);
  });
  it("webhooks stop when a paid plan lapses", () => {
    const lapsed = { ...pro, planExpiresAt: past };
    expect(
      wantsAlert({ subscription: sub({ channel: "webhook" }), account: pro, protocol: pub, severity: "HIGH" }),
    ).toBe(true);
    expect(
      wantsAlert({ subscription: sub({ channel: "webhook" }), account: lapsed, protocol: pub, severity: "HIGH" }),
    ).toBe(false);
  });
  it("the watchlist filters public protocols; empty means all", () => {
    expect(
      wantsAlert({ subscription: sub(), account: { ...free, watchlist: [2] }, protocol: pub, severity: "HIGH" }),
    ).toBe(false);
    expect(
      wantsAlert({ subscription: sub(), account: { ...free, watchlist: [1] }, protocol: pub, severity: "HIGH" }),
    ).toBe(true);
  });
  it("a private watch reaches only its owner, even past their watchlist", () => {
    const mine = { id: 9, visibility: "private", ownerAccountId: 7 };
    expect(
      wantsAlert({ subscription: sub(), account: { ...pro, watchlist: [1] }, protocol: mine, severity: "HIGH" }),
    ).toBe(true);
    expect(
      wantsAlert({ subscription: sub({ accountId: 8 }), account: { ...pro, id: 8 }, protocol: mine, severity: "HIGH" }),
    ).toBe(false);
    expect(
      wantsAlert({ subscription: sub({ accountId: null }), account: null, protocol: mine, severity: "CRITICAL" }),
    ).toBe(false);
  });
  it("subscriptions without an account keep their own filter", () => {
    expect(
      wantsAlert({
        subscription: sub({ accountId: null, protocolIds: [2] }),
        account: null,
        protocol: pub,
        severity: "HIGH",
      }),
    ).toBe(false);
    expect(
      wantsAlert({
        subscription: sub({ accountId: null, minSeverity: "LOW" }),
        account: null,
        protocol: pub,
        severity: "LOW",
      }),
    ).toBe(true);
  });
});
