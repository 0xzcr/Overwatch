/**
 * Turns a live control snapshot into the ruleset's model, so the tested engine (engine.ts) grades real protocols.
 *
 * What a snapshot can prove, and how each piece becomes a control:
 *   - each program's upgrade authority  → a CODE control (new code can do anything, so it can drain)
 *   - each protocol admin an adapter read → a RISK control (listing collateral, changing limits or oracles)
 *   - each collateral token's issuer     → a stated trust assumption, listed and never graded
 * Anything the snapshot cannot resolve (a program-owned address with no mapped multisig) becomes "unknown",
 * which the engine treats as provisional and never better than C.
 */
import { isOnCurve } from "../base58";
import { findVaultIndex } from "../decoders/squads";
import type { ControlSnapshot, MultisigFacts, ProgramFacts } from "../types";
import type { Authority, Capability, Control, ExitLatency, Key, Multisig, Protocol } from "./model";

/** Squads vault indices checked when matching an address to a known multisig. */
const VAULT_INDICES = 15;

/**
 * The drain capabilities each kind of protocol is known to have. A capability listed here and not mapped
 * keeps the protocol out of A (see the coverage rule in engine.ts) and is shown as a gap on its page.
 */
export const EXPECTED_CAPABILITIES: Record<string, Capability[]> = {
  lending: ["CODE", "RISK"],
  perps: ["CODE", "RISK"],
  dex: ["CODE"],
  aggregator: ["CODE"],
  lst: ["CODE", "STAKE"],
  restaking: ["CODE", "STAKE"],
  yield: ["CODE", "FUNDS"],
  oracle: ["CODE", "PRICE"],
  bridge: ["CODE", "BRIDGE"],
  infra: ["CODE"],
};

export interface GradeContext {
  /** the protocol's category from the watch list, used for the coverage rule */
  category?: string;
  /** seconds a depositor needs to get money out; "unknown" when nobody has checked */
  exitLatencySec?: ExitLatency;
  /** per adapter, what its admin can really do in the deployed code (config `admin_limits`) */
  adminLimits?: { adapter: string; share?: number; protective?: boolean; source: string; deploy_slot: number }[];
}

/** Builds Authority objects for one snapshot, reusing the same object for the same address. */
class Resolver {
  private readonly cache = new Map<string, Authority>();
  private readonly nonceHolders: Set<string>;

  constructor(private readonly snapshot: ControlSnapshot) {
    this.nonceHolders = new Set(snapshot.nonces.map((nonce) => nonce.authority));
  }

  /** Who stands behind an address: no one (null), a known multisig, a single key, or unknown. */
  resolve(address: string | null): Authority {
    if (address === null) return { kind: "immutable" };
    const cached = this.cache.get(address);
    if (cached) return cached;
    const authority = this.build(address);
    this.cache.set(address, authority);
    return authority;
  }

  /** A program's upgrade authority, using what the collector already proved about it. */
  program(program: ProgramFacts): Authority {
    if (program.authorityKind === "IMMUTABLE" || program.upgradeAuthority === null) return { kind: "immutable" };
    if (program.authorityKind === "SINGLE_KEY") return this.keyOf(program.upgradeAuthority);
    const multisig = this.snapshot.multisigs.find((ms) => ms.address === program.multisig);
    if (program.authorityKind === "SQUADS_V4_VAULT" && multisig) return this.multisigOf(multisig);
    return { kind: "unknown", id: program.upgradeAuthority };
  }

  private build(address: string): Authority {
    // the same address already proven as a program's upgrade authority is the same authority here
    const program = this.snapshot.programs.find((p) => p.upgradeAuthority === address);
    if (program) return this.program(program);
    const multisig = this.multisigBehind(address);
    if (multisig) return this.multisigOf(multisig);
    // A wallet key sits on the ed25519 curve; a program-derived address never does.
    if (safeOnCurve(address)) return this.keyOf(address);
    return { kind: "unknown", id: address };
  }

  /** A multisig in the snapshot whose vault is this address (or which is this address itself). */
  private multisigBehind(address: string): MultisigFacts | undefined {
    const direct = this.snapshot.multisigs.find((ms) => ms.address === address);
    if (direct) return direct;
    return this.snapshot.multisigs.find((ms) => safeVaultIndex(ms.address, address) !== null);
  }

  private keyOf(address: string): Key {
    return { kind: "key", id: address, nonce: this.nonceHolders.has(address) };
  }

  private multisigOf(ms: MultisigFacts): Multisig {
    // Squads permission bit 2 is "vote": members without it cannot approve anything.
    const members = ms.members.map((member) => ({
      who: this.keyOf(member.key) as Authority,
      vote: (member.permissions & 2) !== 0,
    }));
    return {
      kind: "multisig",
      id: ms.address,
      threshold: ms.threshold,
      members,
      timelock: ms.timeLockSec,
      // shortcut: a config authority is resolved as a key or unknown, never as a further multisig; decode it when one appears
      configAuthority: ms.configAuthority ? this.configAuthorityOf(ms.configAuthority) : null,
      // shortcut: spending limits are not decoded yet, so none are modelled; add them with the Squads spending-limit decoder
      spendingLimits: [],
    };
  }

  private configAuthorityOf(address: string): Authority {
    return safeOnCurve(address) ? this.keyOf(address) : { kind: "unknown", id: address };
  }
}

/** A malformed address is treated as unknown rather than crashing the grade. */
function safeOnCurve(address: string): boolean {
  try {
    return isOnCurve(address);
  } catch {
    return false;
  }
}

function safeVaultIndex(multisig: string, address: string): number | null {
  try {
    return findVaultIndex(multisig, address, VAULT_INDICES);
  } catch {
    return null;
  }
}

/** The snapshot as the engine's Protocol: every control it can prove, plus the coverage it expects. */
export function protocolFromSnapshot(snapshot: ControlSnapshot, context: GradeContext = {}): Protocol {
  const resolver = new Resolver(snapshot);

  const code: Control[] = snapshot.programs.map((program) => ({
    capability: "CODE",
    label: `Upgrade ${program.label}`,
    by: resolver.program(program),
  }));

  // a limit is a claim about deployed code, so it only holds for the deploy it was checked against
  const deploys = new Set(snapshot.programs.map((program) => program.lastDeploySlot));
  const limitOf = (adapter: string) =>
    context.adminLimits?.find((entry) => entry.adapter === adapter && deploys.has(entry.deploy_slot));
  const risk: Control[] = snapshot.admin
    .filter((admin) => admin.admin !== null)
    .map((admin) => {
      const known = limitOf(admin.adapter);
      return {
        capability: "RISK",
        label: `Change risk settings (${admin.adapter})`,
        by: resolver.resolve(admin.admin),
        ...(known?.protective ? { protective: known.source } : {}),
        ...(known?.share !== undefined ? { limit: { share: known.share, source: known.source } } : {}),
      };
    });

  const issuers: Control[] = snapshot.mints
    .filter((mint) => mint.mintAuthority !== null)
    .map((mint) => ({
      capability: "MINT",
      label: `Mint collateral token ${mint.address.slice(0, 4)}…${mint.address.slice(-4)}`,
      by: resolver.resolve(mint.mintAuthority),
      trusted: "the token's issuer can mint it; this is a choice to trust the issuer, not a protocol control",
    }));

  return {
    id: snapshot.protocol,
    controls: [...code, ...risk, ...issuers],
    exitLatency: context.exitLatencySec ?? 0,
    expected: EXPECTED_CAPABILITIES[context.category ?? ""] ?? ["CODE"],
  };
}
