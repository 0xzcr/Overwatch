/**
 * Overwatch plans. One definition shared by the website (pricing, limits), the database pipeline (who gets which
 * alert) and the API (rate limits), so a limit can never differ between what is sold and what is enforced.
 *
 * Principle: safety alerts are never behind the paywall. Every account gets HIGH and CRITICAL alerts on every public
 * protocol for free. Paying buys depth (every severity), machine delivery (webhooks, API) and private watches.
 */
import type { Severity } from "./types";
import { SEVERITY_ORDER } from "./types";

export type PlanId = "free" | "pro" | "team";
export type Channel = "telegram" | "email" | "webhook";

export interface Plan {
  id: PlanId;
  name: string;
  /** price per month in USD, paid in USDC */
  monthlyUsd: number;
  audience: string;
  /** the lowest severity this plan delivers */
  minSeverity: Severity;
  channels: Channel[];
  webhooks: number;
  apiKeys: number;
  /** requests per minute for each API key */
  apiPerMinute: number;
  /** the account's own programs and multisigs, watched privately */
  privateWatches: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyUsd: 0,
    audience: "Depositors",
    minSeverity: "HIGH",
    channels: ["telegram", "email"],
    webhooks: 0,
    apiKeys: 0,
    apiPerMinute: 30,
    privateWatches: 0,
    features: [
      "Every grade and every public alert page",
      "HIGH and CRITICAL alerts on every protocol",
      "Telegram and email",
      "Watchlist dashboard",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyUsd: 19,
    audience: "Active depositors and analysts",
    minSeverity: "INFO",
    channels: ["telegram", "email", "webhook"],
    webhooks: 3,
    apiKeys: 1,
    apiPerMinute: 300,
    privateWatches: 1,
    features: [
      "Every severity, including early MEDIUM and LOW signals",
      "3 signed webhooks",
      "API key, 300 requests a minute",
      "1 private watch of your own program or multisig",
      "Delivery log",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    monthlyUsd: 149,
    audience: "Funds, DAOs, protocol teams and integrators",
    minSeverity: "INFO",
    channels: ["telegram", "email", "webhook"],
    webhooks: 20,
    apiKeys: 5,
    apiPerMinute: 1200,
    privateWatches: 10,
    features: [
      "Everything in Pro",
      "20 signed webhooks (Slack, Discord, PagerDuty, your own systems)",
      "5 API keys, 1,200 requests a minute each",
      "10 private watches of your own programs and multisigs",
    ],
  },
};

/** Paying for 12 months costs 10. */
export const BILLING_PERIODS = [1, 3, 12] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const priceUsd = (plan: PlanId, months: BillingPeriod) => PLANS[plan].monthlyUsd * (months === 12 ? 10 : months);

export interface AccountPlanFields {
  plan: string;
  planExpiresAt: Date | null;
}

/** The plan that applies right now: a paid plan past its end date falls back to free. */
export function effectivePlan(account: AccountPlanFields | null, now = new Date()): Plan {
  if (!account) return PLANS.free;
  const plan = PLANS[account.plan as PlanId];
  if (!plan || plan.id === "free") return PLANS.free;
  if (!account.planExpiresAt || account.planExpiresAt <= now) return PLANS.free;
  return plan;
}

export const atLeastSeverity = (severity: string, min: string) =>
  (SEVERITY_ORDER[severity as Severity] ?? -1) >= (SEVERITY_ORDER[min as Severity] ?? 99);

export interface AlertCandidate {
  subscription: { accountId: number | null; channel: string; minSeverity: string; protocolIds: number[] | null };
  account: (AccountPlanFields & { id: number; watchlist: number[] }) | null;
  protocol: { id: number; visibility: string; ownerAccountId: number | null } | undefined;
  severity: string;
  now?: Date;
}

/** Whether one subscription should receive one event. Every alert passes through here. */
export function wantsAlert(c: AlertCandidate): boolean {
  const { subscription: s, account, protocol, severity } = c;
  if (!protocol) return false;
  // a private watch is seen only by its owner
  if (protocol.visibility === "private" && (!account || account.id !== protocol.ownerAccountId)) return false;
  if (!atLeastSeverity(severity, s.minSeverity)) return false;

  // subscriptions created before accounts existed (bot, anonymous API) keep their own protocol filter
  if (!account) return !s.protocolIds?.length || s.protocolIds.includes(protocol.id);

  const plan = effectivePlan(account, c.now);
  if (!atLeastSeverity(severity, plan.minSeverity)) return false;
  if (!plan.channels.includes(s.channel as Channel)) return false;
  // an account's own private watch always alerts its owner; public protocols follow the watchlist (empty = all)
  if (protocol.visibility === "private") return true;
  return !account.watchlist.length || account.watchlist.includes(protocol.id);
}
