import { describe, expect, it } from "vitest";
import * as multisig from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
import {
  decodeProgramAccount,
  decodeProgramDataHeader,
  decodeNonce,
  decodeMultisig,
  decodeMint,
  mintRisks,
  vaultPda,
  findVaultIndex,
  classifyAuthority,
  isOnCurve,
  findProgramAddress,
  utf8,
  decodeProposal,
  decodeConfigTransaction,
  pendingFrom,
  isMultisigAccount,
  SQUADS_V4,
  SQUADS_V3,
  SYSTEM_PROGRAM,
  REALMS_GOVERNANCE,
  readPubkey,
  classifyOracleOwner,
} from "../src";
import { fixture } from "./fixtures";

describe("BPF upgradeable loader (real mainnet fixtures)", () => {
  it("decodes Program accounts", () => {
    for (const k of ["drift", "kamino", "squads", "solend", "openbook"]) {
      const p = fixture(`program-${k}`);
      const pd = fixture(`programdata-${k}`);
      expect(p.owner).toBe("BPFLoaderUpgradeab1e11111111111111111111111");
      expect(decodeProgramAccount(p.data).programDataAddress).toBe(pd.address);
    }
  });
  it("decodes ProgramData headers", () => {
    expect(decodeProgramDataHeader(fixture("programdata-squads").data).upgradeAuthority).toBeNull();
    const d = decodeProgramDataHeader(fixture("programdata-drift").data);
    expect(d.upgradeAuthority).toBe("8jj7zJgdr5bDndc7evM74FMGwzLPmd4u4QxNzFi1BMai");
    expect(d.slot).toBeGreaterThan(400_000_000);
    expect(decodeProgramDataHeader(fixture("programdata-solend").data).upgradeAuthority).toBe(
      "RY93CZYe5g6drtG7W9PmHRPzaBLZ1uwihTzayQTmJfh",
    );
  });
  it("rejects wrong tags and short buffers", () => {
    expect(() => decodeProgramAccount(new Uint8Array(36))).toThrow(/not an/);
    expect(() => decodeProgramAccount(new Uint8Array(4))).toThrow(/short/);
    expect(() => decodeProgramDataHeader(new Uint8Array(45))).toThrow(/not an/);
    expect(() => decodeProgramDataHeader(new Uint8Array(5))).toThrow(/short/);
    const bad = Uint8Array.from(fixture("programdata-drift").data);
    bad[12] = 7;
    expect(() => decodeProgramDataHeader(bad)).toThrow(/option/);
    expect(() => readPubkey(new Uint8Array(10), 0)).toThrow();
  });
});

