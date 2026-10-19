import type { NextRequest } from "next/server";
import { getProtocols } from "@/lib/data";
import { guard, ok, withDb } from "@/lib/api";
import { protocolSummary } from "@/lib/serialize";

export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  return ok((await getProtocols()).map(protocolSummary));
}

export const GET = withDb(handleGET);
