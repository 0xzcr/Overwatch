import type { NextRequest } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { hasState, loadState, connection, keys } from "@overwatch/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const recent = new Map<string, number>();

/** DEVNET faucet for the DEMO token (no value): mints 1,000 to the connected wallet. */
export async function POST(req: NextRequest) {
  if (process.env.DEMO_MODE !== "true" || !hasState()) return Response.json({ error: "demo disabled" }, { status: 403 });
  const p = z.object({ owner: z.string().min(32).max(44) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "owner required" }, { status: 400 });
  let owner: PublicKey;
  try { owner = new PublicKey(p.data.owner); } catch { return Response.json({ error: "invalid address" }, { status: 400 }); }
  if (Date.now() - (recent.get(p.data.owner) ?? 0) < 60_000) return Response.json({ error: "one faucet drip per minute" }, { status: 429 });
  recent.set(p.data.owner, Date.now());
  const s = loadState();
  const conn = connection();
  const { admin } = keys();
  const ata = await getOrCreateAssociatedTokenAccount(conn, admin, new PublicKey(s.mint), owner);
  const sig = await mintTo(conn, admin, new PublicKey(s.mint), ata.address, admin, 1_000_000_000n);
  return Response.json({ ok: true, signature: sig, ata: ata.address.toBase58() });
}
