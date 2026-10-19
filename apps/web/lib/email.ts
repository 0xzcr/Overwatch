import "server-only";

/** Sends one email through Resend. Throws when it isn't configured or Resend refuses. */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM || "Overwatch <alerts@resend.dev>", to, subject, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`email provider answered ${r.status}`);
}
