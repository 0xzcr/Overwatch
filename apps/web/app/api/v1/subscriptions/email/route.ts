import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, subscriptions, protocolIdsForSlugs, eq } from "@overwatch/db";
import { guard, signupLimit, hit, ok, err, withDb } from "@/lib/api";
import { describe, protocolFilter } from "@/lib/subscriptions";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/site/content";

export const dynamic = "force-dynamic";
const body = z.object({
  email: z.string().email(),
  min_severity: z.enum(["MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  protocols: protocolFilter.optional(),
});

/** Creates an unconfirmed email subscription and mails a confirmation link; no alerts are sent until it is clicked. */
async function handlePOST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) return err(503, "email alerts are coming soon (RESEND_API_KEY not configured)");
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  let ids: number[] | null = null;
  if (Array.isArray(p.data.protocols) && p.data.protocols.length) {
    const r = await protocolIdsForSlugs(p.data.protocols);
    if (r.unknown.length) return err(400, `unknown protocol(s): ${r.unknown.join(", ")}`);
    ids = r.ids;
  }
  const limited = await signupLimit(req, "email");
  if (limited) return limited;
  // also cap confirmation mails per address, so nobody can flood someone else's inbox from many IPs
  const email = p.data.email.toLowerCase();
  if (!(await hit(`confirm-mail:${email}`, 3, 86_400)).ok)
    return err(429, "too many confirmation emails to this address today");

  const secret = `subsec_${randomBytes(24).toString("hex")}`;
  const token = randomBytes(24).toString("hex");
  const [row] = await db()
    .insert(subscriptions)
    .values({
      channel: "email",
      target: email,
      minSeverity: p.data.min_severity,
      protocolIds: ids,
      secret,
      confirmed: false,
      confirmToken: token,
    })
    .returning();
  const link = `${SITE_URL}/api/v1/subscriptions/confirm?token=${token}`;
  try {
    await sendEmail(
      email,
      "Confirm your Overwatch alerts",
      `<p>Someone (hopefully you) asked for Overwatch alerts at this address.</p>
       <p><a href="${link}">Confirm and start receiving alerts</a></p>
       <p>If this wasn't you, ignore this email and nothing will be sent.</p>`,
    );
  } catch (e) {
    await db().delete(subscriptions).where(eq(subscriptions.id, row!.id));
    return err(502, `could not send the confirmation email: ${(e as Error).message}`);
  }
  return ok({ ...(await describe(row!)), secret, next: "check your inbox and click the confirmation link" });
}

export const POST = withDb(handlePOST);
