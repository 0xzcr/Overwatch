/** Plain-English alert formatting shared by Telegram, email and webhooks. */
export interface AlertInput {
  name: string; slug: string; severity: string; title: string; explanation: string; type: string; txSignature: string | null; network: string; labels: string[];
}
const EMOJI: Record<string, string> = { CRITICAL: "🚨", HIGH: "🟠", MEDIUM: "🟡", LOW: "⚪", INFO: "🟢" };
const ACTION: Record<string, string> = {
  CRITICAL: "Consider withdrawing until the team explains this change. Check their official channels.",
  HIGH: "Review your exposure and watch for an official explanation.",
  MEDIUM: "Worth a look. Usually routine, but confirm it was announced.",
  LOW: "No action needed.",
  INFO: "Good news: controls got stronger. No action needed.",
};
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function telegramHtml(a: AlertInput, site: string): string {
  const tx = a.txSignature ? `\n<a href="https://explorer.solana.com/tx/${a.txSignature}${a.network === "devnet" ? "?cluster=devnet" : ""}">View transaction</a> · ` : "\n";
  return [
    `${EMOJI[a.severity] ?? "•"} <b>${esc(a.name)}</b> · ${a.severity}${a.labels.length ? ` · ${esc(a.labels.join(", "))}` : ""}`,
    `<b>${esc(a.title)}</b>`,
    esc(a.explanation),
    `\n<i>What you can do:</i> ${ACTION[a.severity] ?? ""}`,
    `${tx}<a href="${site}/protocols/${a.slug}">Protocol page</a>`,
  ].join("\n");
}

export function emailHtml(a: AlertInput, site: string): { subject: string; html: string } {
  return {
    subject: `${EMOJI[a.severity] ?? ""} ${a.severity}: ${a.title}`,
    html: `<div style="font-family:system-ui;max-width:560px"><p style="color:#888;font-size:12px;letter-spacing:.2em">OVERWATCH · ${a.severity}</p><h2>${esc(a.title)}</h2><p>${esc(a.explanation)}</p><p><b>What you can do:</b> ${ACTION[a.severity] ?? ""}</p><p><a href="${site}/protocols/${a.slug}">Open ${esc(a.name)} on Overwatch</a></p></div>`,
  };
}

export function webhookPayload(a: AlertInput & { id: number; detectedAt: string; slot: number | null }) {
  return { version: "2026-10-11", event: { id: a.id, protocol: a.slug, protocol_name: a.name, type: a.type, severity: a.severity, title: a.title, explanation: a.explanation, labels: a.labels, tx_signature: a.txSignature, slot: a.slot, network: a.network, detected_at: a.detectedAt } };
}

/** Exponential backoff for retries: 10s, 20s, 40s, 80s, 160s; give up after 6 attempts. */
export const MAX_ATTEMPTS = 6;
export const backoffMs = (attempt: number) => Math.min(3_600_000, 10_000 * 2 ** (attempt - 1));
