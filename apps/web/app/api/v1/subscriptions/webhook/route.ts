import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, subscriptions, protocolIdsForSlugs } from "@overwatch/db";
import { webhookUrlProblem } from "@overwatch/core/net";
import { guard, signupLimit, ok, err, withDb } from "@/lib/api";
import { describe, severity, protocolFilter } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
const body = z.object({
  url: z.string().url(),
  min_severity: severity.default("HIGH"),
  protocols: protocolFilter.optional(),
});

async function handlePOST(req: NextRequest) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const bad = await webhookUrlProblem(p.data.url);
  if (bad) return err(400, `url: ${bad}`);
  let ids: number[] | null = null;
  if (Array.isArray(p.data.protocols) && p.data.protocols.length) {
    const r = await protocolIdsForSlugs(p.data.protocols);
    if (r.unknown.length) return err(400, `unknown protocol(s): ${r.unknown.join(", ")}`);
    ids = r.ids;
  }
  const limited = await signupLimit(req, "webhook");
  if (limited) return limited;
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const [row] = await db()
    .insert(subscriptions)
    .values({ channel: "webhook", target: p.data.url, minSeverity: p.data.min_severity, protocolIds: ids, secret })
    .returning();
  return ok({
    ...(await describe(row!)),
    url: row!.target,
    secret,
    signature_header: "x-overwatch-signature",
    algorithm: "HMAC-SHA256(hex) of raw body",
    manage: `/api/v1/subscriptions/${row!.id} with header x-subscription-secret`,
  });
}

export const POST = withDb(handlePOST);
