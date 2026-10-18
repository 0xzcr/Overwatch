import { createHmac } from "node:crypto";
import { db, deliveries, subscriptions, events, protocols, eq, and, dsql } from "@overwatch/db";
import type { Bot } from "grammy";
import { webhookUrlProblem } from "@overwatch/core/net";
import { telegramHtml, emailHtml, webhookPayload, backoffMs, MAX_ATTEMPTS, type AlertInput } from "./format";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function deliverPending(bot: Bot | null, log: (m: string) => void) {
  const d = db();
  const rows = await d
    .select({ dl: deliveries, sub: subscriptions, ev: events, p: protocols })
    .from(deliveries)
    .innerJoin(subscriptions, eq(deliveries.subscriptionId, subscriptions.id))
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(protocols, eq(events.protocolId, protocols.id))
    .where(and(eq(deliveries.status, "pending"), dsql`${deliveries.nextAttemptAt} <= now()`))
    .limit(50);
  for (const { dl, sub, ev, p } of rows) {
    const a: AlertInput = { name: p.name, slug: p.slug, severity: ev.severity, title: ev.title, explanation: ev.explanation, type: ev.type, txSignature: ev.txSignature, network: p.network, labels: (ev.labels as string[]) ?? [] };
    try {
      if (sub.channel === "telegram") {
        if (!bot) throw new Error("telegram bot not configured");
        await bot.api.sendMessage(sub.target, telegramHtml(a, SITE), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      } else if (sub.channel === "webhook") {
        // Checked on every send, not just at signup: the host's DNS can point somewhere internal later.
        const bad = await webhookUrlProblem(sub.target);
        if (bad) throw new Error(`refused: url ${bad}`);
        const body = JSON.stringify(webhookPayload({ ...a, id: ev.id, detectedAt: ev.detectedAt.toISOString(), slot: ev.slot }));
        const sig = createHmac("sha256", sub.secret ?? "").update(body).digest("hex");
        // No redirects: a public URL must not bounce the request to an internal one.
        const r = await fetch(sub.target, { method: "POST", headers: { "content-type": "application/json", "x-overwatch-signature": sig, "user-agent": "Overwatch-Webhook/1" }, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } else if (sub.channel === "email") {
        if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
        const { subject, html } = emailHtml(a, SITE);
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM || "Overwatch <alerts@resend.dev>", to: sub.target, subject, html }), signal: AbortSignal.timeout(10_000) });
        if (!r.ok) throw new Error(`Resend HTTP ${r.status}`);
      }
      await d.update(deliveries).set({ status: "delivered", attempts: dl.attempts + 1, deliveredAt: new Date(), lastError: null }).where(eq(deliveries.id, dl.id));
      log(`delivered event ${ev.id} → ${sub.channel}:${sub.target.slice(0, 24)}`);
    } catch (e) {
      const attempts = dl.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await d.update(deliveries).set({ status: failed ? "failed" : "pending", attempts, lastError: (e as Error).message, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) }).where(eq(deliveries.id, dl.id));
      log(`delivery ${dl.id} attempt ${attempts} failed: ${(e as Error).message}${failed ? " (giving up)" : ""}`);
    }
  }
}
