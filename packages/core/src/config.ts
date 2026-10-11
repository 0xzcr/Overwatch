import { z } from "zod";

export const protocolConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  category: z.enum(["lending", "perps", "dex", "lst", "aggregator", "yield", "infra", "demo"]),
  defillama_slug: z.string().nullable().optional(),
  website: z.string().url(),
  docs_sources: z.array(z.string()).default([]),
  programs: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  multisigs: z
    .array(z.object({ address: z.string(), vault_index: z.number().int().min(0).max(255), role: z.enum(["upgrade_authority", "admin", "treasury"]), discovered_via: z.string().optional() }))
    .default([]),
  admin_accounts: z.array(z.string()).default([]),
  collateral_mints: z.array(z.string()).default([]),
  oracles: z.array(z.string()).default([]),
  notes: z.string().optional(),
  verified: z.boolean().default(false),
  source: z.enum(["config", "demo"]).default("config"),
  network: z.enum(["mainnet", "devnet"]).default("mainnet"),
});
export type ProtocolConfig = z.infer<typeof protocolConfigSchema>;
export const watchListSchema = z.array(protocolConfigSchema);
