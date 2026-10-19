import "server-only";
import type { ControlSnapshot } from "@overwatch/core";
import type { ProtocolView, EventView } from "./data";

/**
 * The public API's response shapes. Every field is listed explicitly, so renaming or adding internal fields
 * (database columns, the watch-list config, snapshot internals) can never change what integrators receive.
 * Changing anything here is an API change: document it on /docs/api.
 */

export const protocolSummary = (p: ProtocolView) => ({
  slug: p.slug,
  name: p.name,
  category: p.category,
  website: p.website,
  network: p.network,
  verified: p.verified,
  problems: p.problems,
  tvlUsd: p.tvlUsd,
  score: p.score,
  grade: p.grade,
  red: p.red,
  flags: p.flags,
  flagNames: p.flagNames,
  breakdown: p.breakdown.map((d) => ({ key: d.key, points: d.points, reason: d.reason })),
  computedAt: p.computedAt,
  lastChange: p.lastChange,
  authorityKind: p.authorityKind,
  authorityLabel: p.authorityLabel,
  threshold: p.threshold,
  timelockSec: p.timelockSec,
  nonceSigners: p.nonceSigners,
  controlled: p.controlled,
});

const controls = (s: ControlSnapshot | null, at: string | null) =>
  s && {
    slot: s.slot,
    takenAt: at ?? s.takenAt,
    programs: s.programs.map((x) => ({
      programId: x.programId,
      label: x.label,
      upgradeAuthority: x.upgradeAuthority,
      authorityKind: x.authorityKind,
      multisig: x.multisig,
      lastDeploySlot: x.lastDeploySlot,
    })),
    multisigs: s.multisigs.map((m) => ({
      address: m.address,
      version: m.version,
      role: m.role,
      threshold: m.threshold,
      members: m.members.map((x) => ({ key: x.key, permissions: x.permissions })),
      timeLockSec: m.timeLockSec,
      configAuthority: m.configAuthority,
      pending: m.pending.map((x) => ({ transactionIndex: x.transactionIndex, status: x.status, actions: x.actions })),
    })),
    nonces: s.nonces.map((n) => ({ address: n.address, authority: n.authority })),
    mints: s.mints.map((m) => ({
      address: m.address,
      tokenProgram: m.tokenProgram,
      mintAuthority: m.mintAuthority,
      freezeAuthority: m.freezeAuthority,
      permanentDelegate: m.permanentDelegate,
      transferHookProgram: m.transferHookProgram,
      defaultAccountStateFrozen: m.defaultAccountStateFrozen,
      pausable: m.pausable,
      extensions: m.extensions,
    })),
    oracles: s.oracles.map((o) => ({ address: o.address, kind: o.kind, deprecated: o.deprecated })),
  };

export const protocolDetail = (p: ProtocolView) => ({
  ...protocolSummary(p),
  controls: controls(p.snapshot, p.snapshotAt),
});

export const event = (e: EventView) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  type: e.type,
  severity: e.severity,
  weakening: e.weakening,
  title: e.title,
  explanation: e.explanation,
  labels: e.labels,
  before: e.before,
  after: e.after,
  slot: e.slot,
  txSignature: e.txSignature,
  source: e.source,
  blockTime: e.blockTime,
  detectedAt: e.detectedAt,
});
