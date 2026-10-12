import { describe, expect, it } from "vitest";
import { rehearse, rehearsalBaseline } from "../src/rehearsal";

describe("demo rehearsal", () => {
  it("starts from the setup state: controlled 2-of-3 multisig with a 2-day timelock, not red", () => {
    const s = rehearsalBaseline();
    expect(s.multisig).toEqual({ threshold: 2, members: 3, timeLock: 172_800 });
    expect(s.risk.red).toBe(false);
    expect(s.position.shielded).toBe(false);
  });

  it("removing the timelock raises a CRITICAL alert, turns the registry red and fires the vault shield once", () => {
    const r = rehearse([], "remove-timelock");
    expect(r.events.map((e) => e.severity)).toEqual(["CRITICAL"]);
    expect(r.registry.red).toBe(true);
    expect(r.shield).toBe("fired");
    expect(r.state.position).toEqual({ shielded: true, allocated: "0" });
    expect(rehearse(["remove-timelock"], "lower-threshold").shield).toBeNull();
  });

  it("labels the Drift pattern once a signer holds a durable nonce after a weakening", () => {
    const r = rehearse(["remove-timelock", "lower-threshold"], "create-signer-nonce");
    expect(r.events[0]?.labels).toContain("Drift pattern");
    expect(r.events[0]?.explanation).toContain("signer-a");
    expect(r.registry.flags).toContain("SIGNER_NONCE");
  });

  it("transferring authority first also removes the timelock, as the devnet action does", () => {
    const r = rehearse([], "transfer-authority");
    expect(r.events.map((e) => e.title).join(" ")).toMatch(/single|One private key/i);
    expect(r.events).toHaveLength(2);
    expect(r.state.authorityIsVault).toBe(false);
  });

  it("reset restores the baseline and re-arms the vault", () => {
    const r = rehearse(["remove-timelock", "transfer-authority"], "reset");
    expect(r.registry.red).toBe(false);
    expect(r.shield).toBe("rearmed");
    expect(r.state.position.shielded).toBe(false);
    expect(r.state.multisig.timeLock).toBe(172_800);
  });
});
