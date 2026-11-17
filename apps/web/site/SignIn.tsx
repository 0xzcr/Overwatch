"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signInMessage } from "@overwatch/core/siws";
import { watchWallets, connectWallet, signMessage, toBase64, type StandardWallet } from "./wallet";

/** Sign in with a Solana wallet: fetch a challenge, have the wallet sign it, let the server check the signature. */
export async function signIn(wallet: StandardWallet): Promise<{ wallet: string }> {
  const challenge = await fetch("/api/auth/nonce", { cache: "no-store" }).then((r) => r.json());
  const c = challenge.data as {
    nonce: string;
    issuedAt: string;
    expirationTime: string;
    domain: string;
    token: string;
  };
  const account = await connectWallet(wallet);
  const message = signInMessage({
    domain: c.domain,
    address: account.address,
    uri: window.location.origin,
    nonce: c.nonce,
    issuedAt: c.issuedAt,
    expirationTime: c.expirationTime,
  });
  const signature = await signMessage(wallet, account, message);
  const r = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...c, address: account.address, signature: toBase64(signature) }),
  });
  const j = (await r.json()) as { data?: { wallet: string }; error?: string };
  if (!r.ok || !j.data) throw new Error(j.error ?? `sign-in failed (HTTP ${r.status})`);
  return j.data;
}

/** The installed wallets that can sign in. Updates when a wallet extension finishes loading. */
export function useWallets() {
  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  useEffect(() => watchWallets(setWallets), []);
  return wallets;
}

/** Wallet picker shown where sign-in is needed. Calls `onSignedIn` after the server accepts the signature. */
export function SignInPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const wallets = useWallets();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (wallet: StandardWallet) => {
    setBusy(wallet.name);
    setError(null);
    try {
      await signIn(wallet);
      onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="signin">
      <h2 className="signin__title">Sign in with your wallet</h2>
      <p className="signin__lede">
        Your wallet signs a short message. It is free, sends no transaction and gives Overwatch no access to your funds.
      </p>
      <div className="signin__wallets">
        {wallets.map((w) => (
          <button key={w.name} className="signin__wallet" onClick={() => choose(w)} disabled={!!busy}>
            {/* wallet icons are data: URIs supplied by the wallet itself */}
            <img src={w.icon} alt="" width={28} height={28} />
            <span>{busy === w.name ? "Check your wallet…" : w.name}</span>
          </button>
        ))}
      </div>
      {!wallets.length && (
        <p className="signin__none">
          No Solana wallet found in this browser. Install{" "}
          <a href="https://phantom.com" target="_blank" rel="noreferrer">
            Phantom
          </a>
          ,{" "}
          <a href="https://solflare.com" target="_blank" rel="noreferrer">
            Solflare
          </a>{" "}
          or{" "}
          <a href="https://backpack.app" target="_blank" rel="noreferrer">
            Backpack
          </a>
          , then reload this page.
        </p>
      )}
      {error && (
        <p className="mono bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Nav button: "Sign in" for visitors, the wallet and plan for signed-in accounts. Both lead to the dashboard. */
export function AccountButton() {
  const [me, setMe] = useState<{ wallet: string; plan: { name: string } } | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j: { data: typeof me }) => setMe(j.data ?? null))
      .catch(() => setMe(null));
  }, []);
  return (
    <Link className="btn btn--glow btn--sm" href="/app" data-cursor="Open">
      <span>{me ? `${shortAddress(me.wallet)} · ${me.plan.name}` : "Sign in"}</span>
    </Link>
  );
}
