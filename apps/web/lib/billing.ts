import "server-only";
import { baseUnitsToUsdc } from "@overwatch/core";
import type { invoices } from "@overwatch/db";
import { devnetRpc, mainnetRpc } from "@overwatch/solana";

/** Circle's USDC mints. Devnet USDC comes from faucet.circle.com. */
const USDC = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

export interface BillingConfig {
  network: "mainnet" | "devnet";
  /** the wallet that receives payments (its USDC token account must exist) */
  treasury: string;
  mint: string;
}

/**
 * Billing settings from the environment. Payments go straight to BILLING_TREASURY; Overwatch never holds keys.
 * Returns null when billing is not set up, and the pricing page then says so instead of taking money.
 */
export function billingConfig(): BillingConfig | null {
  const treasury = process.env.BILLING_TREASURY;
  if (!treasury) return null;
  const network = process.env.BILLING_NETWORK === "mainnet" ? "mainnet" : "devnet";
  return { network, treasury, mint: process.env.BILLING_USDC_MINT || USDC[network] };
}

export const billingRpc = (network: BillingConfig["network"]) => (network === "mainnet" ? mainnetRpc() : devnetRpc());

/** Invoices stay payable for this long. */
export const INVOICE_TTL_MS = 24 * 3_600_000;

/** A Solana Pay transfer request: any Solana Pay wallet (or a QR scan) can pay it. */
export function solanaPayUrl(o: { treasury: string; amount: string; mint: string; reference: string; memo: string }) {
  const q = new URLSearchParams({
    amount: o.amount,
    "spl-token": o.mint,
    reference: o.reference,
    label: "Overwatch",
    message: o.memo,
  });
  return `solana:${o.treasury}?${q.toString()}`;
}

/** Adds calendar months, keeping the day where it exists. */
export function addMonths(from: Date, months: number): Date {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function invoiceView(i: typeof invoices.$inferSelect) {
  const amount = baseUnitsToUsdc(i.amount);
  return {
    id: i.id,
    plan: i.plan,
    months: i.months,
    amount,
    network: i.network,
    mint: i.mint,
    treasury: i.treasury,
    reference: i.reference,
    status: i.status,
    txSignature: i.txSignature,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
    paidAt: i.paidAt?.toISOString() ?? null,
    solanaPay: solanaPayUrl({
      treasury: i.treasury,
      amount,
      mint: i.mint,
      reference: i.reference,
      memo: `Overwatch ${i.plan} for ${i.months} month${i.months > 1 ? "s" : ""}`,
    }),
  };
}
