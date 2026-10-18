import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, subscriptions, protocolIdsForSlugs } from "@overwatch/db";
import { webhookUrlProblem } from "@overwatch/core/net";
import { guard, ok, err, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
const body = z.object({
  url: z.string().url(),
  min_severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  protocols: z.array(z.string()).max(50).optional(),
});

async function handlePOST(req: NextRequest) {
  const g = await guard(req); if (!("tier" in g)) return g;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const bad = await webhookUrlProblem(p.data.url);
  if (bad) return err(400, `url: ${bad}`);
  let ids: number[] | null = null;
  if (p.data.protocols?.length) {
    const r = await protocolIdsForSlugs(p.data.protocols);
    if (r.unknown.length) return err(400, `unknown protocol(s): ${r.unknown.join(", ")}`);
    ids = r.ids;
  }
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const [row] = await db().insert(subscriptions).values({ channel: "webhook", target: p.data.url, minSeverity: p.data.min_severity, protocolIds: ids, secret }).returning();
  return ok({ id: row!.id, url: row!.target, min_severity: row!.minSeverity, protocols: p.data.protocols ?? "all", secret, signature_header: "x-overwatch-signature", algorithm: "HMAC-SHA256(hex) of raw body" });
}

export const POST = withDb(handlePOST);
