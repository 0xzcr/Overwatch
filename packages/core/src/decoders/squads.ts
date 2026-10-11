// Boundary: @sqds/multisig depends on @solana/web3.js v1. Keep it contained to this file.
import * as multisig from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_PUBKEY, decode, findProgramAddress, utf8 } from "../base58";
import { SQUADS_V4 } from "../constants/programs";
import type { ConfigActionLite, MultisigFacts, MultisigMember, PendingConfigProposal } from "../types";

const bn = (v: unknown) => (typeof v === "number" ? v : Number((v as { toString(): string }).toString()));
const info = (data: Uint8Array) => ({ data: Buffer.from(data), owner: new PublicKey(SQUADS_V4), lamports: 0, executable: false }) as never;

export const MULTISIG_DISCRIMINATOR = Uint8Array.from(multisig.accounts.multisigDiscriminator);
export const PROPOSAL_DISCRIMINATOR = Uint8Array.from(multisig.accounts.proposalDiscriminator);
export const CONFIG_TX_DISCRIMINATOR = Uint8Array.from(multisig.accounts.configTransactionDiscriminator);
/** Proposal and ConfigTransaction both store `multisig: Pubkey` right after the 8-byte discriminator. */
export const MULTISIG_FIELD_OFFSET = 8;

const startsWith = (d: Uint8Array, p: Uint8Array) => p.every((b, i) => d[i] === b);
export const isMultisigAccount = (d: Uint8Array) => startsWith(d, MULTISIG_DISCRIMINATOR);

export function decodeMultisig(address: string, data: Uint8Array, vaultIndex = 0, role = "upgrade_authority"): Omit<MultisigFacts, "pending"> {
  if (!isMultisigAccount(data)) throw new Error("not a Squads v4 Multisig account");
  const [m] = multisig.accounts.Multisig.fromAccountInfo(info(data));
  const cfg = m.configAuthority.toBase58();
  return {
    address,
    version: "v4",
    vaultIndex,
    role,
    threshold: m.threshold,
    members: m.members.map((x): MultisigMember => ({ key: x.key.toBase58(), permissions: x.permissions.mask })),
    timeLockSec: m.timeLock,
    configAuthority: cfg === DEFAULT_PUBKEY ? null : cfg,
    transactionIndex: bn(m.transactionIndex),
    staleTransactionIndex: bn(m.staleTransactionIndex),
  };
}

export function decodeProposal(data: Uint8Array): { multisig: string; transactionIndex: number; status: string } {
  if (!startsWith(data, PROPOSAL_DISCRIMINATOR)) throw new Error("not a Proposal");
  const [p] = multisig.accounts.Proposal.fromAccountInfo(info(data));
  return { multisig: p.multisig.toBase58(), transactionIndex: bn(p.transactionIndex), status: p.status.__kind };
}

export function decodeConfigTransaction(data: Uint8Array): { multisig: string; index: number; actions: ConfigActionLite[] } {
  if (!startsWith(data, CONFIG_TX_DISCRIMINATOR)) throw new Error("not a ConfigTransaction");
  const [c] = multisig.accounts.ConfigTransaction.fromAccountInfo(info(data));
  return { multisig: c.multisig.toBase58(), index: bn(c.index), actions: c.actions.map(liteAction) };
}

function liteAction(a: multisig.generated.ConfigAction): ConfigActionLite {
  switch (a.__kind) {
    case "AddMember":
      return { kind: "AddMember", key: a.newMember.key.toBase58(), permissions: a.newMember.permissions.mask };
    case "RemoveMember":
      return { kind: "RemoveMember", key: a.oldMember.toBase58() };
    case "ChangeThreshold":
      return { kind: "ChangeThreshold", newThreshold: a.newThreshold };
    case "SetTimeLock":
      return { kind: "SetTimeLock", newTimeLock: a.newTimeLock };
    case "SetRentCollector":
      return { kind: "SetRentCollector", collector: a.newRentCollector ? a.newRentCollector.toBase58() : null };
    default:
      return { kind: "Other", name: a.__kind };
  }
}

/** Pending = proposal not yet executed/cancelled/rejected and above the stale index. */
export function pendingFrom(
  ms: Pick<MultisigFacts, "staleTransactionIndex">,
  proposals: { transactionIndex: number; status: string }[],
  configTxs: { address: string; index: number; actions: ConfigActionLite[] }[],
): PendingConfigProposal[] {
  const live = new Set(["Draft", "Active", "Approved", "Executing"]);
  return configTxs
    .filter((c) => c.index > ms.staleTransactionIndex)
    .map((c) => ({ c, p: proposals.find((p) => p.transactionIndex === c.index) }))
    .filter(({ p }) => p && live.has(p.status))
    .map(({ c, p }) => ({ transactionIndex: c.index, status: p!.status, actions: c.actions, configTransaction: c.address }));
}

/** Squads v4 vault PDA: seeds ["multisig", multisigPda, "vault", u8 index]. */
export function vaultPda(multisigPda: string, index: number): string {
  return findProgramAddress([utf8("multisig"), decode(multisigPda), utf8("vault"), Uint8Array.of(index)], SQUADS_V4)[0];
}

export function findVaultIndex(multisigPda: string, authority: string, maxIndex = 7): number | null {
  for (let i = 0; i <= maxIndex; i++) if (vaultPda(multisigPda, i) === authority) return i;
  return null;
}
