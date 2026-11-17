import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, protocols, ingestSnapshot, eq } from "@overwatch/db";
import { mainnetRpc } from "@overwatch/solana";
import { collectSnapshot, effectivePlan, findVaultIndex, isAddress, protocolConfigSchema } from "@overwatch/core";
import { ok, err, hit } from "@/lib/api";
import { withAccount, body } from "@/lib/account";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  category: z.enum(["lending", "perps", "dex", "lst", "restaking", "aggregator", "yield", "oracle", "bridge", "infra"]),
  programs: z.array(z.string().refine(isAddress, "not a Solana address")).min(1).max(5),
  /** the Squads v4 multisig behind the upgrade key, if there is one */
  multisig: z.string().refine(isAddress, "not a Solana address").optional(),
});

/**
 * A private watch: the account's own programs (and multisig), graded and alerted like a public protocol but visible
 * only to this account. Everything is checked onchain before it is saved, and graded at once.
 */
export const POST = withAccount(async (req: NextRequest, account) => {
  const parsed = await body(req, schema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const plan = effectivePlan(account);
  const mine = await db().select({ id: protocols.id }).from(protocols).where(eq(protocols.ownerAccountId, account.id));
  if (mine.length >= plan.privateWatches)
    return err(
      402,
      plan.privateWatches
        ? `your plan allows ${plan.privateWatches} private watch(es)`
        : "private watches need a paid plan",
    );
  if (!(await hit(`watch-add:${account.id}`, 10, 3600)).ok) return err(429, "too many new watches this hour");

  const slug = `private-${account.id}-${randomBytes(3).toString("hex")}`;
  const rpc = mainnetRpc();
  // the vault index is found by derivation, so the customer only needs to paste the multisig address
  const draft = protocolConfigSchema.parse({
    slug,
    name: input.name,
    category: input.category,
    website: "https://overwatch1.xyz",
    programs: input.programs.map((id, i) => ({
      id,
      label: input.programs.length > 1 ? `Program ${i + 1}` : "Program",
    })),
    multisigs: [],
    source: "account",
  });
  const first = await collectSnapshot(rpc, draft, { scanNonces: false, scanProposals: false });
  if (first.snapshot.programs.length !== input.programs.length)
    return err(400, "every address must be a deployed upgradeable program on mainnet");

  let multisigs: typeof draft.multisigs = [];
  if (input.multisig) {
    const authorities = first.snapshot.programs.map((p) => p.upgradeAuthority).filter((a): a is string => !!a);
    const index = authorities.map((a) => findVaultIndex(input.multisig!, a, 15)).find((i) => i !== null);
    if (index === undefined || index === null)
      return err(400, "that multisig does not control the upgrade key of these programs");
    multisigs = [{ address: input.multisig, vault_index: index, role: "upgrade_authority" }];
  }
  const cfg = { ...draft, multisigs, verified: true };
  const { snapshot } = await collectSnapshot(rpc, cfg, { scanNonces: true, scanProposals: true });
  const [row] = await db()
    .insert(protocols)
    .values({
      slug,
      name: input.name,
      category: input.category,
      network: "mainnet",
      source: "account",
      config: cfg,
      verified: true,
      verification: { checkedAt: new Date().toISOString(), problems: [] },
      ownerAccountId: account.id,
      visibility: "private",
    })
    .returning();
  // graded now, so the dashboard shows a grade at once; the indexer takes over within minutes
  const result = await ingestSnapshot(row!, snapshot, { source: "live", force: true });
  return ok({ id: row!.id, slug, grade: result.score.grade, red: result.score.red });
});
