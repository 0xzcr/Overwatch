import type { NextRequest } from "next/server";
import { db, invoices, eq, and } from "@overwatch/db";
import { ok, err } from "@/lib/api";
import { withAccount } from "@/lib/account";
import { billingRpc } from "@/lib/billing";
import { buildUsdcPayment } from "@/lib/usdc-transfer";

export const dynamic = "force-dynamic";

/**
 * Builds the payment transaction for an open invoice, paid from the signed-in wallet. The wallet shows the user
 * exactly this transfer before they approve it; nothing is signed here.
 */
export const POST = withAccount(async (_req: NextRequest, account, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.accountId, account.id)));
  if (!invoice) return err(404, "invoice not found");
  if (invoice.status !== "open" || invoice.expiresAt < new Date()) return err(410, "this invoice is no longer open");
  const network = invoice.network as "mainnet" | "devnet";
  const latest = await billingRpc(network)
    .call<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }])
    .catch(() => null);
  if (!latest) return err(503, "could not reach Solana to build the payment; try again in a minute");
  const { value } = latest;
  const tx = buildUsdcPayment({
    payer: account.wallet,
    treasury: invoice.treasury,
    mint: invoice.mint,
    amount: BigInt(invoice.amount),
    reference: invoice.reference,
    recentBlockhash: value.blockhash,
  });
  return ok({ transaction: Buffer.from(tx).toString("base64"), network });
});