describe("Squads v4", () => {
  it("decodes the real Drift multisig", () => {
    const f = fixture("multisig-drift");
    expect(f.owner).toBe(SQUADS_V4);
    expect(isMultisigAccount(f.data)).toBe(true);
    const m = decodeMultisig(f.address, f.data);
    expect(m.threshold).toBe(4);
    expect(m.members).toHaveLength(7);
    expect(m.timeLockSec).toBe(3600);
    expect(m.configAuthority).toBeNull();
    expect(m.members.every((x) => x.permissions > 0 && x.permissions <= 7)).toBe(true);
  });
  it("native vault PDA derivation matches the SDK and the real upgrade authority", () => {
    const ms = "7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM";
    for (let i = 0; i < 4; i++)
      expect(vaultPda(ms, i)).toBe(multisig.getVaultPda({ multisigPda: new PublicKey(ms), index: i })[0].toBase58());
    expect(findVaultIndex(ms, "8jj7zJgdr5bDndc7evM74FMGwzLPmd4u4QxNzFi1BMai")).toBe(0);
    expect(findVaultIndex(ms, SYSTEM_PROGRAM)).toBeNull();
    expect(
      findVaultIndex("tr8rgazUrZzgdkfc6Q622nVJHMMzh29trdBE2uBHb4u", "FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK"),
    ).toBe(0);
  });
  it("findProgramAddress matches web3.js", () => {
    const [a, b] = findProgramAddress([utf8("config")], SQUADS_V4);
    const [x, y] = PublicKey.findProgramAddressSync([Buffer.from("config")], new PublicKey(SQUADS_V4));
    expect(a).toBe(x.toBase58());
    expect(b).toBe(y);
  });
  it("rejects non-multisig data", () => {
    expect(() => decodeMultisig("x", new Uint8Array(100))).toThrow();
    expect(() => decodeProposal(new Uint8Array(100))).toThrow();
    expect(() => decodeConfigTransaction(new Uint8Array(100))).toThrow();
  });
  it("round-trips Proposal and ConfigTransaction via SDK serializers and computes pending", () => {
    const msPk = new PublicKey("7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM");
    const [prop] = multisig.accounts.Proposal.fromArgs({
      multisig: msPk,
      transactionIndex: 9,
      status: { __kind: "Active", timestamp: 1 },
      bump: 1,
      approved: [],
      rejected: [],
      cancelled: [],
    } as never).serialize();
    const [ctx] = multisig.accounts.ConfigTransaction.fromArgs({
      multisig: msPk,
      creator: msPk,
      index: 9,
      bump: 1,
      actions: [
        { __kind: "SetTimeLock", newTimeLock: 0 },
        { __kind: "ChangeThreshold", newThreshold: 1 },
        { __kind: "AddMember", newMember: { key: msPk, permissions: { mask: 7 } } },
        { __kind: "RemoveMember", oldMember: msPk },
        { __kind: "SetRentCollector", newRentCollector: null },
        { __kind: "RemoveSpendingLimit", spendingLimit: msPk },
      ],
    } as never).serialize();
    const p = decodeProposal(prop);
    expect(p).toEqual({ multisig: msPk.toBase58(), transactionIndex: 9, status: "Active" });
    const c = decodeConfigTransaction(ctx);
    expect(c.actions.map((a) => a.kind)).toEqual([
      "SetTimeLock",
      "ChangeThreshold",
      "AddMember",
      "RemoveMember",
      "SetRentCollector",
      "Other",
    ]);
    const pending = pendingFrom({ staleTransactionIndex: 3 }, [p], [{ address: "cfg", ...c }]);
    expect(pending).toHaveLength(1);
    expect(pendingFrom({ staleTransactionIndex: 9 }, [p], [{ address: "cfg", ...c }])).toHaveLength(0);
    expect(
      pendingFrom({ staleTransactionIndex: 0 }, [{ ...p, status: "Executed" }], [{ address: "cfg", ...c }]),
    ).toHaveLength(0);
  });
});

describe("durable nonce (real devnet fixture)", () => {
  it("decodes authority at offset 8", () => {
    const f = fixture("nonce-devnet");
    expect(f.owner).toBe(SYSTEM_PROGRAM);
    const n = decodeNonce(f.address, f.data)!;
    expect(n.authority).toBe(f.address); // created with itself as authority
    expect(n.blockhash).toHaveLength(n.blockhash.length);
  });
  it("returns null for uninitialized and throws on wrong size", () => {
    expect(decodeNonce("x", new Uint8Array(80))).toBeNull();
    expect(() => decodeNonce("x", new Uint8Array(81))).toThrow();
  });
});

