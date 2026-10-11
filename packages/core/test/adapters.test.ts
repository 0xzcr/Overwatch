import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adapters, decodePrefix, type IdlTypeDef, sizeOf, accountDiscriminator, isOnCurve, findVaultIndex, DRIFT_STATE, KAMINO_LENDING_MARKET, MARGINFI_GROUP, ORCA_WHIRLPOOLS_CONFIG, diffSnapshots } from "../src";
import { fixture } from "./fixtures";
import { snap, ctx } from "./helpers";

const idl = (n: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/idl/${n}.json`, import.meta.url), "utf8"));
const idlFields = (n: string, acct: string) => {
  const j = idl(n);
  const t = [...(j.types ?? []), ...(j.accounts ?? [])].find((x: { name: string; type?: unknown }) => x.name === acct && x.type);
  return (t.type.fields as { name: string; type: unknown }[]).map((f) => ({ name: f.name, type: f.type }));
};
const enc = (name: string) => { const f = fixture(name); return { address: f.address, owner: f.owner, data: f.data }; };

describe("IDL-driven admin adapters (real mainnet accounts)", () => {
  it("embedded specs equal the onchain IDL field prefix", () => {
    expect(idlFields("drift", "State").slice(0, DRIFT_STATE.length)).toEqual(DRIFT_STATE);
    expect(idlFields("kamino", "LendingMarket").slice(0, KAMINO_LENDING_MARKET.length)).toEqual(KAMINO_LENDING_MARKET);
    expect(idlFields("marginfi", "MarginfiGroup").slice(0, MARGINFI_GROUP.length)).toEqual(MARGINFI_GROUP);
    expect(idlFields("orca", "WhirlpoolsConfig").slice(0, ORCA_WHIRLPOOLS_CONFIG.length)).toEqual(ORCA_WHIRLPOOLS_CONFIG);
  });
  it("discriminators match the IDL", () => {
    const m = idl("marginfi").accounts.find((a: { name: string }) => a.name === "MarginfiGroup");
    expect([...accountDiscriminator("MarginfiGroup")]).toEqual(m.discriminator);
  });
  it("orca fee authority is the same Squads vault as the upgrade authority", () => {
    const a = adapters.get("orca")!.decode(enc("admin-orca-config"));
    expect(a.admin).toBe("GwH3Hiv5mACLX3ufTw1pFsrhSPon5tdw252DBs4Rx4PV");
    expect(findVaultIndex("BQsDWkL417U4tVE2sDnPks469pKdm6YzFgKH77doiEjF", a.admin!)).toBe(0);
    expect(a.params.defaultProtocolFeeRate).toBeTypeOf("number");
  });
  it("drift State.admin decodes to a key (on-curve wallet)", () => {
    const a = adapters.get("drift")!.decode(enc("admin-drift-state"));
    expect(isOnCurve(a.admin!)).toBe(true);
    expect(a.params.signer).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
  it("kamino LendingMarket and marginfi Group decode owners and flags", () => {
    const k = adapters.get("kamino-lend")!.decode(enc("admin-kamino-market"));
    expect(k.admin).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(typeof k.params.emergencyMode).toBe("boolean");
    const m = adapters.get("marginfi")!.decode(enc("admin-marginfi-group"));
    expect(m.admin).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
  it("rejects wrong owner / discriminator", () => {
    const f = enc("admin-orca-config");
    expect(() => adapters.get("orca")!.decode({ ...f, owner: "11111111111111111111111111111111" })).toThrow(/owner/);
    expect(() => adapters.get("drift")!.decode({ ...enc("admin-orca-config"), owner: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH" })).toThrow(/discriminator/);
  });
  it("prefix decoder handles defined/array/variable types", () => {
    const types: IdlTypeDef[] = [{ name: "S", type: { kind: "struct" as const, fields: [{ name: "a", type: "u32" }, { name: "b", type: { array: ["u8", 4] } }] } }, { name: "E", type: { kind: "enum" as const, variants: [{ name: "A" }, { name: "B" }] } }, { name: "V", type: { kind: "enum" as const, variants: [{ name: "A", fields: ["u8"] }] } }];
    expect(sizeOf({ defined: "S" }, types)).toBe(8);
    expect(sizeOf({ defined: { name: "E" } }, types)).toBe(1);
    expect(sizeOf({ defined: "V" }, types)).toBeNull();
    expect(sizeOf({ defined: "Missing" }, types)).toBeNull();
    expect(sizeOf({ vec: "u8" }, types)).toBeNull();
    const d = new Uint8Array(8 + 1 + 1 + 8 + 4);
    d[8] = 1; d[9] = 7;
    const r = decodePrefix(d, [{ name: "flag", type: "bool" }, { name: "x", type: "u8" }, { name: "t", type: "i64" }, { name: "w", type: "u32" }, { name: "after", type: { vec: "u8" } }], types);
    expect(r).toEqual({ flag: true, x: 7, t: "0", w: 0 });
  });
  it("admin changes produce ADMIN_PARAM_CHANGED events", () => {
    const a = adapters.get("kamino-lend")!.decode(enc("admin-kamino-market"));
    const b = { ...a, params: { ...a.params, emergencyMode: true } };
    const e = diffSnapshots(snap({ admin: [a] }), snap({ admin: [b] }), ctx());
    expect(e.map((x) => x.type)).toEqual(["ADMIN_PARAM_CHANGED"]);
  });
});
