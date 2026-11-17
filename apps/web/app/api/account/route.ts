import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  db,
  accounts,
  subscriptions,
  apiKeys,
  invoices,
  deliveries,
  events,
  protocols,
  protocolIdsForSlugs,
  eq,
  and,
  desc,
  inArray,
} from "@overwatch/db";
import { baseUnitsToUsdc } from "@overwatch/core";
import { ok, err } from "@/lib/api";
import { withAccount, planOf, body } from "@/lib/account";
import type { Account } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Everything the dashboard shows for one account, in one read. Secrets are never included. */
async function snapshotOf(account: Account) {
  const d = db();
  const [channels, keys, bills, recent, watches, watchSlugs] = await Promise.all([
    d.select().from(subscriptions).where(eq(subscriptions.accountId, account.id)).orderBy(subscriptions.id),
    d.select().from(apiKeys).where(eq(apiKeys.accountId, account.id)).orderBy(apiKeys.id),
    d.select().from(invoices).where(eq(invoices.accountId, account.id)).orderBy(desc(invoices.createdAt)).limit(20),
    d
      .select({ dl: deliveries, sub: subscriptions, title: events.title, severity: events.severity })
      .from(deliveries)
      .innerJoin(subscriptions, eq(deliveries.subscriptionId, subscriptions.id))
      .innerJoin(events, eq(deliveries.eventId, events.id))
      .where(eq(subscriptions.accountId, account.id))
      .orderBy(desc(deliveries.id))
      .limit(50),
    d.select().from(protocols).where(eq(protocols.ownerAccountId, account.id)).orderBy(protocols.id),
    account.watchlist.length
      ? d.select({ slug: protocols.slug }).from(protocols).where(inArray(protocols.id, account.watchlist))
      : Promise.resolve([]),
  ]);
  return {
    wallet: account.wallet,
    plan: planOf(account),
    watchlist: watchSlugs.map((r) => r.slug),
    channels: channels.map((c) => ({
      id: c.id,
      channel: c.channel,
      // a webhook URL can carry a token in its path, so only its host is shown back
      target: c.channel === "webhook" ? safeHost(c.target) : c.target,
      minSeverity: c.minSeverity,
      confirmed: c.confirmed,
      active: c.active,
    })),
    keys: keys.map((k) => ({
      id: k.id,
      prefix: k.prefix,
      createdAt: k.createdAt.toISOString(),
      revoked: !!k.revokedAt,
    })),
    invoices: bills.map((i) => ({
      id: i.id,
      plan: i.plan,
      months: i.months,
      amount: baseUnitsToUsdc(i.amount),
      status: i.status,
      network: i.network,
      txSignature: i.txSignature,
      createdAt: i.createdAt.toISOString(),
      paidAt: i.paidAt?.toISOString() ?? null,
    })),
    deliveries: recent.map((r) => ({
      id: r.dl.id,
      channel: r.sub.channel,
      title: r.title,
      severity: r.severity,
      status: r.dl.status,
      attempts: r.dl.attempts,
      lastError: r.dl.lastError,
      deliveredAt: r.dl.deliveredAt?.toISOString() ?? null,
    })),
    watches: watches.map((w) => ({ id: w.id, slug: w.slug, name: w.name, verified: w.verified })),
  };
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "webhook";
  }
}

export const GET = withAccount(async (_req, account) => ok(await snapshotOf(account)));

const patch = z.object({ watchlist: z.array(z.string().max(80)).max(200) });

/** Replaces the watchlist (protocol slugs). An empty list means "every protocol". */
export const PATCH = withAccount(async (req: NextRequest, account) => {
  const parsed = await body(req, patch);
  if ("error" in parsed) return parsed.error;
  const { ids, unknown } = await protocolIdsForSlugs(parsed.data.watchlist, account.id);
  if (unknown.length) return err(400, `unknown protocol(s): ${unknown.join(", ")}`);
  const [row] = await db()
    .update(accounts)
    .set({ watchlist: ids })
    .where(and(eq(accounts.id, account.id)))
    .returning();
  return ok(await snapshotOf(row!));
});
