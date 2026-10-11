import type { ControlSnapshot } from "@overwatch/core";

export type GNodeKind = "program" | "authority" | "multisig" | "signer" | "nonce" | "config" | "mint" | "oracle" | "admin";
export interface GNode { id: string; kind: GNodeKind; label: string; sub: string; danger: boolean; address?: string; layer: number }
export interface GEdge { from: string; to: string; label?: string; danger?: boolean }

const s = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Program → upgrade authority → multisig → signers (→ nonce accounts), plus config authority, collateral, oracles. */
export function buildGraph(snap: ControlSnapshot | null): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  if (!snap) return { nodes, edges };
  const add = (n: GNode) => { if (!nodes.find((x) => x.id === n.id)) nodes.push(n); };
  for (const p of snap.programs) {
    add({ id: p.programId, kind: "program", label: p.label, sub: s(p.programId), danger: false, address: p.programId, layer: 0 });
    if (!p.upgradeAuthority) {
      add({ id: `imm-${p.programId}`, kind: "authority", label: "Immutable", sub: "nobody can upgrade", danger: false, layer: 1 });
      edges.push({ from: p.programId, to: `imm-${p.programId}` });
      continue;
    }
    const ms = snap.multisigs.find((m) => m.address === p.multisig);
    if (ms) {
      edges.push({ from: p.programId, to: ms.address, label: `upgrade via vault #${ms.vaultIndex}` });
    } else {
      const single = p.authorityKind === "SINGLE_KEY";
      add({ id: p.upgradeAuthority, kind: "authority", label: single ? "Single key" : p.authorityKind.replaceAll("_", " ").toLowerCase(), sub: s(p.upgradeAuthority), danger: single, address: p.upgradeAuthority, layer: 1 });
      edges.push({ from: p.programId, to: p.upgradeAuthority, label: "upgrade authority", danger: single });
    }
  }
  for (const m of snap.multisigs) {
    const weak = m.timeLockSec === 0 || m.threshold <= 2 || !!m.configAuthority;
    add({ id: m.address, kind: "multisig", label: `Squads ${m.threshold}-of-${m.members.length}`, sub: `timelock ${m.timeLockSec === 0 ? "none" : `${Math.round(m.timeLockSec / 3600)}h`}`, danger: weak, address: m.address, layer: 2 });
    if (m.configAuthority) {
      add({ id: `cfg-${m.configAuthority}`, kind: "config", label: "Config authority", sub: s(m.configAuthority), danger: true, address: m.configAuthority, layer: 2 });
      edges.push({ from: `cfg-${m.configAuthority}`, to: m.address, label: "can rewrite instantly", danger: true });
    }
    for (const mem of m.members) {
      const nonces = snap.nonces.filter((n) => n.authority === mem.key);
      add({ id: mem.key, kind: "signer", label: nonces.length ? "Signer ⚠ nonce" : "Signer", sub: s(mem.key), danger: nonces.length > 0, address: mem.key, layer: 3 });
      edges.push({ from: m.address, to: mem.key, danger: nonces.length > 0 });
      for (const n of nonces) {
        add({ id: n.address, kind: "nonce", label: "Durable nonce", sub: s(n.address), danger: true, address: n.address, layer: 4 });
        edges.push({ from: mem.key, to: n.address, label: "pre-signed tx", danger: true });
      }
    }
  }
  const root = snap.programs[0]?.programId;
  for (const mt of snap.mints) {
    const risky = !!(mt.permanentDelegate || mt.transferHookProgram || mt.defaultAccountStateFrozen);
    add({ id: mt.address, kind: "mint", label: risky ? "Collateral ⚠" : "Collateral", sub: `${s(mt.address)}${mt.permanentDelegate ? " · perm. delegate" : ""}`, danger: risky, address: mt.address, layer: 1 });
    if (root) edges.push({ from: root, to: mt.address, label: "accepts" });
  }
  for (const o of snap.oracles) {
    add({ id: o.address, kind: "oracle", label: `Oracle · ${o.kind.toLowerCase()}`, sub: s(o.address), danger: o.deprecated, address: o.address, layer: 1 });
    if (root) edges.push({ from: root, to: o.address, label: "prices", danger: o.deprecated });
  }
  return { nodes, edges };
}
