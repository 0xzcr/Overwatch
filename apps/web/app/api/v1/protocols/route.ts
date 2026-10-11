import type { NextRequest } from "next/server";
import { getProtocols } from "@/lib/data";
import { guard, ok } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const g = await guard(req); if (!("tier" in g)) return g;
  const ps = await getProtocols();
  return ok(ps.map(({ snapshot: _s, config: _c, ...p }) => p));
}
