"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { VaultIx } from "@overwatch/sdk/tx";

interface DemoState {
  ready: boolean;
  demoMode: boolean;
  state?: { mint: string; slug: string };
  risk?: { score: number; grade: string; red: boolean } | null;
  vault?: { idle: string; totalAllocated: string; minScore: number; address: string; shareMint: string } | null;
  position?: { shielded: boolean; allocated: string; address: string } | null;
}
interface Shield {
  tx: string | null;
  at: string;
  slug: string;
}

const devnetTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Phantom, Solflare and Backpack register via Wallet Standard, so no explicit adapters are needed. */
export function Vault(props: { registryId?: string; vaultId?: string; initialShields: Shield[] }) {
  const endpoint = process.env.NEXT_PUBLIC_DEVNET_RPC_URL || "https://api.devnet.solana.com";
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <VaultApp {...props} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function VaultApp({ registryId, vaultId, initialShields }: { registryId?: string; vaultId?: string; initialShields: Shield[] }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [s, setS] = useState<DemoState | null>(null);
  const [offline, setOffline] = useState(false);
  const [bal, setBal] = useState({ tokens: "0", shares: "0" });
  const [amount, setAmount] = useState("100");
  const [msg, setMsg] = useState<{ text: string; sig?: string; err?: boolean } | null>(null);
  const [shields, setShields] = useState(initialShields);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = (await fetch("/api/demo/state").then((r) => r.json())) as DemoState;
      setS(j);
      setOffline(false);
      if (publicKey && j.state && j.vault) {
        const get = async (mint: string) => {
          try {
            const r = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(mint), publicKey));
            return r.value.uiAmountString ?? "0";
          } catch {
            return "0";
          }
        };
        setBal({ tokens: await get(j.state.mint), shares: await get(j.vault.shareMint) });
      }
    } catch {
      setOffline(true);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void load();
    const i = window.setInterval(load, 6000);
    return () => window.clearInterval(i);
  }, [load]);
  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("shield", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { txSignature?: string; slug: string };
      setShields((x) => [{ tx: d.txSignature ?? null, at: new Date().toISOString(), slug: d.slug }, ...x]);
      void load();
    });
    es.addEventListener("rearm", () => void load());
    return () => es.close();
  }, [load]);

  const act = async (kind: "deposit" | "withdraw") => {
    if (!publicKey || !s?.state || !s.vault) return;
    setBusy(true);
    setMsg(null);
    try {
      const mint = new PublicKey(s.state.mint);
      const vix = new VaultIx(mint, vaultId || undefined, registryId || undefined);
      const share = vix.shareMint();
      const ut = getAssociatedTokenAddressSync(mint, publicKey);
      const us = getAssociatedTokenAddressSync(share, publicKey);
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
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true });
    } finally {
      setBusy(false);
    }
  };
  const faucet = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const r = (await fetch("/api/vault/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: publicKey.toBase58() }) }).then((x) =>
        x.json(),
      )) as { ok?: boolean; signature?: string; error?: string };
      setMsg(r.ok ? { text: "1,000 demo USDC sent", sig: r.signature } : { text: r.error ?? "Faucet failed", err: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true });
    }
    setBusy(false);
    void load();
  };

  const notReady = offline || (s && !s.ready);
  const shielded = s?.position?.shielded;
  return (
    <div className="vault">
      {notReady && (
        <p className="notice">
          {offline ? "The vault backend isn't reachable from this deployment." : "The demo vault isn't deployed on this deployment."} Run <b>pnpm demo:setup</b> to deploy the
          devnet mint, vault and position. Until then, the <Link href="/demo">demo console</Link> shows the vault exit in rehearsal.
        </p>
      )}
      <div className="vault__grid">
        <div className="vault__col">
          <div className="vault__wallet">
            <WalletMultiButton />
            <span className="badge badge--violet mono">devnet</span>
          </div>
          <div className="kpis">
            {(
              [
                ["Your demo USDC", bal.tokens],
                ["Your vault shares", bal.shares],
                ["Vault idle", s?.vault?.idle ?? "—"],
                ["Minimum score to stay", s?.vault ? String(s.vault.minScore) : "—"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="kpi">
                <span>{k}</span>
                <b className="mono">{v}</b>
              </div>
            ))}
          </div>
          <div className="form-card">
            <label className="field-label" htmlFor="vault-amount">
              Amount
            </label>
            <input
              id="vault-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="field mono field--lg"
            />
            <div className="form-card__actions">
              <button disabled={!publicKey || busy || !!notReady} onClick={() => act("deposit")} className="btn btn--glow btn--sm">
                <span>Deposit</span>
              </button>
              <button disabled={!publicKey || busy || !!notReady} onClick={() => act("withdraw")} className="btn btn--ghost btn--sm">
                <span>Withdraw shares</span>
              </button>
              <button disabled={!publicKey || busy || !!notReady} onClick={faucet} className="btn btn--ghost btn--sm btn--dashed">
                <span>Faucet: 1,000 demo USDC</span>
              </button>
            </div>
            {!publicKey && <p className="page-note">Connect Phantom, Solflare or Backpack set to devnet.</p>}
            {msg && (
              <p className={`mono form-card__out ${msg.err ? "bad" : "ok"}`}>
                {msg.text}{" "}
                {msg.sig && (
                  <a href={devnetTx(msg.sig)} target="_blank" rel="noreferrer">
                    view tx ↗
                  </a>
                )}
              </p>
            )}
            <p className="page-note">Withdrawals come from idle funds. While a strategy holds funds, only the idle share can leave. Once a shield fires, everything is idle again.</p>
          </div>
        </div>

        <div className="vault__col">
          <div className={`position${shielded ? " is-shielded" : s?.risk?.red ? " is-red" : ""}`} data-tilt>
            <div className="position__top">
              <div>
                <p className="label">Demo strategy (simulated allocation)</p>
                <h3>Overwatch Demo Protocol</h3>
              </div>
              {shielded ? (
                <span className="badge badge--ok mono">shielded</span>
              ) : s?.risk?.red ? (
                <span className="badge badge--bad mono">red: exiting</span>
              ) : (
                <span className="badge badge--dim mono">allocated</span>
              )}
            </div>
            <div className="position__stats mono">
              <div>
                <span>Allocated</span>
                <b>{s?.position ? (Number(s.position.allocated) / 1e6).toLocaleString() : "—"}</b>
              </div>
              <div>
                <span>Registry</span>
                <b className={s?.risk?.red ? "bad" : "ok"}>{s?.risk ? `${s.risk.grade} ${s.risk.score}` : "—"}</b>
              </div>
              <div>
                <span>Exit rule</span>
                <b className="dim">red flags or score &lt; {s?.vault?.minScore ?? 40}</b>
              </div>
            </div>
            <p className="page-note">
              Funds sit in a vault-owned token account, not a real lending protocol. The exit logic is real: <span className="mono">check_and_exit</span> reads the registry&apos;s
              RiskRecord, checks its owner and PDA, and anyone can call it.
            </p>
          </div>
          <div className="log">
            <div className="log__head mono">Shield log</div>
            <ul>
              {shields.length ? (
                shields.map((x, i) => (
                  <li key={i} className="mono">
                    <span className="ok">shield · {x.slug}</span>
                    <time>{new Date(x.at).toISOString().replace("T", " ").slice(0, 19)}</time>
                    {x.tx && (
                      <a href={devnetTx(x.tx)} target="_blank" rel="noreferrer">
                        {x.tx.slice(0, 8)}… ↗
                      </a>
                    )}
                  </li>
                ))
              ) : (
                <li className="mono dim">No shields yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
