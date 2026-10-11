/** Minimal client for the Overwatch public API (/api/v1). */
export class OverwatchClient {
  constructor(private baseUrl = "https://overwatch.example", private apiKey?: string) {}
  private async get<T>(path: string): Promise<T> {
    const r = await fetch(`${this.baseUrl}/api/v1${path}`, { headers: this.apiKey ? { "x-api-key": this.apiKey } : {} });
    if (!r.ok) throw new Error(`Overwatch API ${r.status}: ${await r.text()}`);
    return (await r.json()) as T;
  }
  protocols() { return this.get<{ version: string; data: unknown[] }>("/protocols"); }
  protocol(slug: string) { return this.get<{ version: string; data: unknown }>(`/protocols/${slug}`); }
  events(q: { severity?: string; since?: string } = {}) { return this.get<{ version: string; data: unknown[] }>(`/events?${new URLSearchParams(q as Record<string, string>)}`); }
  scoreHistory(slug: string) { return this.get<{ version: string; data: unknown[] }>(`/scores/${slug}/history`); }
}

/** Verify an `x-overwatch-signature` webhook header (HMAC-SHA256 hex of the raw body). */
export async function verifyWebhook(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.length === signature.length && hex.split("").every((c, i) => c === signature[i]);
}
