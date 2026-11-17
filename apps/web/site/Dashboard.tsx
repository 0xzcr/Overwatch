"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PLANS, priceUsd, type BillingPeriod, type PlanId } from "@overwatch/core/plans";
import { SignInPanel, useWallets, shortAddress } from "./SignIn";
import { connectWallet, signAndSend, canSendTransactions, fromBase64, toBase58 } from "./wallet";

// ───────────────────────────── data shapes (from /api/account) ─────────────────────────────

interface Plan {
  id: PlanId;
  name: string;
  minSeverity: string;
  webhooks: number;
  apiKeys: number;
  privateWatches: number;
  expiresAt: string | null;
}
interface Channel {
  id: number;
  channel: string;
  target: string;
  minSeverity: string;
  confirmed: boolean;
}
interface Invoice {
  id: number;
  plan: string;
  months: number;
  amount: string;
  status: string;
  network: string;
  txSignature: string | null;
  solanaPay?: string;
}
interface AccountView {
  wallet: string;
  plan: Plan;
  watchlist: string[];
  channels: Channel[];
  keys: { id: number; prefix: string | null; revoked: boolean; createdAt: string }[];
  invoices: Invoice[];
  deliveries: {
    id: number;
    channel: string;
    title: string;
    severity: string;
    status: string;
    lastError: string | null;
  }[];
  watches: { id: number; slug: string; name: string; verified: boolean }[];
}

export interface DashboardProtocol {
  slug: string;
  name: string;
  grade: string | null;
  red: boolean;
}

type Note = { text: string; ok: boolean } | null;

/** fetch wrapper for the account API: JSON in, `{ data }` or `{ error }` out, never throws. */
async function api<T>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<{ data?: T; error?: string; status: number }> {
  try {
    const r = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as { data?: T; error?: string };
    return { ...j, status: r.status };
  } catch (e) {
    return { error: (e as Error).message, status: 0 };
  }
}

const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const allowedSeverities = (min: string) => SEVERITIES.slice(SEVERITIES.indexOf(min));

// ───────────────────────────── the dashboard ─────────────────────────────

export function Dashboard({
  protocols,
  billing,
  bot,
  emailEnabled,
}: {
  protocols: DashboardProtocol[];
  billing: { network: string } | null;
  bot: boolean;
  emailEnabled: boolean;
}) {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [note, setNote] = useState<Note>(null);

  const load = useCallback(async () => {
    const r = await api<AccountView>("/api/account");
    setAccount(r.status === 401 ? null : (r.data ?? null));
    if (r.error && r.status !== 401) setNote({ text: r.error, ok: false });
  }, []);
  useEffect(() => void load(), [load]);

  // the email confirmation link lands back here with ?email=confirmed|invalid
  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get("email");
    if (state === "confirmed") setNote({ text: "Email confirmed. Alerts will reach your inbox.", ok: true });
    if (state === "invalid") setNote({ text: "That confirmation link is invalid or was already used.", ok: false });
  }, []);

  if (account === undefined) return <p className="mono dim">Loading your account…</p>;
  if (account === null) return <SignInPanel onSignedIn={load} />;

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} });
    setAccount(null);
  };

  return (
    <div className="acct">
      <header className="acct__head">
        <div>
          <p className="mono dim">Signed in as</p>
          <p className="acct__wallet mono">{shortAddress(account.wallet)}</p>
        </div>
        <div className="acct__plan">
          <span className={`badge${account.plan.id === "free" ? "" : " badge--ok"}`}>{account.plan.name}</span>
          {account.plan.expiresAt && (
            <span className="mono dim"> until {new Date(account.plan.expiresAt).toLocaleDateString()}</span>
          )}
        </div>
        <button className="btn btn--ghost btn--sm" onClick={signOut}>
          <span>Sign out</span>
        </button>
      </header>
      {note && (
        <p className={`mono acct__note ${note.ok ? "ok" : "bad"}`} role="status">
          {note.text}
        </p>
      )}
      <Watchlist account={account} protocols={protocols} onChange={setAccount} notify={setNote} />
      <Channels account={account} bot={bot} emailEnabled={emailEnabled} reload={load} notify={setNote} />
      <PrivateWatches account={account} reload={load} notify={setNote} />
      <ApiKeys account={account} reload={load} notify={setNote} />
      <Billing account={account} billing={billing} reload={load} notify={setNote} />
      <Deliveries account={account} />
    </div>
  );
}

