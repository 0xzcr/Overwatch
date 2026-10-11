export const explorer = (kind: "address" | "tx", v: string, network: "mainnet" | "devnet" = "mainnet") =>
  `https://explorer.solana.com/${kind}/${v}${network === "devnet" ? "?cluster=devnet" : ""}`;
export const solscan = (kind: "account" | "tx", v: string, network: "mainnet" | "devnet" = "mainnet") =>
  `https://solscan.io/${kind}/${v}${network === "devnet" ? "?cluster=devnet" : ""}`;
export const usd = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
export const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return `${Math.max(0, Math.round(s))}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
export const SEV_COLOR: Record<string, string> = { CRITICAL: "var(--bad)", HIGH: "var(--warn)", MEDIUM: "var(--info)", LOW: "var(--chrome)", INFO: "var(--ok)" };
export const GRADE_META: Record<string, { color: string; label: string }> = {
  A: { color: "var(--ok)", label: "Strong" }, B: { color: "var(--ok)", label: "Good" }, C: { color: "var(--warn)", label: "Caution" },
  D: { color: "var(--bad)", label: "Weak" }, F: { color: "var(--bad)", label: "Dangerous" },
};