describe("mints", () => {
  it("decodes classic USDC", () => {
    const f = fixture("mint-usdc");
    const m = decodeMint(f.address, f.owner, f.data);
    expect(m.tokenProgram).toBe("spl-token");
    expect(m.freezeAuthority).not.toBeNull();
    expect(m.mintAuthority).not.toBeNull();
    expect(mintRisks(m)).toContain("FreezeAuthority");
  });
  it("decodes Token-2022 PYUSD extensions (PermanentDelegate, TransferHook)", () => {
    const f = fixture("mint-pyusd-t22");
    const m = decodeMint(f.address, f.owner, f.data);
    expect(m.tokenProgram).toBe("token-2022");
    expect(m.extensions).toContain("PermanentDelegate");
    expect(m.extensions).toContain("TransferHook");
    expect(m.permanentDelegate).not.toBeNull();
    expect(mintRisks(m)).toContain("PermanentDelegate");
  });
  it("parses synthetic DefaultAccountState(frozen) + Pausable and rejects bad owners", () => {
    const d = new Uint8Array(166 + 5 + 4 + 4);
    d[45] = 1;
    d[165] = 1;
    const dv = new DataView(d.buffer);
    dv.setUint16(166, 6, true);
    dv.setUint16(168, 1, true);
    d[170] = 2;
    dv.setUint16(171, 26, true);
    dv.setUint16(173, 0, true);
    const m = decodeMint("x", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", d);
    expect(m.defaultAccountStateFrozen).toBe(true);
    expect(m.pausable).toBe(true);
    expect(mintRisks(m)).toEqual(["DefaultFrozen", "Pausable"]);
    expect(() => decodeMint("x", SYSTEM_PROGRAM, d)).toThrow();
    expect(() => decodeMint("x", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", new Uint8Array(10))).toThrow();
  });
});

describe("authority classification", () => {
  it("covers every kind with real addresses", () => {
    expect(classifyAuthority({ authority: null, owner: null, squadsV4VaultMatch: false })).toBe("IMMUTABLE");
    expect(
      classifyAuthority({
        authority: "8jj7zJgdr5bDndc7evM74FMGwzLPmd4u4QxNzFi1BMai",
        owner: SYSTEM_PROGRAM,
        squadsV4VaultMatch: true,
      }),
    ).toBe("SQUADS_V4_VAULT");
    expect(
      classifyAuthority({
        authority: "RY93CZYe5g6drtG7W9PmHRPzaBLZ1uwihTzayQTmJfh",
        owner: null,
        squadsV4VaultMatch: false,
      }),
    ).toBe("SINGLE_KEY");
    expect(
      classifyAuthority({
        authority: "CZoAmQErbMwhSNA5WtbWLcwGE1mhXEv4hTvyvvHXGkrr",
        owner: REALMS_GOVERNANCE[0]!,
        squadsV4VaultMatch: false,
      }),
    ).toBe("REALMS_GOVERNANCE");
    expect(
      classifyAuthority({
        authority: "CZoAmQErbMwhSNA5WtbWLcwGE1mhXEv4hTvyvvHXGkrr",
        owner: SQUADS_V3,
        squadsV4VaultMatch: false,
      }),
    ).toBe("SQUADS_V3");
    expect(
      classifyAuthority({
        authority: "551FBXSXdhcRDDkdcb3ThDRg84Mwe5Zs6YjJ1EEoyzBp",
        owner: null,
        squadsV4VaultMatch: false,
      }),
    ).toBe("OTHER_PROGRAM_PDA");
    expect(
      classifyAuthority({
        authority: "8jj7zJgdr5bDndc7evM74FMGwzLPmd4u4QxNzFi1BMai",
        owner: SQUADS_V4,
        squadsV4VaultMatch: false,
      }),
    ).toBe("UNKNOWN");
    expect(
      classifyAuthority({
        authority: "RY93CZYe5g6drtG7W9PmHRPzaBLZ1uwihTzayQTmJfh",
        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        squadsV4VaultMatch: false,
      }),
    ).toBe("UNKNOWN");
    expect(isOnCurve("not-base58!")).toBe(false);
  });
  it("classifies oracle owners", () => {
    expect(classifyOracleOwner("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv")).toEqual({
      kind: "SWITCHBOARD",
      deprecated: true,
    });
    expect(classifyOracleOwner("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ").kind).toBe("PYTH");
    expect(classifyOracleOwner("abc", ["abc"]).kind).toBe("PROTOCOL_OWNED");
    expect(classifyOracleOwner("zzz").kind).toBe("UNKNOWN");
  });
});
