import type { NextRequest } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { db, invoices, eq, desc } from "@overwatch/db";
import { encode, priceUsd, BILLING_PERIODS, type BillingPeriod } from "@overwatch/core";
import { ok, err, hit } from "@/lib/api";
import { withAccount, body } from "@/lib/account";
import { billingConfig, invoiceView, INVOICE_TTL_MS } from "@/lib/billing";

export const dynamic = "force-dynamic";

const schema = z.object({
  plan: z.enum(["pro", "team"]),
  months: z.number().refine((m): m is BillingPeriod => (BILLING_PERIODS as readonly number[]).includes(m)),
});

const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === "23505";

/**
 * Creates an invoice to pay in USDC. The amount is the plan price plus a random fraction of a cent (1 to 9,999
 * millionths of a dollar) that no other open invoice has, so even a plain transfer identifies exactly one invoice.
 */
export const POST = withAccount(async (req: NextRequest, account) => {
  const config = billingConfig();
  if (!config) return err(503, "payments are not configured on this deployment");
  const parsed = await body(req, schema);
  if ("error" in parsed) return parsed.error;
  if (!(await hit(`invoice:${account.id}`, 20, 3600)).ok) return err(429, "too many invoices this hour");
  const base = BigInt(priceUsd(parsed.data.plan, parsed.data.months as BillingPeriod)) * 1_000_000n;

  // a clash on the unique open amount is retried with a new fraction
  const attempts = [1, 2, 3, 4, 5];
  for (const attempt of attempts) {
    const amount = base + BigInt(randomInt(1, 10_000));
    try {
      const [row] = await db()
        .insert(invoices)
        .values({
          accountId: account.id,
          plan: parsed.data.plan,
          months: parsed.data.months,
          amount: Number(amount),
          network: config.network,
          mint: config.mint,
          treasury: config.treasury,
          reference: encode(randomBytes(32)),
          expiresAt: new Date(Date.now() + INVOICE_TTL_MS),
        })
        .returning();
      return ok(invoiceView(row!));
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === attempts.length) throw e;
    }
  }
  return err(500, "could not create an invoice");
});

export const GET = withAccount(async (_req: NextRequest, account) => {
  const rows = await db()
    .select()
    .from(invoices)
    .where(eq(invoices.accountId, account.id))
    .orderBy(desc(invoices.createdAt))
    .limit(20);
  return ok(rows.map(invoiceView));
});
