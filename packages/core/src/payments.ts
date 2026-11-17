/**
 * Checking a USDC payment on Solana from the transaction itself. Pure: the caller fetches the transaction (with
 * token balances) from any RPC and passes it in, so this can be tested without a network.
 *
 * A payment counts when the transaction succeeded, landed after the invoice was created, and raised the
 * treasury's balance of the invoice's mint by at least the invoice amount. Balances are compared by owner and mint,
 * so the treasury's token account address never has to be configured.
 */

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

export interface PaymentTx {
  blockTime?: number | null;
  meta: { err?: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
  transaction: { signatures: string[]; message: { accountKeys: string[] } };
}

export interface ExpectedPayment {
  mint: string;
  /** the wallet that owns the receiving token account */
  treasury: string;
  /** base units (USDC has 6 decimals) */
  amount: bigint;
  /** the invoice's creation time; an older transaction cannot pay it */
  notBefore: Date;
  /** when set, the transaction must include this reference key (Solana Pay) */
  reference?: string;
}

export type PaymentCheck = { ok: true; payer: string; received: bigint } | { ok: false; error: string };

const balanceOf = (balances: TokenBalance[] | undefined, mint: string, owner: string) =>
  (balances ?? [])
    .filter((b) => b.mint === mint && b.owner === owner)
    .reduce((sum, b) => sum + BigInt(b.uiTokenAmount.amount), 0n);

export function checkPayment(tx: PaymentTx | null, expect: ExpectedPayment): PaymentCheck {
  if (!tx) return { ok: false, error: "transaction not found (it may not be confirmed yet)" };
  if (!tx.meta) return { ok: false, error: "transaction has no status yet" };
  if (tx.meta.err) return { ok: false, error: "transaction failed on chain" };
  if (tx.blockTime && tx.blockTime * 1000 < expect.notBefore.getTime())
    return { ok: false, error: "transaction is older than the invoice" };
  if (expect.reference && !tx.transaction.message.accountKeys.includes(expect.reference))
    return { ok: false, error: "transaction does not carry this invoice's reference" };
  const received =
    balanceOf(tx.meta.postTokenBalances, expect.mint, expect.treasury) -
    balanceOf(tx.meta.preTokenBalances, expect.mint, expect.treasury);
  if (received < expect.amount)
    return { ok: false, error: `received ${received} base units, invoice is for ${expect.amount}` };
  // the fee payer (first key) signed and paid: it is who we record as the payer
  return { ok: true, payer: tx.transaction.message.accountKeys[0] ?? "unknown", received };
}

/** "19.000137" → 19000137n. Only plain decimal strings with at most 6 places. */
export function usdcToBaseUnits(usdc: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(usdc)) throw new Error(`not a USDC amount: ${usdc}`);
  const [whole, fraction = ""] = usdc.split(".");
  return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export const baseUnitsToUsdc = (units: bigint | number) => {
  const n = BigInt(units);
  return `${n / 1_000_000n}.${(n % 1_000_000n).toString().padStart(6, "0")}`;
};
