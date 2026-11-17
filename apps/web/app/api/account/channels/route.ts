import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, subscriptions, eq, and } from "@overwatch/db";
import { webhookUrlProblem } from "@overwatch/core/net";
import { atLeastSeverity, effectivePlan } from "@overwatch/core";
import { ok, err, hit } from "@/lib/api";
import { withAccount, body } from "@/lib/account";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/site/content";

export const dynamic = "force-dynamic";

const severity = z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const schema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("webhook"), url: z.string().url().max(500), minSeverity: severity.default("HIGH") }),
  z.object({ channel: z.literal("email"), email: z.string().email().max(200), minSeverity: severity.default("HIGH") }),
]);

/**
 * Adds an alert channel to the account. Channels follow the account's watchlist and plan: the plan decides which
 * channels and severities are allowed, and delivery re-checks it on every alert (so a lapsed plan stops at once).
 */
export const POST = withAccount(async (req: NextRequest, account) => {
  const parsed = await body(req, schema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const plan = effectivePlan(account);
  if (!plan.channels.includes(input.channel))
    return err(402, `${input.channel} alerts need a paid plan (you are on ${plan.name})`);
  if (!atLeastSeverity(input.minSeverity, plan.minSeverity))
    return err(402, `the ${plan.name} plan delivers ${plan.minSeverity} and above`);
  if (!(await hit(`channel-add:${account.id}`, 20, 86_400)).ok) return err(429, "too many new channels today");

  const existing = await db()
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.accountId, account.id), eq(subscriptions.channel, input.channel)));

  if (input.channel === "webhook") {
    if (existing.length >= plan.webhooks) return err(402, `your plan allows ${plan.webhooks} webhook(s)`);
    const bad = await webhookUrlProblem(input.url);
    if (bad) return err(400, `url: ${bad}`);
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const [row] = await db()
      .insert(subscriptions)
      .values({ channel: "webhook", target: input.url, minSeverity: input.minSeverity, secret, accountId: account.id })
      .returning();
    // the secret is shown once; it signs every payload (HMAC-SHA256 of the raw body, hex, in x-overwatch-signature)
    return ok({ id: row!.id, secret });
  }

  if (!process.env.RESEND_API_KEY) return err(503, "email delivery is not configured on this deployment");
  const email = input.email.toLowerCase();
  if (existing.some((s) => s.target === email)) return err(409, "that address is already on this account");
  if (!(await hit(`confirm-mail:${email}`, 3, 86_400)).ok)
    return err(429, "too many confirmation emails to this address today");
  const token = randomBytes(24).toString("hex");
  const [row] = await db()
    .insert(subscriptions)
    .values({
      channel: "email",
      target: email,
      minSeverity: input.minSeverity,
      confirmed: false,
      confirmToken: token,
      accountId: account.id,
    })
    .returning();
  try {
    const link = `${SITE_URL}/api/v1/subscriptions/confirm?token=${token}`;
    await sendEmail(
      email,
      "Confirm your Overwatch alerts",
      `<p>Confirm this address to receive Overwatch alerts for your watchlist.</p><p><a href="${link}">Confirm</a></p><p>If this wasn't you, ignore this email.</p>`,
    );
  } catch (e) {
    await db().delete(subscriptions).where(eq(subscriptions.id, row!.id));
    return err(502, `could not send the confirmation email: ${(e as Error).message}`);
  }
  return ok({ id: row!.id, next: "open the email we sent and click the link" });
});
