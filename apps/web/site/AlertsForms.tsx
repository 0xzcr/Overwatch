"use client";
import { useEffect, useState } from "react";

const SEV = ["MEDIUM", "HIGH", "CRITICAL"];
type Out = { text: string; ok: boolean } | null;

async function post(url: string, body: unknown): Promise<{ data?: Record<string, unknown>; error?: string }> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { data?: Record<string, unknown>; error?: string };
    if (r.status === 503)
      return { error: "Subscriptions need the live database, which isn't connected on this deployment." };
    return j;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Telegram deep link, webhook creation with test-fire, and email subscription. */
export function AlertsForms({
  protocols,
  preselect,
  bot,
  emailEnabled,
}: {
  protocols: { slug: string; name: string }[];
  preselect?: string;
  bot?: string;
  emailEnabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [sev, setSev] = useState("HIGH");
  const [sel, setSel] = useState<string[]>(preselect ? [preselect] : []);
  const [created, setCreated] = useState<{ id: number; secret: string } | null>(null);
  const [out, setOut] = useState<Out>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // the confirmation link in the email lands back here with ?email=confirmed|invalid
  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get("email");
    if (state === "confirmed") setOut({ text: "Email confirmed. Alerts will now reach your inbox.", ok: true });
    else if (state === "invalid") setOut({ text: "That confirmation link is invalid or was already used.", ok: false });
  }, []);
  const toggle = (s: string) => setSel((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  const create = async () => {
    setBusy(true);
    setOut(null);
    const r = await post("/api/v1/subscriptions/webhook", {
      url,
      min_severity: sev,
      protocols: sel.length ? sel : undefined,
    });
    if (r.error || !r.data) setOut({ text: r.error ?? "Could not create the webhook.", ok: false });
    else {
      setCreated({ id: Number(r.data.id), secret: String(r.data.secret) });
      setOut({
        text: `Webhook #${String(r.data.id)} created. Copy the secret now; it won't be shown again. It also lets you change or delete the webhook through the API.`,
        ok: true,
      });
    }
    setBusy(false);
  };
  const test = async () => {
    if (!created) return;
    setBusy(true);
    const r = await post("/api/v1/subscriptions/test", created);
    setOut(
      r.data?.delivered
        ? { text: `Test delivered (HTTP ${String(r.data.status)})`, ok: true }
        : { text: `Test failed: ${String(r.data?.error ?? r.error ?? `HTTP ${String(r.data?.status)}`)}`, ok: false },
    );
    setBusy(false);
  };
  const subEmail = async () => {
    setBusy(true);
    const r = await post("/api/v1/subscriptions/email", {
      email,
      min_severity: sev,
      protocols: sel.length ? sel : undefined,
    });
    setOut(
      r.error
        ? { text: r.error, ok: false }
        : { text: "Almost done: open the email we just sent and click the link to start receiving alerts.", ok: true },
    );
    setBusy(false);
  };

  return (
    <div className="alerts">
      <div className="paths alerts__channels">
        <div className="path" style={{ ["--c" as string]: "#7CF3FF" }}>
          <h3>Telegram</h3>
          <p>
            Open the bot and send <span className="mono">/watch drift</span>, <span className="mono">/list</span> or{" "}
            <span className="mono">/status kamino-lend</span>. <span className="mono">/wallet &lt;address&gt;</span>{" "}
            subscribes you to protocols you hold.
          </p>
          {bot ? (
            <a
              href={`https://t.me/${bot}${preselect ? `?start=watch_${preselect}` : ""}`}
              className="btn btn--glow btn--sm"
              data-cursor="Open"
            >
              <span>Open @{bot}</span>
            </a>
          ) : (
            <span className="path__cta dim">The bot isn&apos;t connected on this deployment.</span>
          )}
        </div>
        <div className="path" style={{ ["--c" as string]: "#2BFFB0" }}>
          <h3>Webhook</h3>
          <p>
            Signed with HMAC-SHA256 in <span className="mono">x-overwatch-signature</span>. Failed deliveries retry up
            to 6 times with exponential backoff.
          </p>
          <a href="#webhook" className="path__cta">
            Create one below →
          </a>
        </div>
        <div className="path" style={{ ["--c" as string]: "#FFB547" }}>
          <h3>Email</h3>
          {emailEnabled ? (
            <div className="field-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="field"
              />
              <button onClick={subEmail} disabled={!email || busy} className="btn btn--ghost btn--sm">
                <span>Save</span>
              </button>
            </div>
          ) : (
            <>
              <p>The same plain-English alerts in your inbox.</p>
              <span className="path__cta dim">Email delivery isn&apos;t configured on this deployment.</span>
            </>
          )}
        </div>
      </div>

      <div className="form-card" id="webhook">
        <h3 className="form-card__title">Create a webhook</h3>
        <label className="field-label" htmlFor="wh-url">
          Endpoint URL
        </label>
        <input
          id="wh-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-server.example/overwatch"
          className="field mono"
        />
        <p className="field-label">Minimum severity</p>
        <div className="chips">
          {SEV.map((s) => (
            <button
              key={s}
              className={`chip chip--tag${sev === s ? " is-on" : ""}`}
              aria-pressed={sev === s}
              onClick={() => setSev(s)}
            >
              {s.toLowerCase()}
            </button>
          ))}
        </div>
        <p className="field-label">Protocols (none selected = all)</p>
        <div className="chips">
          {protocols.map((p) => (
            <button
              key={p.slug}
              className={`chip${sel.includes(p.slug) ? " is-on" : ""}`}
              aria-pressed={sel.includes(p.slug)}
              onClick={() => toggle(p.slug)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="form-card__actions">
          <button onClick={create} disabled={!url || busy} className="btn btn--glow btn--sm">
            <span>Create webhook</span>
          </button>
          <button onClick={test} disabled={!created || busy} className="btn btn--ghost btn--sm">
            <span>Test-fire</span>
          </button>
        </div>
        {created && (
          <p className="mono form-card__secret">
            id: <b>{created.id}</b> · secret: <b>{created.secret}</b>
          </p>
        )}
        {out && <p className={`mono form-card__out ${out.ok ? "ok" : "bad"}`}>{out.text}</p>}
      </div>
    </div>
  );
}
