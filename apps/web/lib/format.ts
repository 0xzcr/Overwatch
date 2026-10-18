export const explorer = (kind: "address" | "tx", v: string, network: "mainnet" | "devnet" = "mainnet") =>
  `https://explorer.solana.com/${kind}/${v}${network === "devnet" ? "?cluster=devnet" : ""}`;
export const GRADE_WORD: Record<string, string> = { A: "Strong", B: "Good", C: "Caution", D: "Weak", F: "Dangerous" };
