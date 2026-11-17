export const explorer = (kind: "address" | "tx", v: string, network: "mainnet" | "devnet" = "mainnet") =>
  `https://explorer.solana.com/${kind}/${v}${network === "devnet" ? "?cluster=devnet" : ""}`;
export const GRADE_WORD: Record<string, string> = {
  A: "Strong",
  B: "Good",
  C: "Caution",
  D: "Weak",
  F: "Dangerous",
  "?": "Unverified",
};

/** "5m ago", "3h ago", "12d ago"; a dash when there is no time. */
export const ago = (iso: string | null) => {
  if (!iso) return "—";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
