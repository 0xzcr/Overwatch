// DEVNET ONLY — see packages/demo. Usage: tsx scripts/demo.ts <setup|remove-timelock|lower-threshold|create-signer-nonce|transfer-authority|reset>
import { ACTIONS, setup } from "@overwatch/demo";
import { sql } from "@overwatch/db";
const log = (line: string, sig?: string) => console.log(sig ? `${line}\n   https://explorer.solana.com/tx/${sig}?cluster=devnet` : line);
const run: Record<string, (l: typeof log) => Promise<unknown>> = { setup, ...ACTIONS };
const name = process.argv[2] ?? "";
if (!Object.hasOwn(run, name)) {
  console.error(`usage: tsx scripts/demo.ts <${Object.keys(run).join("|")}>`);
  process.exit(1);
}
try {
  const r = await run[name](log);
  if (r && typeof r === "object") console.log(JSON.stringify(r, null, 2));
} finally {
  await sql().end();
}
