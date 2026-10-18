import type { NextRequest } from "next/server";
import { getProtocol } from "@/lib/data";
import { guard, ok, err, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = await getProtocol((await params).slug);
  return p ? ok(p) : err(404, "protocol not found");
}

export const GET = withDb(handleGET);