interface SectionProps {
  account: AccountView;
  reload: () => Promise<void>;
  notify: (n: Note) => void;
}

// ───────────────────────────── watchlist ─────────────────────────────

function Watchlist({
  account,
  protocols,
  onChange,
  notify,
}: {
  account: AccountView;
  protocols: DashboardProtocol[];
  onChange: (a: AccountView) => void;
  notify: (n: Note) => void;
}) {
  const [picked, setPicked] = useState<string[]>(account.watchlist);
  const dirty = picked.join() !== account.watchlist.join();
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  const save = async () => {
    const r = await api<AccountView>("/api/account", { method: "PATCH", body: { watchlist: picked } });
    if (r.data) {
      onChange(r.data);
      notify({ text: "Watchlist saved.", ok: true });
    } else notify({ text: r.error ?? "Could not save.", ok: false });
  };
  const watched = protocols.filter((p) => account.watchlist.includes(p.slug));
  return (
    <section className="acct__section">
      <h2 className="acct__h">Watchlist</h2>
      <p className="dim">
        Your alerts follow this list. Leave it empty to hear about every protocol.{" "}
        {watched.filter((p) => p.red).length > 0 && (
          <b className="bad">{watched.filter((p) => p.red).length} of your protocols are red.</b>
        )}
      </p>
      <div className="chips">
        {protocols.map((p) => (
          <button
            key={p.slug}
            className={`chip${picked.includes(p.slug) ? " is-on" : ""}`}
            aria-pressed={picked.includes(p.slug)}
            onClick={() => toggle(p.slug)}
          >
            {p.name} <span className={`mono ${p.red ? "bad" : "dim"}`}>{p.grade ?? "–"}</span>
          </button>
        ))}
      </div>
      <div className="acct__actions">
        <button className="btn btn--glow btn--sm" onClick={save} disabled={!dirty}>
          <span>Save watchlist</span>
        </button>
      </div>
    </section>
  );
}

// ───────────────────────────── alert channels ─────────────────────────────

