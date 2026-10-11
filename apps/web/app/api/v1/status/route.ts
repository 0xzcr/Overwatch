import { getProtocols } from "@/lib/data";
import { ok } from "@/lib/api";
import { mainnetRpc } from "@overwatch/solana";

export const dynamic = "force-dynamic";
let cache: { at: number; slot: number | null } = { at: 0, slot: null };

export async function GET() {
  if (Date.now() - cache.at > 2500) {
    cache = { at: Date.now(), slot: await mainnetRpc().getSlot().catch(() => cache.slot) };
  }
  const ps = await getProtocols();
  return ok({ slot: cache.slot, protocols: ps.length, red: ps.filter((p) => p.red).length, lastEvent: ps.map((p) => p.lastChange).filter(Boolean).sort().at(-1) ?? null });
}
