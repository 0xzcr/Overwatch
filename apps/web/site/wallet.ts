/**
 * Wallet connection with no wallet library: the Wallet Standard discovery protocol, which Phantom, Solflare,
 * Backpack and other Solana wallets implement. The app announces itself with "wallet-standard:app-ready"; each
 * installed wallet answers by calling register(). Wallets that load later announce themselves with
 * "wallet-standard:register-wallet".
 */

export interface WalletAccount {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
}

export interface StandardWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly WalletAccount[];
  features: Record<string, unknown>;
}

type ConnectFeature = { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> };
type DisconnectFeature = { disconnect: () => Promise<void> };
type SignMessageFeature = {
  signMessage: (input: {
    account: WalletAccount;
    message: Uint8Array;
  }) => Promise<readonly { signature: Uint8Array }[]>;
};
type SignAndSendFeature = {
  signAndSendTransaction: (input: {
    account: WalletAccount;
    transaction: Uint8Array;
    chain: string;
  }) => Promise<readonly { signature: Uint8Array }[]>;
};

/** A wallet can sign in here when it can connect and sign a message. */
const usable = (w: StandardWallet) => "standard:connect" in w.features && "solana:signMessage" in w.features;

/** Calls `onChange` with the usable wallets now and whenever one registers. Returns a cleanup function. */
export function watchWallets(onChange: (wallets: StandardWallet[]) => void): () => void {
  const found = new Map<string, StandardWallet>();
  const publish = () => onChange([...found.values()].filter(usable));
  const register = (...wallets: StandardWallet[]) => {
    wallets.forEach((w) => found.set(w.name, w));
    publish();
    return () => {
      wallets.forEach((w) => found.delete(w.name));
      publish();
    };
  };
  const api = Object.freeze({ register });
  const onRegister = (event: Event) => (event as CustomEvent<(api: { register: typeof register }) => void>).detail(api);
  window.addEventListener("wallet-standard:register-wallet", onRegister);
  // wallets that loaded before us are waiting for this event
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
  publish();
  return () => window.removeEventListener("wallet-standard:register-wallet", onRegister);
}

function feature<T>(wallet: StandardWallet, name: string): T {
  const f = wallet.features[name];
  if (!f) throw new Error(`${wallet.name} does not support ${name}`);
  return f as T;
}

export async function connectWallet(wallet: StandardWallet): Promise<WalletAccount> {
  const { accounts } = await feature<ConnectFeature>(wallet, "standard:connect").connect();
  const account = accounts[0] ?? wallet.accounts[0];
  if (!account) throw new Error(`${wallet.name} did not share an account`);
  return account;
}

export async function disconnectWallet(wallet: StandardWallet) {
  const f = wallet.features["standard:disconnect"] as DisconnectFeature | undefined;
  await f?.disconnect().catch(() => undefined);
}

export async function signMessage(wallet: StandardWallet, account: WalletAccount, text: string): Promise<Uint8Array> {
  const [out] = await feature<SignMessageFeature>(wallet, "solana:signMessage").signMessage({
    account,
    message: new TextEncoder().encode(text),
  });
  if (!out) throw new Error("the wallet returned no signature");
  return out.signature;
}

export const canSendTransactions = (wallet: StandardWallet) => "solana:signAndSendTransaction" in wallet.features;

/** Asks the wallet to sign and send a serialized transaction; returns the transaction signature bytes. */
export async function signAndSend(
  wallet: StandardWallet,
  account: WalletAccount,
  transaction: Uint8Array,
  network: "mainnet" | "devnet",
): Promise<Uint8Array> {
  const [out] = await feature<SignAndSendFeature>(wallet, "solana:signAndSendTransaction").signAndSendTransaction({
    account,
    transaction,
    chain: `solana:${network}`,
  });
  if (!out) throw new Error("the wallet returned no signature");
  return out.signature;
}

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Base58 for a transaction signature, so it can be shown and looked up on an explorer. */
export function toBase58(bytes: Uint8Array): string {
  let value = 0n;
  bytes.forEach((b) => (value = value * 256n + BigInt(b)));
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  const zeros = bytes.findIndex((b) => b !== 0);
  return "1".repeat(zeros === -1 ? bytes.length : zeros) + out;
}
