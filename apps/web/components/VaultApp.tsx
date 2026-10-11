"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { VaultIx } from "@overwatch/sdk/tx";
import { explorer } from "@/lib/format";
import { Badge } from "./ui/Section";

interface S { ready: boolean; demoMode: boolean; state?: { mint: string; slug: string }; risk?: { score: number; grade: string; red: boolean } | null; vault?: { idle: string; totalAllocated: string; minScore: number; address: string; shareMint: string } | null; position?: { shielded: boolean; allocated: string; address: string } | null }
interface Shield { tx: string | null; at: string; slug: string }

export function VaultApp({ registryId, vaultId, initialShields }: { registryId: string; vaultId: string; initialShields: Shield[] }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [s, setS] = useState<S | null>(null);
  const [bal, setBal] = useState<{ tokens: string; shares: string }>({ tokens: "0", shares: "0" });
  const [amount, setAmount] = useState("100");
  const [msg, setMsg] = useState<{ text: string; sig?: string; err?: boolean } | null>(null);
  const [shields, setShields] = useState(initialShields);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j: S = await fetch("/api/demo/state").then((r) => r.json());
    setS(j);
    if (publicKey && j.state && j.vault) {
      const get = async (mint: string) => { try { const r = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(mint), publicKey)); return r.value.uiAmountString ?? "0"; } catch { return "0"; } };
      setBal({ tokens: await get(j.state.mint), shares: await get(j.vault.shareMint) });
    }
  }, [connection, publicKey]);
  useEffect(() => { void load(); const i = setInterval(load, 6000); return () => clearInterval(i); }, [load]);
  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("shield", (e) => { const d = JSON.parse((e as MessageEvent).data); setShields((x) => [{ tx: d.txSignature, at: new Date().toISOString(), slug: d.slug }, ...x]); void load(); });
    es.addEventListener("rearm", () => void load());
    return () => es.close();
  }, [load]);

  const act = async (kind: "deposit" | "withdraw") => {
    if (!publicKey || !s?.state || !s.vault) return;
    setBusy(true); setMsg(null);
    try {
      const mint = new PublicKey(s.state.mint);
      const vix = new VaultIx(mint, vaultId, registryId);
      const share = vix.shareMint();
      const ut = getAssociatedTokenAddressSync(mint, publicKey), us = getAssociatedTokenAddressSync(share, publicKey);
      const units = BigInt(Math.round(Number(amount) * 1e6));
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(publicKey, ut, publicKey, mint),
        createAssociatedTokenAccountIdempotentInstruction(publicKey, us, publicKey, share),
        kind === "deposit" ? vix.deposit(publicKey, ut, us, units) : vix.withdraw(publicKey, ut, us, units),
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ text: `${kind} confirmed`, sig });
      void load();
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); } finally { setBusy(false); }
  };
  const faucet = async () => {
    if (!publicKey) return;
    setBusy(true);
    const r = await fetch("/api/vault/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: publicKey.toBase58() }) }).then((x) => x.json());
    setMsg(r.ok ? { text: "1,000 demo USDC sent", sig: r.signature } : { text: r.error, err: true });
    setBusy(false); void load();
  };

  if (s && !s.ready) return <p className="mono text-sm text-warn">The demo vault isn&apos;t deployed yet. Run <span className="text-ink">pnpm demo:setup</span>.</p>;
  const shielded = s?.position?.shielded;
  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap"><WalletMultiButton /><Badge tone="accent">devnet</Badge></div>
        <div className="grid grid-cols-2 gap-px bg-[var(--line)] border hairline">
          {[["your demo USDC", bal.tokens], ["your vault shares", bal.shares], ["vault idle", s?.vault?.idle ?? "…"], ["min score to stay", s?.vault ? String(s.vault.minScore) : "…"]].map(([k, v]) => (
            <div key={k} className="bg-bg p-4"><p className="label !text-[10px]">{k}</p><p className="mono text-xl mt-1">{v}</p></div>
          ))}
        </div>
        <div className="border hairline p-5 space-y-4">
          <label className="block"><span className="label !text-[10px]">amount</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mt-2 w-full bg-transparent border hairline h-11 px-3 mono text-lg outline-none focus:border-[var(--accent)]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={!publicKey || busy} onClick={() => act("deposit")} className="mono text-xs tracking-[0.15em] uppercase px-5 h-11 bg-accent text-[var(--accent-ink)] disabled:opacity-40">Deposit</button>
            <button disabled={!publicKey || busy} onClick={() => act("withdraw")} className="mono text-xs tracking-[0.15em] uppercase px-5 h-11 border hairline disabled:opacity-40">Withdraw shares</button>
            <button disabled={!publicKey || busy} onClick={faucet} className="mono text-xs tracking-[0.15em] uppercase px-5 h-11 border border-dashed hairline text-chrome disabled:opacity-40">Faucet: 1,000 demo USDC</button>
          </div>
          {!publicKey && <p className="text-xs text-dim">Connect Phantom, Solflare or Backpack set to devnet.</p>}
          {msg && <p className={`mono text-xs ${msg.err ? "text-bad" : "text-ok"}`}>{msg.text} {msg.sig && <a href={explorer("tx", msg.sig, "devnet")} target="_blank" rel="noreferrer" className="underline">view tx ↗</a>}</p>}
          <p className="text-xs text-dim">Withdrawals come from idle funds. While a strategy holds funds, only the idle share can leave. Once a shield fires, everything is idle again.</p>
        </div>
      </div>
      <div className="space-y-6">
        <div className={`border p-6 ${shielded ? "border-[var(--ok)]" : s?.risk?.red ? "border-[var(--bad)]" : "hairline"}`}>
          <div className="flex justify-between items-start">
            <div><p className="label">Demo strategy (simulated allocation)</p><p className="text-2xl mt-2">Overwatch Demo Protocol</p></div>
            {shielded ? <Badge tone="ok">shielded</Badge> : s?.risk?.red ? <Badge tone="bad">red: exiting</Badge> : <Badge tone="dim">allocated</Badge>}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 mono text-sm">
            <div><p className="label !text-[10px]">allocated</p><p>{s?.position ? (Number(s.position.allocated) / 1e6).toLocaleString() : "…"}</p></div>
            <div><p className="label !text-[10px]">registry</p><p className={s?.risk?.red ? "text-bad" : "text-ok"}>{s?.risk ? `${s.risk.grade} ${s.risk.score}` : "…"}</p></div>
            <div><p className="label !text-[10px]">rule</p><p className="text-chrome text-xs">red flags or score &lt; {s?.vault?.minScore ?? 40}</p></div>
          </div>
          <p className="text-xs text-dim mt-5">This is a simulated allocation: funds sit in a vault-owned token account, not a real lending protocol. The exit logic is real. <span className="mono">check_and_exit</span> reads the registry&apos;s RiskRecord, checks its owner and PDA, and anyone can call it.</p>
        </div>
        <div className="border hairline">
          <div className="px-4 py-2 border-b hairline label !text-[10px]">ShieldTriggered log</div>
          <ul className="p-4 space-y-2 max-h-72 overflow-y-auto">
            {shields.length ? shields.map((x, i) => <li key={i} className="mono text-xs flex justify-between gap-3"><span className="text-ok">shield · {x.slug}</span><span className="text-dim">{new Date(x.at).toISOString().replace("T", " ").slice(0, 19)}</span>{x.tx && <a href={explorer("tx", x.tx, "devnet")} target="_blank" rel="noreferrer" className="text-chrome hover:text-accent">{x.tx.slice(0, 8)}… ↗</a>}</li>) : <li className="mono text-xs text-dim">No shields yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
