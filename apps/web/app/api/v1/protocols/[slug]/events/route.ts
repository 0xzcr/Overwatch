import type { NextRequest } from "next/server";
import { getProtocol, getEvents } from "@/lib/data";
import { guard, ok, err, withDb } from "@/lib/api";
import { event } from "@/lib/serialize";

export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = await getProtocol((await params).slug);
  if (!p) return err(404, "protocol not found");
  return ok((await getEvents({ protocolId: p.id, limit: 200 })).map(event));
}

export const GET = withDb(handleGET);
