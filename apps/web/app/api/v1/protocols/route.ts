import type { NextRequest } from "next/server";
import { getProtocols } from "@/lib/data";
import { guard, ok, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest) {
  const g = await guard(req); if (!("tier" in g)) return g;
  const ps = await getProtocols();
  return ok(ps.map(({ snapshot: _s, config: _c, ...p }) => p));
}

export const GET = withDb(handleGET);
