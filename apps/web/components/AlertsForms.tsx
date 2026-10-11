"use client";
import { useState } from "react";

const SEV = ["MEDIUM", "HIGH", "CRITICAL"];

export function AlertsForms({ protocols, preselect, bot, emailEnabled }: { protocols: { slug: string; name: string }[]; preselect?: string; bot?: string; emailEnabled: boolean }) {
  const [url, setUrl] = useState("");
  const [sev, setSev] = useState("HIGH");
  const [sel, setSel] = useState<string[]>(preselect ? [preselect] : []);
  const [created, setCreated] = useState<{ id: number; secret: string } | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const toggle = (s: string) => setSel((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  const create = async () => {
    setOut(null);
    const r = await fetch("/api/v1/subscriptions/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, min_severity: sev, protocols: sel.length ? sel : undefined }) }).then((x) => x.json());
    if (r.error) setOut(`✘ ${r.error}`); else { setCreated({ id: r.data.id, secret: r.data.secret }); setOut("webhook created. Copy the secret now; it won't be shown again."); }
  };
  const test = async () => {
    if (!created) return;
    const r = await fetch("/api/v1/subscriptions/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(created) }).then((x) => x.json());
    setOut(r.data?.delivered ? `✔ test delivered (HTTP ${r.data.status})` : `✘ test failed: ${r.data?.error ?? `HTTP ${r.data?.status}`}`);
  };
  const subEmail = async () => {
    const r = await fetch("/api/v1/subscriptions/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, min_severity: sev, protocols: sel.length ? sel : undefined }) }).then((x) => x.json());
    setOut(r.error ? `✘ ${r.error}` : "✔ email subscription saved");
  };

  return (
    <div className="space-y-10">
      <div className="grid md:grid-cols-3 gap-px bg-[var(--line)] border hairline">
        <div className="bg-bg p-6">
          <p className="label">01 · telegram</p>
          <p className="text-chrome text-sm mt-3 mb-5">Open the bot and send <span className="mono">/watch drift</span>, <span className="mono">/list</span>, <span className="mono">/status kamino-lend</span>.</p>
          {bot ? <a href={`https://t.me/${bot}${preselect ? `?start=watch_${preselect}` : ""}`} className="mono text-xs tracking-[0.15em] uppercase px-4 py-3 bg-accent text-[var(--accent-ink)] inline-block">Open @{bot}</a> : <p className="mono text-xs text-warn">coming soon: bot token not configured</p>}
        </div>
        <div className="bg-bg p-6">
          <p className="label">02 · webhook</p>
          <p className="text-chrome text-sm mt-3">Signed with HMAC-SHA256 in <span className="mono">x-overwatch-signature</span>. Failed deliveries retry up to 6 times with exponential backoff.</p>
        </div>
        <div className="bg-bg p-6">
          <p className="label">03 · email</p>
          {emailEnabled ? <div className="flex gap-2 mt-4"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="flex-1 bg-transparent border hairline h-10 px-3 text-sm outline-none" /><button onClick={subEmail} className="mono text-xs px-3 border hairline">save</button></div> : <p className="mono text-xs text-warn mt-3">coming soon</p>}
        </div>
      </div>

      <div className="border hairline p-6 space-y-5 max-w-3xl">
        <p className="label">create a webhook</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.example/overwatch" aria-label="Webhook URL" className="w-full bg-transparent border hairline h-11 px-3 mono text-sm outline-none focus:border-[var(--accent)]" />
        <div className="flex flex-wrap gap-2 items-center"><span className="label !text-[10px] mr-2">min severity</span>{SEV.map((s) => <button key={s} onClick={() => setSev(s)} className={`mono text-[11px] px-2.5 h-8 border ${sev === s ? "border-[var(--accent)] text-accent" : "hairline text-dim"}`}>{s.toLowerCase()}</button>)}</div>
        <div><span className="label !text-[10px]">protocols (none selected = all)</span>
          <div className="flex flex-wrap gap-1.5 mt-2">{protocols.map((p) => <button key={p.slug} onClick={() => toggle(p.slug)} className={`mono text-[11px] px-2 h-7 border ${sel.includes(p.slug) ? "border-[var(--accent)] text-accent" : "hairline text-dim hover:text-ink"}`}>{p.name}</button>)}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={create} disabled={!url} className="mono text-xs tracking-[0.15em] uppercase px-5 h-11 bg-accent text-[var(--accent-ink)] disabled:opacity-40">Create webhook</button>
          <button onClick={test} disabled={!created} className="mono text-xs tracking-[0.15em] uppercase px-5 h-11 border hairline disabled:opacity-40">Test-fire</button>
        </div>
        {created && <p className="mono text-xs break-all">secret: <span className="text-accent">{created.secret}</span></p>}
        {out && <p className={`mono text-xs ${out.startsWith("✘") ? "text-bad" : "text-ok"}`}>{out}</p>}
      </div>
    </div>
  );
}
