import { z } from "zod";

export const protocolConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  category: z.enum(["lending", "perps", "dex", "lst", "restaking", "aggregator", "yield", "oracle", "bridge", "infra"]),
  defillama_slug: z.string().nullable().optional(),
  website: z.string().url(),
  docs_sources: z.array(z.string()).default([]),
  programs: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  multisigs: z
    .array(
      z.object({
        address: z.string(),
        vault_index: z.number().int().min(0).max(255),
        role: z.enum(["upgrade_authority", "admin", "treasury"]),
        discovered_via: z.string().optional(),
      }),
    )
    .default([]),
  admin_accounts: z.array(z.string()).default([]),
  /**
   * What an adapter's admin can really do, read from the deployed program, with the source. `share` is the most of
   * deposits it can move or lose (0: no such instruction in the deployed code); `protective` means it can only
   * make things safer. Without an entry, or after the program is redeployed, the admin counts as a full drain path.
   */
  admin_limits: z
    .array(
      z.object({
        adapter: z.string(),
        share: z.number().min(0).max(1).optional(),
        protective: z.boolean().optional(),
        source: z.string(),
        /** the program deploy this was read from: after any redeploy the entry stops applying until re-checked */
        deploy_slot: z.number().int(),
      }),
    )
    .default([]),
  collateral_mints: z.array(z.string()).default([]),
  oracles: z.array(z.string()).default([]),
  notes: z.string().optional(),
  /** hours a depositor needs to withdraw (unstaking queues, withdrawal delays); omitted means immediate */
  exit_hours: z.number().min(0).optional(),
  verified: z.boolean().default(false),
  source: z.enum(["config", "account"]).default("config"),
  network: z.enum(["mainnet", "devnet"]).default("mainnet"),
});
export type ProtocolConfig = z.infer<typeof protocolConfigSchema>;
export const watchListSchema = z.array(protocolConfigSchema);
