import type { NextRequest } from "next/server";
import { getProtocol, getScoreHistory } from "@/lib/data";
import { guard, ok, err, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const g = await guard(req); if (!("tier" in g)) return g;
  const p = await getProtocol((await params).slug);
  if (!p) return err(404, "protocol not found");
  return ok(await getScoreHistory(p.id));
}

export const GET = withDb(handleGET);
