import { getProtocols } from "@/lib/data";
import { ok } from "@/lib/api";
import { mainnetRpc } from "@overwatch/solana";

export const dynamic = "force-dynamic";
let cache: { at: number; slot: number | null } = { at: 0, slot: null };

/** Health and headline counts. Always answers; `database` says whether the counts are available. */
async function status() {
  if (Date.now() - cache.at > 2500) {
    // Capped so a slow public RPC can't hold the function past the host's time limit.
    const slot = await Promise.race([
      mainnetRpc().getSlot(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]).catch(() => cache.slot);
    cache = { at: Date.now(), slot };
  }
  const ps = await getProtocols().catch(() => null);
  if (!ps) return ok({ slot: cache.slot, database: "unavailable", protocols: null, red: null, lastEvent: null });
  return ok({
    slot: cache.slot,
    database: "ok",
    protocols: ps.length,
    red: ps.filter((p) => p.red).length,
    lastEvent:
      ps
        .map((p) => p.lastChange)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
  });
}

/** Every page view asks for the slot, so let the CDN answer for a few seconds. Safe to share: no API key, no rate limit. */
export async function GET() {
  const res = await status();
  res.headers.set("cache-control", "s-maxage=5, stale-while-revalidate=10");
  return res;
}
