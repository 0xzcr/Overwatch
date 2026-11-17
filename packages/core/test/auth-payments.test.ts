import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import {
  checkPayment,
  signInMessage,
  verifyWalletSignature,
  usdcToBaseUnits,
  baseUnitsToUsdc,
  isAddress,
  type PaymentTx,
} from "../src";

describe("wallet sign-in", () => {
  const secret = ed25519.utils.randomPrivateKey();
  const address = bs58.encode(ed25519.getPublicKey(secret));
  const fields = {
    domain: "overwatch1.xyz",
    address,
    uri: "https://overwatch1.xyz",
    nonce: "abc123",
    issuedAt: "2026-11-17T00:00:00.000Z",
    expirationTime: "2026-11-17T00:10:00.000Z",
  };
  const message = signInMessage(fields);
  const signature = ed25519.sign(new TextEncoder().encode(message), secret);

  it("accepts the owner's signature", () => {
    expect(verifyWalletSignature(address, message, signature)).toBe(true);
    expect(message.split("\n")[0]).toBe("overwatch1.xyz wants you to sign in with your Solana account:");
  });
  it("rejects a changed message, another address, or junk", () => {
    expect(verifyWalletSignature(address, signInMessage({ ...fields, nonce: "other" }), signature)).toBe(false);
    const other = bs58.encode(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    expect(verifyWalletSignature(other, message, signature)).toBe(false);
    expect(verifyWalletSignature("not-an-address", message, signature)).toBe(false);
    expect(verifyWalletSignature(address, message, new Uint8Array(10))).toBe(false);
  });
  it("validates addresses", () => {
    expect(isAddress(address)).toBe(true);
    expect(isAddress("0x1234")).toBe(false);
  });
});

describe("USDC payment check", () => {
  const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const TREASURY = "Treasury1111111111111111111111111111111111";
  const REF = "Ref11111111111111111111111111111111111111111";
  const bal = (amount: string, owner = TREASURY, mint = MINT) => ({
    accountIndex: 1,
    mint,
    owner,
    uiTokenAmount: { amount, decimals: 6 },
  });
  const tx = (o: Partial<PaymentTx["meta"]> & { blockTime?: number; keys?: string[] } = {}): PaymentTx => ({
    blockTime: o.blockTime ?? Date.parse("2026-11-17T01:00:00Z") / 1000,
    meta: { err: null, preTokenBalances: [bal("5000000")], postTokenBalances: [bal("24000137")], ...o },
    transaction: { signatures: ["sig"], message: { accountKeys: o.keys ?? ["Payer", "x", REF] } },
  });
  const expect19 = {
    mint: MINT,
    treasury: TREASURY,
    amount: 19_000_137n,
    notBefore: new Date("2026-11-17T00:00:00Z"),
    reference: REF,
  };

  it("accepts an exact payment with the reference", () => {
    expect(checkPayment(tx(), expect19)).toEqual({ ok: true, payer: "Payer", received: 19_000_137n });
  });
  it("rejects failed, old, short, wrong-mint and reference-less transactions", () => {
    expect(checkPayment(tx({ err: { InstructionError: [0, "x"] } }), expect19).ok).toBe(false);
    expect(checkPayment(tx({ blockTime: Date.parse("2026-11-16T00:00:00Z") / 1000 }), expect19).ok).toBe(false);
    expect(checkPayment(tx({ postTokenBalances: [bal("24000000")] }), expect19).ok).toBe(false);
    expect(checkPayment(tx({ postTokenBalances: [bal("24000137", TREASURY, "OtherMint")] }), expect19).ok).toBe(false);
    expect(checkPayment(tx({ keys: ["Payer", "x"] }), expect19).ok).toBe(false);
    expect(checkPayment(null, expect19).ok).toBe(false);
  });
  it("a paste-in signature without a reference matches on the exact amount", () => {
    expect(checkPayment(tx({ keys: ["Payer"] }), { ...expect19, reference: undefined }).ok).toBe(true);
  });
  it("converts amounts exactly", () => {
    expect(usdcToBaseUnits("19.000137")).toBe(19_000_137n);
    expect(usdcToBaseUnits("190")).toBe(190_000_000n);
    expect(baseUnitsToUsdc(19_000_137n)).toBe("19.000137");
    expect(() => usdcToBaseUnits("1.0000001")).toThrow();
  });
});
