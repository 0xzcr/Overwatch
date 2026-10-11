// DEVNET ONLY — see packages/demo
import { createSignerNonce } from "@overwatch/demo";
import { sql } from "@overwatch/db";
const log = (line: string, sig?: string) => console.log(sig ? `${line}\n   https://explorer.solana.com/tx/${sig}?cluster=devnet` : line);
try {
  const r = await createSignerNonce(log);
  if (r && typeof r === "object") console.log(JSON.stringify(r, null, 2));
} finally {
  await sql().end();
}
