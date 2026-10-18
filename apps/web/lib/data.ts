import "server-only";
import { listProtocols, listEvents, scoreHistory, recentPublishes } from "@overwatch/db";
import type { ControlSnapshot, Deduction, ProtocolConfig } from "@overwatch/core";
import { flagNames, isRed, AUTHORITY_LABEL } from "@overwatch/core";

export interface ProtocolView {
  id: number; slug: string; name: string; category: string; website: string | null; network: "mainnet" | "devnet"; source: string;
  verified: boolean; problems: string[]; tvlUsd: number | null; config: ProtocolConfig;
  score: number | null; grade: string | null; flags: string; flagNames: string[]; red: boolean; breakdown: Deduction[]; computedAt: string | null;
  snapshot: ControlSnapshot | null; snapshotAt: string | null; lastChange: string | null;
  authorityKind: string; authorityLabel: string; threshold: string; timelockSec: number | null; nonceSigners: number; controlled: boolean;
}

export async function getProtocols(): Promise<ProtocolView[]> {
  const rows = await listProtocols();
  return rows.map((r) => {
    const snap = r.snapshot as ControlSnapshot | null;
    const flags = r.score ? BigInt(r.score.flags) : 0n;
    const ms = snap?.multisigs ?? [];
    const kinds = [...new Set(snap?.programs.map((p) => p.authorityKind) ?? [])];
    const signerSet = new Set(ms.flatMap((m) => m.members.map((x) => x.key)));
    const worst = ms.length ? ms.reduce((a, b) => (b.threshold / b.members.length < a.threshold / a.members.length ? b : a)) : null;
    return {
      id: r.id, slug: r.slug, name: r.name, category: r.category, website: r.website, network: r.network as "mainnet" | "devnet", source: r.source,
      verified: r.verified, problems: ((r.verification as { problems?: string[] } | null)?.problems ?? []), tvlUsd: r.tvlUsd, config: r.config as ProtocolConfig,
      score: r.score?.score ?? null, grade: r.score?.grade ?? null, flags: flags.toString(), flagNames: flagNames(flags), red: isRed(flags),
      breakdown: (r.score?.breakdown as Deduction[]) ?? [], computedAt: r.score?.computed_at ? new Date(r.score.computed_at).toISOString() : null,
      snapshot: snap, snapshotAt: r.snapshotAt ? new Date(r.snapshotAt).toISOString() : null, lastChange: r.lastChange ? new Date(r.lastChange).toISOString() : null,
      authorityKind: kinds.join(" + ") || "—", authorityLabel: kinds.map((k) => AUTHORITY_LABEL[k]).join(" + ") || "—",
      threshold: worst ? `${worst.threshold}-of-${worst.members.length}` : "—",
      timelockSec: ms.length ? Math.min(...ms.map((m) => m.timeLockSec)) : null,
      nonceSigners: new Set((snap?.nonces ?? []).filter((n) => signerSet.has(n.authority)).map((n) => n.authority)).size,
      controlled: ms.some((m) => !!m.configAuthority),
    };
  });
}

export async function getProtocol(slug: string) {
  return (await getProtocols()).find((p) => p.slug === slug) ?? null;
}

export type EventView = Awaited<ReturnType<typeof getEvents>>[number];
export async function getEvents(o: Parameters<typeof listEvents>[0] = {}) {
  const rows = await listEvents(o);
  return rows.map(({ e, slug, name }) => ({
    id: e.id, slug, name, type: e.type, severity: e.severity, weakening: e.weakening, title: e.title, explanation: e.explanation,
    labels: (e.labels as string[]) ?? [], before: e.before, after: e.after, slot: e.slot, txSignature: e.txSignature, source: e.source,
    blockTime: e.blockTime?.toISOString() ?? null, detectedAt: e.detectedAt.toISOString(),
  }));
}

export async function getScoreHistory(id: number) {
  return (await scoreHistory(id)).map((s) => ({ score: s.score, grade: s.grade, flags: s.flags.toString(), at: s.computedAt.toISOString() }));
}

export async function getPublishes(limit = 30) {
  return (await recentPublishes(limit)).map(({ p, slug }) => ({ slug, kind: p.kind, tx: p.txSignature, score: p.score, flags: p.flags.toString(), at: p.createdAt.toISOString() }));
}
