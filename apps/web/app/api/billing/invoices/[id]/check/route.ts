import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, invoices, accounts, eq, and } from "@overwatch/db";
import { checkPayment } from "@overwatch/core";
import { ok, err, hit } from "@/lib/api";
import { withAccount, planOf } from "@/lib/account";
import { addMonths, billingRpc, invoiceView } from "@/lib/billing";

export const dynamic = "force-dynamic";

const schema = z.object({
  signature: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/)
    .optional(),
});

/**
 * Looks for the invoice's payment on chain and, when it is there, switches the plan on.
 * Without a signature it searches by the invoice's reference key (wallet and Solana Pay payments). With one (a
 * transfer from an exchange or custody desk), the exact unique amount and the invoice's time window identify it.
 */
export const POST = withAccount(async (req: NextRequest, account, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const input = schema.safeParse(await req.json().catch(() => ({})));
  if (!input.success) return err(400, "signature: not a transaction signature");
  if (!(await hit(`invoice-check:${account.id}`, 60, 600)).ok) return err(429, "checking too often, wait a moment");
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.accountId, account.id)));
  if (!invoice) return err(404, "invoice not found");
  if (invoice.status === "paid") return ok({ invoice: invoiceView(invoice), plan: planOf(account) });

  const rpc = billingRpc(invoice.network as "mainnet" | "devnet");
  let signature = input.data.signature;
  if (!signature) {
    try {
      // invoices live 24h, so ~33h of history (300k slots) is enough and lets non-archive endpoints answer
      const recent = Math.max(0, (await rpc.getSlot()) - 300_000);
      const found = await rpc.getSignaturesForAddress(invoice.reference, { limit: 5 }, recent);
      signature = found.find((s) => !s.err)?.signature;
    } catch {
      return err(503, "could not reach Solana to look for the payment; try again in a minute");
    }
  }
  if (!signature) {
    // nothing paid and the invoice ran out: it closes, and its amount is free for new invoices
    if (invoice.expiresAt < new Date()) {
      await db()
        .update(invoices)
        .set({ status: "expired" })
        .where(and(eq(invoices.id, id), eq(invoices.status, "open")));
      return err(410, "this invoice expired without a payment; create a new one");
    }
    return ok({ invoice: invoiceView(invoice), paid: false, message: "no payment seen yet" });
  }

  const tx = await rpc.getPaymentTransaction(signature).catch(() => "unreachable" as const);
  if (tx === "unreachable") return err(503, "could not reach Solana to read the payment; try again in a minute");
  const check = checkPayment(tx, {
    mint: invoice.mint,
    treasury: invoice.treasury,
    amount: BigInt(invoice.amount),
    notBefore: invoice.createdAt,
    reference: input.data.signature ? undefined : invoice.reference,
  });
  if (!check.ok) return err(402, check.error);
  if (tx?.blockTime && tx.blockTime * 1000 > invoice.expiresAt.getTime())
    return err(402, "the payment landed after the invoice expired; contact support with the signature");

  // One transaction for both writes: the invoice can only be marked paid once, and only then does the plan change.
  const result = await db()
    .transaction(async (t) => {
      const [paid] = await t
        .update(invoices)
        .set({ status: "paid", txSignature: signature, payer: check.payer, paidAt: new Date() })
        .where(and(eq(invoices.id, id), eq(invoices.status, invoice.status)))
        .returning();
      if (!paid) return null;
      const [fresh] = await t.select().from(accounts).where(eq(accounts.id, account.id));
      // paying again for the plan you have extends it; a different plan starts now
      const now = new Date();
      const extend = fresh!.plan === paid.plan && fresh!.planExpiresAt && fresh!.planExpiresAt > now;
      const start = extend ? fresh!.planExpiresAt! : now;
      const [updated] = await t
        .update(accounts)
        .set({ plan: paid.plan, planExpiresAt: addMonths(start, paid.months) })
        .where(eq(accounts.id, account.id))
        .returning();
      return { paid, updated: updated! };
    })
    .catch((e: unknown) => {
      // the same transaction already paid another invoice
      if ((e as { code?: string }).code === "23505") return "reused" as const;
      throw e;
    });
  if (result === "reused") return err(409, "that transaction already paid another invoice");
  if (!result) return err(409, "this invoice was just paid by another request");
  return ok({ invoice: invoiceView(result.paid), paid: true, plan: planOf(result.updated) });
});
