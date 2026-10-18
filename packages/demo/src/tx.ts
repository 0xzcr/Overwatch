import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

export type Log = (line: string, sig?: string) => void;

export async function send(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  log?: Log,
  label = "tx",
): Promise<string> {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }), ...ixs);
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed", skipPreflight: false });
      log?.(`✔ ${label}`, sig);
      return sig;
    } catch (e) {
      last = e;
      const msg = (e as Error).message;
      if (!/blockhash|timeout|429|fetch failed/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  const logs = (last as { logs?: string[] }).logs?.slice(-6).join("\n") ?? "";
  throw new Error(`${label} failed: ${(last as Error).message}\n${logs}`);
}
