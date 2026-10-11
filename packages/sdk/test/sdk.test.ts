import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { configPda, riskPda, decodeRiskRecord, protocolIdBytes, RISK_RECORD_DISCRIMINATOR, REGISTRY_PROGRAM_ID, verifyWebhook } from "../src";
import { RegistryIx, VaultIx } from "../src/tx";
import { createHmac } from "node:crypto";

describe("sdk", () => {
  it("PDAs match web3.js", () => {
    const p = new PublicKey(REGISTRY_PROGRAM_ID);
    expect(configPda()).toBe(PublicKey.findProgramAddressSync([Buffer.from("config")], p)[0].toBase58());
    expect(riskPda("drift")).toBe(new RegistryIx().risk("drift").toBase58());
    expect(Buffer.from(protocolIdBytes("drift")).toString("hex")).toBe("0b7a461fefbb68e518e51884369a4b88baffdb40b7e578921f3f88649ebc6494");
  });
  it("decodes a RiskRecord layout", () => {
    const d = new Uint8Array(8 + 32 + 2 + 24 + 32 + 4 + 1);
    d.set(RISK_RECORD_DISCRIMINATOR);
    d[40] = 42; d[41] = 3;
    new DataView(d.buffer).setBigUint64(42, 1n << 10n, true);
    new DataView(d.buffer).setUint32(98, 7, true);
    const r = decodeRiskRecord(d);
    expect([r.score, r.grade, r.flags, r.version, r.red]).toEqual([42, "D", 1n << 10n, 7, true]);
    expect(() => decodeRiskRecord(new Uint8Array(10))).toThrow();
  });
  it("builds upsert data with correct length", () => {
    const k = PublicKey.unique();
    const ix = new RegistryIx().upsertRisk(k, "drift", 50, 2, 3n, 9);
    expect(ix.data.length).toBe(8 + 32 + 2 + 8 + 8);
    expect(new VaultIx(k).checkAndExit(k, "demo").keys).toHaveLength(7);
  });
  it("verifies webhook signatures", async () => {
    const body = '{"a":1}';
    const sig = createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(await verifyWebhook(body, sig, "s3cret")).toBe(true);
    expect(await verifyWebhook(body, sig, "nope")).toBe(false);
  });
});
