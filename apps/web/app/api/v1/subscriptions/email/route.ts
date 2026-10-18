import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, subscriptions, protocolIdsForSlugs } from "@overwatch/db";
import { guard, ok, err, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
async function handlePOST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) return err(503, "email alerts are coming soon (RESEND_API_KEY not configured)");
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = z
    .object({
      email: z.string().email(),
      min_severity: z.enum(["MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
      protocols: z.array(z.string()).optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, "invalid email");
  let ids: number[] | null = null;
  if (p.data.protocols?.length) {
    const r = await protocolIdsForSlugs(p.data.protocols);
    if (r.unknown.length) return err(400, `unknown protocol(s): ${r.unknown.join(", ")}`);
    ids = r.ids;
  }
  const [row] = await db()
    .insert(subscriptions)
    .values({ channel: "email", target: p.data.email, minSeverity: p.data.min_severity, protocolIds: ids })
    .returning();
  return ok({ id: row!.id });
}

export const POST = withDb(handlePOST);