function Channels({
  account,
  bot,
  emailEnabled,
  reload,
  notify,
}: SectionProps & { bot: boolean; emailEnabled: boolean }) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [severity, setSeverity] = useState(account.plan.minSeverity === "HIGH" ? "HIGH" : "MEDIUM");
  const [secret, setSecret] = useState<string | null>(null);
  const plan = account.plan;
  const webhooks = account.channels.filter((c) => c.channel === "webhook");

  const add = async (body: Record<string, string>) => {
    const r = await api<{ id: number; secret?: string; next?: string }>("/api/account/channels", {
      method: "POST",
      body: { ...body, minSeverity: severity },
    });
    if (!r.data) return notify({ text: r.error ?? "Could not add the channel.", ok: false });
    if (r.data.secret) setSecret(r.data.secret);
    notify({ text: r.data.next ?? "Channel added.", ok: true });
    setUrl("");
    setEmail("");
    await reload();
  };
  const connectTelegram = async () => {
    const r = await api<{ url: string }>("/api/account/telegram", { method: "POST", body: {} });
    if (r.data) window.open(r.data.url, "_blank", "noopener");
    else notify({ text: r.error ?? "Telegram is not available.", ok: false });
  };
  const test = async (id: number) => {
    const r = await api<{ delivered: boolean; status?: number; error?: string }>(`/api/account/channels/${id}/test`, {
      method: "POST",
      body: {},
    });
    notify(
      r.data?.delivered
        ? { text: `Test delivered (HTTP ${r.data.status}).`, ok: true }
        : { text: `Test failed: ${r.data?.error ?? r.error ?? `HTTP ${r.data?.status}`}`, ok: false },
    );
  };
  const remove = async (id: number) => {
    const r = await api(`/api/account/channels/${id}`, { method: "DELETE" });
    if (r.error) notify({ text: r.error, ok: false });
    await reload();
  };

  return (
    <section className="acct__section">
      <h2 className="acct__h">Alert channels</h2>
      <p className="dim">
        Your plan delivers {plan.minSeverity} and above. HIGH and CRITICAL alerts are free on every plan.
      </p>
      <div className="acct__grid">
        <div className="acct__card">
          <h3>Telegram</h3>
          <p className="dim">Opens the bot with a one-time code that links this chat to your account.</p>
          <button className="btn btn--ghost btn--sm" onClick={connectTelegram} disabled={!bot}>
            <span>{bot ? "Connect Telegram" : "Bot not configured here"}</span>
          </button>
        </div>
        <div className="acct__card">
          <h3>Email</h3>
          <div className="field-row">
            <input
              className="field"
              type="email"
              placeholder="you@example.com"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => add({ channel: "email", email })}
              disabled={!email || !emailEnabled}
            >
              <span>Add</span>
            </button>
          </div>
          {!emailEnabled && <p className="mono dim">Email delivery is not configured on this deployment.</p>}
        </div>
        <div className="acct__card">
          <h3>
            Webhook{" "}
            <span className="mono dim">
              {webhooks.length}/{plan.webhooks}
            </span>
          </h3>
          <div className="field-row">
            <input
              className="field mono"
              placeholder="https://your-server.example/overwatch"
              aria-label="Webhook URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => add({ channel: "webhook", url })}
              disabled={!url || webhooks.length >= plan.webhooks}
            >
              <span>Add</span>
            </button>
          </div>
          {plan.webhooks === 0 && <p className="mono dim">Webhooks come with Pro and Team.</p>}
        </div>
      </div>
      <p className="field-label">Minimum severity for new channels</p>
      <div className="chips">
        {allowedSeverities(plan.minSeverity).map((s) => (
          <button
            key={s}
            className={`chip chip--tag${severity === s ? " is-on" : ""}`}
            aria-pressed={severity === s}
            onClick={() => setSeverity(s)}
          >
            {s.toLowerCase()}
          </button>
        ))}
      </div>
      {secret && (
        <p className="mono acct__secret">
          Signing secret (shown once, copy it now): <b>{secret}</b>
          <br />
          Verify each request: HMAC-SHA256 of the raw body with this secret, hex, equals the{" "}
          <span>x-overwatch-signature</span> header.
        </p>
      )}
      {account.channels.length > 0 && (
        <table className="acct__table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Target</th>
              <th>From</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {account.channels.map((c) => (
              <tr key={c.id}>
                <td>{c.channel}</td>
                <td className="mono">{c.target}</td>
                <td className="mono">{c.minSeverity}</td>
                <td>{c.confirmed ? "active" : "waiting for email confirmation"}</td>
                <td className="acct__row-actions">
                  {c.channel === "webhook" && (
                    <button className="btn btn--ghost btn--sm" onClick={() => test(c.id)}>
                      <span>Test</span>
                    </button>
                  )}
                  <button className="btn btn--ghost btn--sm" onClick={() => remove(c.id)}>
                    <span>Remove</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ───────────────────────────── private watches ─────────────────────────────

const CATEGORIES = ["lending", "perps", "dex", "lst", "restaking", "aggregator", "yield", "oracle", "bridge", "infra"];

function PrivateWatches({ account, reload, notify }: SectionProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("lending");
  const [programs, setPrograms] = useState("");
  const [multisig, setMultisig] = useState("");
  const [busy, setBusy] = useState(false);
  const limit = account.plan.privateWatches;

  const create = async () => {
    setBusy(true);
    const ids = programs.split(/[\s,]+/).filter(Boolean);
    const r = await api<{ grade: string; red: boolean }>("/api/account/watches", {
      method: "POST",
      body: { name, category, programs: ids, ...(multisig ? { multisig } : {}) },
    });
    setBusy(false);
    if (!r.data) return notify({ text: r.error ?? "Could not add the watch.", ok: false });
    notify({ text: `Watching ${name}: graded ${r.data.grade}${r.data.red ? " (red)" : ""}.`, ok: !r.data.red });
    setName("");
    setPrograms("");
    setMultisig("");
    await reload();
  };
  const remove = async (id: number) => {
    await api(`/api/account/watches/${id}`, { method: "DELETE" });
    await reload();
  };

  return (
    <section className="acct__section">
      <h2 className="acct__h">
        Private watches{" "}
        <span className="mono dim">
          {account.watches.length}/{limit}
        </span>
      </h2>
      <p className="dim">
        For protocol teams: watch your own programs and multisig before anyone else does. Graded and alerted like a
        public protocol, visible only to you.
      </p>
      {account.watches.length > 0 && (
        <ul className="acct__list">
          {account.watches.map((w) => (
            <li key={w.id}>
              <Link href={`/app/watch/${w.slug}`}>{w.name}</Link>
              <button className="btn btn--ghost btn--sm" onClick={() => remove(w.id)}>
                <span>Stop watching</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {limit > account.watches.length ? (
        <div className="acct__form">
          <input
            className="field"
            placeholder="Name (e.g. My Protocol)"
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="field"
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            className="field mono"
            placeholder="Program IDs (comma or space separated)"
            aria-label="Program IDs"
            value={programs}
            onChange={(e) => setPrograms(e.target.value)}
          />
          <input
            className="field mono"
            placeholder="Squads multisig address (optional)"
            aria-label="Squads multisig address"
            value={multisig}
            onChange={(e) => setMultisig(e.target.value)}
          />
          <button className="btn btn--glow btn--sm" onClick={create} disabled={busy || !name || !programs}>
            <span>{busy ? "Reading the chain…" : "Start watching"}</span>
          </button>
        </div>
      ) : (
        limit === 0 && <p className="mono dim">Private watches come with Pro (1) and Team (10).</p>
      )}
    </section>
  );
}

// ───────────────────────────── API keys ─────────────────────────────

function ApiKeys({ account, reload, notify }: SectionProps) {
  const [fresh, setFresh] = useState<string | null>(null);
  const live = account.keys.filter((k) => !k.revoked);
  const create = async () => {
    const r = await api<{ key: string }>("/api/account/keys", { method: "POST", body: {} });
    if (!r.data) return notify({ text: r.error ?? "Could not create a key.", ok: false });
    setFresh(r.data.key);
    await reload();
  };
  const revoke = async (id: number) => {
    await api(`/api/account/keys/${id}`, { method: "DELETE" });
    await reload();
  };
  return (
    <section className="acct__section">
      <h2 className="acct__h">
        API keys{" "}
        <span className="mono dim">
          {live.length}/{account.plan.apiKeys}
        </span>
      </h2>
      <p className="dim">
        Send the key in the <span className="mono">x-api-key</span> header. See the{" "}
        <Link href="/docs/api">API reference</Link>.
      </p>
      {fresh && (
        <p className="mono acct__secret">
          New key (shown once, copy it now): <b>{fresh}</b>
        </p>
      )}
      {live.length > 0 && (
        <ul className="acct__list">
          {live.map((k) => (
            <li key={k.id}>
              <span className="mono">{k.prefix}…</span>
              <button className="btn btn--ghost btn--sm" onClick={() => revoke(k.id)}>
                <span>Revoke</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn--ghost btn--sm" onClick={create} disabled={live.length >= account.plan.apiKeys}>
        <span>{account.plan.apiKeys ? "Create a key" : "API keys come with Pro and Team"}</span>
      </button>
    </section>
  );
}

// ───────────────────────────── billing (USDC on Solana) ─────────────────────────────

function Billing({ account, billing, reload, notify }: SectionProps & { billing: { network: string } | null }) {
  const wallets = useWallets();
  const [months, setMonths] = useState<BillingPeriod>(1);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const create = async (plan: PlanId) => {
    setBusy("invoice");
    const r = await api<Invoice>("/api/billing/invoices", { method: "POST", body: { plan, months } });
    setBusy(null);
    if (r.data) setInvoice(r.data);
    else notify({ text: r.error ?? "Could not create an invoice.", ok: false });
  };

  /** Polls the payment check until the transaction is confirmed (a few seconds) or we give up. */
  const confirm = async (id: number, sig?: string) => {
    setBusy("checking");
    const tries = Array.from({ length: 20 }, (_, i) => i);
    for (const attempt of tries) {
      const r = await api<{ paid?: boolean; invoice: Invoice }>(`/api/billing/invoices/${id}/check`, {
        method: "POST",
        body: sig ? { signature: sig } : {},
      });
      if (r.data?.paid || r.data?.invoice.status === "paid") {
        setBusy(null);
        setInvoice(null);
        notify({ text: "Payment received. Your plan is active.", ok: true });
        return reload();
      }
      // a not-yet-confirmed transaction reads as "not found"; anything else is a real answer
      const pending = !r.error || r.error.includes("not found") || r.error.includes("no status");
      if (!pending || attempt === tries.length - 1) {
        setBusy(null);
        return notify({ text: r.error ?? "No payment seen yet. Try checking again in a minute.", ok: false });
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  const payWithWallet = async () => {
    if (!invoice) return;
    const wallet = wallets.find(canSendTransactions);
    if (!wallet) return notify({ text: "No wallet here can send transactions; use the Solana Pay link.", ok: false });
    setBusy("wallet");
    try {
      const built = await api<{ transaction: string; network: "mainnet" | "devnet" }>(
        `/api/billing/invoices/${invoice.id}/transaction`,
        { method: "POST", body: {} },
      );
      if (!built.data) throw new Error(built.error ?? "could not build the payment");
      const walletAccount = await connectWallet(wallet);
      if (walletAccount.address !== account.wallet)
        throw new Error(`switch your wallet to ${shortAddress(account.wallet)}, the account you signed in with`);
      const sig = await signAndSend(wallet, walletAccount, fromBase64(built.data.transaction), built.data.network);
      await confirm(invoice.id, toBase58(sig));
    } catch (e) {
      setBusy(null);
      notify({ text: (e as Error).message, ok: false });
    }
  };

  if (!billing)
    return (
      <section className="acct__section">
        <h2 className="acct__h">Plan</h2>
        <p className="dim">Payments are not configured on this deployment.</p>
      </section>
    );

  return (
    <section className="acct__section" id="billing">
      <h2 className="acct__h">Plan and billing</h2>
      <p className="dim">
        Pay in USDC on Solana{billing.network === "devnet" ? " (devnet: test USDC from faucet.circle.com)" : ""}. Paying
        again for the plan you have extends it. 12 months costs 10.
      </p>
      <div className="chips">
        {([1, 3, 12] as BillingPeriod[]).map((m) => (
          <button
            key={m}
            className={`chip chip--tag${months === m ? " is-on" : ""}`}
            aria-pressed={months === m}
            onClick={() => setMonths(m)}
          >
            {m === 1 ? "1 month" : `${m} months`}
          </button>
        ))}
      </div>
      <div className="acct__grid">
        {(["pro", "team"] as PlanId[]).map((id) => (
          <div key={id} className="acct__card">
            <h3>
              {PLANS[id].name} <span className="mono">{priceUsd(id, months)} USDC</span>
            </h3>
            <p className="dim">{PLANS[id].audience}</p>
            <button className="btn btn--glow btn--sm" onClick={() => create(id)} disabled={!!busy}>
              <span>{account.plan.id === id ? "Extend" : `Get ${PLANS[id].name}`}</span>
            </button>
          </div>
        ))}
      </div>
      {invoice && (
        <div className="acct__invoice">
          <p>
            Invoice #{invoice.id}: send exactly <b className="mono">{invoice.amount} USDC</b> on {invoice.network}. The
            odd last digits identify your payment.
          </p>
          <div className="acct__actions">
            <button className="btn btn--glow btn--sm" onClick={payWithWallet} disabled={!!busy}>
              <span>
                {busy === "wallet"
                  ? "Approve in your wallet…"
                  : busy === "checking"
                    ? "Confirming…"
                    : "Pay with wallet"}
              </span>
            </button>
            {invoice.solanaPay && (
              <a className="btn btn--ghost btn--sm" href={invoice.solanaPay}>
                <span>Open in a Solana Pay wallet</span>
              </a>
            )}
          </div>
          <p className="field-label">Paid from an exchange or another wallet? Paste the transaction signature.</p>
          <div className="field-row">
            <input
              className="field mono"
              placeholder="Transaction signature"
              aria-label="Transaction signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value.trim())}
            />
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => confirm(invoice.id, signature)}
              disabled={!signature || !!busy}
            >
              <span>Check</span>
            </button>
          </div>
        </div>
      )}
      {account.invoices.length > 0 && (
        <table className="acct__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {account.invoices.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.id}</td>
                <td>
                  {i.plan} · {i.months} mo
                </td>
                <td className="mono">{i.amount}</td>
                <td>{i.status}</td>
                <td>
                  {i.txSignature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${i.txSignature}${i.network === "devnet" ? "?cluster=devnet" : ""}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      receipt
                    </a>
                  ) : (
                    i.status === "open" && (
                      <button className="btn btn--ghost btn--sm" onClick={() => confirm(i.id)} disabled={!!busy}>
                        <span>Check payment</span>
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ───────────────────────────── delivery log ─────────────────────────────

function Deliveries({ account }: { account: AccountView }) {
  return (
    <section className="acct__section">
      <h2 className="acct__h">Recent deliveries</h2>
      {account.deliveries.length ? (
        <table className="acct__table">
          <thead>
            <tr>
              <th>Alert</th>
              <th>Channel</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {account.deliveries.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="mono dim">{d.severity}</span> {d.title}
                </td>
                <td>{d.channel}</td>
                <td className={d.status === "failed" ? "bad" : undefined}>
                  {d.status}
                  {d.lastError ? ` · ${d.lastError}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dim">No alerts delivered yet. They appear here as they go out.</p>
      )}
    </section>
  );
}
