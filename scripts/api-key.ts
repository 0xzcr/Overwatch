/**
 * Admin tool for API keys. Public access needs no key; a key only raises the per-minute limit for a known integrator.
 * Keys are shown once and stored only as SHA-256 hashes.
 *
 *   pnpm api-key create "<owner>" [--limit 300] [--tier partner]
 *   pnpm api-key list
 *   pnpm api-key revoke <id>
 */
import { createHash, randomBytes } from "node:crypto";
import { db, sql, apiKeys, eq } from "@overwatch/db";

const [cmd, ...args] = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

try {
  if (cmd === "create" && args[0] && !args[0].startsWith("--")) {
    const key = `ow_${randomBytes(24).toString("hex")}`;
    const limit = Number(opt("limit") ?? 300);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive whole number");
    const [row] = await db()
      .insert(apiKeys)
      .values({
        keyHash: createHash("sha256").update(key).digest("hex"),
        owner: args[0],
        tier: opt("tier") ?? "partner",
        rateLimit: limit,
      })
      .returning();
    console.log(
      `key #${row!.id} for ${row!.owner} (${row!.tier}, ${row!.rateLimit}/min)\n\n  ${key}\n\nshown once: send it to the owner now`,
    );
  } else if (cmd === "list") {
    for (const k of await db().select().from(apiKeys).orderBy(apiKeys.id))
      console.log(
        `#${k.id}  ${k.owner}  ${k.tier}  ${k.rateLimit}/min  created ${k.createdAt.toISOString().slice(0, 10)}${k.revokedAt ? `  REVOKED ${k.revokedAt.toISOString().slice(0, 10)}` : ""}`,
      );
  } else if (cmd === "revoke" && Number.isInteger(Number(args[0]))) {
    const [row] = await db()
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, Number(args[0])))
      .returning();
    console.log(row ? `revoked key #${row.id} (${row.owner})` : `no key #${args[0]}`);
  } else {
    console.log('usage: pnpm api-key create "<owner>" [--limit 300] [--tier partner] | list | revoke <id>');
    process.exitCode = 1;
  }
} finally {
  await sql().end();
}
