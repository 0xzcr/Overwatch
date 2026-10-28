import "server-only";
import { cache } from "react";
import {
  DRIFT_STEPS,
  DRIFT_SOURCES,
  diffSnapshots,
  scoreSnapshot,
  flagNames,
  fmtDuration,
  type OverwatchEvent,
} from "@overwatch/core";
import { getProtocols, getEvents, type ProtocolView, type EventView } from "@/lib/data";

/** A protocol row as the site shows it. Built from live DB data or the labelled snapshot below. */
export interface ProtoCard {
  slug: string;
  name: string;
  category: string;
  grade: string;
  score: number | null;
  red: boolean;
  authorityKind: string;
  authority: string;
  threshold: string;
  timelockSec: number | null;
  timelock: string;
  tvlUsd: number | null;
  tvl: string;
  flags: string[];
  breakdown: { points: number; reason: string }[];
  nonceSigners: number;
  controlled: boolean;
  verified: boolean;
  lastChange: string | null;
  source: string;
  website: string | null;
}

export interface ReplayStep {
  date: string;
  headline: string;
  detail: string;
  level: "ok" | "warn" | "bad" | "dead";
  alerts: { severity: string; title: string; explanation: string; labels: string[] }[];
  score: number;
  grade: string;
  red: boolean;
  flags: string[];
}

export const SNAPSHOT_LABEL = "mainnet snapshot · Oct 11 2026";

const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n >= 1e9
      ? `$${(n / 1e9).toFixed(2)}B`
      : n >= 1e6
        ? `$${(n / 1e6).toFixed(1)}M`
        : `$${Math.round(n).toLocaleString("en-US")}`;

const AUTH: Record<string, string> = {
  SQUADS_V4_VAULT: "Squads v4 multisig",
  SINGLE_KEY: "Single private key",
  OTHER_PROGRAM_PDA: "Program-owned (unmapped)",
  REALMS_GOVERNANCE: "Realms DAO",
  SQUADS_V3: "Squads v3",
  IMMUTABLE: "Immutable",
  UNKNOWN: "Unknown",
};

// Snapshot of the mainnet watch list from docs/submission/headline-stats.md (generated 2026-10-11).
// Used only when the database is unreachable, and always labelled as a snapshot in the UI.
const FALLBACK: [
  slug: string,
  name: string,
  category: string,
  grade: string,
  score: number,
  authority: string,
  threshold: string,
  timelockSec: number | null,
][] = [
  ["drift", "Drift Protocol", "perps", "A", 85, "SQUADS_V4_VAULT", "4-of-7", 3600],
  ["jito", "Jito (JitoSOL)", "lst", "A", 85, "OTHER_PROGRAM_PDA", "—", null],
  ["jupiter-aggregator", "Jupiter Aggregator", "aggregator", "A", 85, "OTHER_PROGRAM_PDA", "—", null],
  ["jupiter-lend", "Jupiter Lend", "lending", "A", 85, "SQUADS_V4_VAULT", "4-of-7", 43200],
  ["jupiter-perps", "Jupiter Perps", "perps", "A", 95, "SQUADS_V4_VAULT", "4-of-8", 86400],
  ["kamino-lend", "Kamino Lend", "lending", "A", 85, "SQUADS_V4_VAULT", "5-of-10", 86400],
  ["marinade", "Marinade", "lst", "A", 85, "OTHER_PROGRAM_PDA", "—", null],
  ["meteora-dlmm", "Meteora DLMM", "dex", "A", 85, "OTHER_PROGRAM_PDA", "—", null],
  ["openbook", "OpenBook v2", "dex", "A", 85, "REALMS_GOVERNANCE", "—", null],
  ["orca", "Orca Whirlpools", "dex", "A", 85, "SQUADS_V4_VAULT", "5-of-13", 86400],
  ["pumpswap", "PumpSwap", "dex", "B", 75, "SQUADS_V4_VAULT", "3-of-4", 0],
  ["raydium", "Raydium", "dex", "B", 75, "SQUADS_V4_VAULT", "3-of-4", 0],
  ["sanctum", "Sanctum", "lst", "A", 85, "OTHER_PROGRAM_PDA", "—", null],
  ["save", "Save (formerly Solend)", "lending", "D", 40, "SINGLE_KEY", "—", null],
  ["marginfi", "marginfi", "lending", "C", 55, "SQUADS_V4_VAULT", "7-of-15", 0],
];
const SNAPSHOT_TVL = 8.66e9;
const SNAPSHOT_NO_TIMELOCK_TVL = 1.65e9;

const fmtTimelock = (s: number | null) => (s == null ? "—" : s === 0 ? "no delay" : fmtDuration(s));

function fallbackCards(): ProtoCard[] {
  return FALLBACK.map(([slug, name, category, grade, score, kind, threshold, timelockSec]) => {
    const unmapped = ["OTHER_PROGRAM_PDA", "REALMS_GOVERNANCE"].includes(kind);
    const flags = [
      ...(kind === "SINGLE_KEY" ? ["SINGLE_KEY"] : []),
      ...(timelockSec === 0 ? ["NO_TIMELOCK"] : []),
      ...(unmapped ? ["UNVERIFIED"] : []),
    ];
    return {
      slug,
      name,
      category,
      grade,
      score,
      red: kind === "SINGLE_KEY",
      authorityKind: kind,
      authority: AUTH[kind] ?? kind,
      threshold,
      timelockSec,
      timelock: fmtTimelock(timelockSec),
      tvlUsd: null,
      tvl: "—",
      flags,
      breakdown: [],
      nonceSigners: 0,
      controlled: false,
      verified: !unmapped,
      lastChange: null,
      source: "snapshot",
      website: null,
    };
  });
}

function fromView(p: ProtocolView): ProtoCard {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    grade: p.grade ?? "?",
    score: p.score,
    red: p.red,
    authorityKind: p.authorityKind,
    authority: p.authorityKind
      .split(" + ")
      .map((k) => AUTH[k] ?? k)
      .join(" + "),
    threshold: p.threshold,
    timelockSec: p.timelockSec,
    timelock: fmtTimelock(p.timelockSec),
    tvlUsd: p.tvlUsd,
    tvl: usd(p.tvlUsd),
    flags: p.flagNames,
    breakdown: p.breakdown.map((d) => ({ points: d.points, reason: d.reason })),
    nonceSigners: p.nonceSigners,
    controlled: p.controlled,
    verified: p.verified,
    lastChange: p.lastChange,
    source: p.source,
    website: p.website,
  };
}

// A production deploy without DATABASE_URL has no database to try (the localhost default is for development), so it
// goes straight to the snapshot instead of waiting out the timeout on every page.
const NO_DB = process.env.NODE_ENV === "production" && !process.env.DATABASE_URL;
// Long enough for a fresh TLS connection to a distant database region (~3.5s measured), short enough that a dead one
// falls back to the snapshot before the page feels hung.
// `next build` pre-renders the cached pages, and its first connection can take 5s+ (5.3s measured). Nobody is waiting
// on a build, so give it longer; otherwise the deploy would ship the snapshot until the first background refresh.
const BUILDING = process.env.NEXT_PHASE === "phase-production-build";
const withTimeout = <T>(run: () => Promise<T>, ms = BUILDING ? 20_000 : 5000): Promise<T> =>
  NO_DB
    ? Promise.reject(new Error("no database configured"))
    : Promise.race([run(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * Live protocol views, or null when the database is unreachable.
 * Wrapped in React's cache() so one page render reads the database once, even when both
 * generateMetadata and the page itself ask for the protocols.
 */
const liveViews = cache(async (): Promise<ProtocolView[] | null> => {
  try {
    const views = await withTimeout(() => getProtocols());
    return views.length ? views : null;
  } catch {
    return null;
  }
});

const sortCards = (xs: ProtoCard[]) =>
  xs.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));

/** "Changeable by ≤2 people with no delay": a single upgrade key, or a multisig with threshold ≤ 2 and no timelock. */
const lowNoDelay = (p: ProtoCard) =>
  p.flags.includes("SINGLE_KEY") || (p.timelockSec === 0 && Number(p.threshold.split("-")[0]) <= 2);

interface Headline {
  live: boolean;
  at: string;
  total: number;
  lowNoDelay: number;
  tvl: string;
  noTimelock: number;
  noTimelockTvl: string;
  shortTimelock: number;
  singleKey: number;
  unmapped: number;
}

function headline(cards: ProtoCard[], live: boolean, views: ProtocolView[] | null): Headline {
  const sum = (xs: ProtocolView[]) =>
    xs.some((x) => x.tvlUsd != null) ? xs.reduce((n, x) => n + (x.tvlUsd ?? 0), 0) : null;
  return {
    live,
    at: new Date().toISOString(),
    total: cards.length,
    lowNoDelay: cards.filter(lowNoDelay).length,
    tvl: usd(views ? sum(views) : SNAPSHOT_TVL),
    noTimelock: cards.filter((p) => p.timelockSec === 0).length,
    noTimelockTvl: usd(views ? sum(views.filter((p) => p.timelockSec === 0)) : SNAPSHOT_NO_TIMELOCK_TVL),
    shortTimelock: cards.filter((p) => p.timelockSec != null && p.timelockSec > 0 && p.timelockSec < 86400).length,
    singleKey: cards.filter((p) => p.flags.includes("SINGLE_KEY")).length,
    unmapped: cards.filter((p) => p.flags.includes("UNVERIFIED")).length,
  };
}

/** Mainnet protocols plus the headline numbers. */
export async function loadProtocols() {
  const views = await liveViews();
  const mainnet = views?.filter((p) => p.network === "mainnet") ?? null;
  const live = !!mainnet?.length;
  const cards = sortCards(live && mainnet ? mainnet.map(fromView) : fallbackCards());
  return { live, cards, headline: headline(cards, live, live ? mainnet : null) };
}

export type FeedItem = Pick<
  EventView,
  | "id"
  | "slug"
  | "name"
  | "type"
  | "severity"
  | "weakening"
  | "title"
  | "explanation"
  | "labels"
  | "slot"
  | "txSignature"
  | "source"
  | "blockTime"
  | "detectedAt"
>;

export async function loadEvents(limit = 200, minSeverity?: string): Promise<{ live: boolean; events: FeedItem[] }> {
  try {
    // the public feed shows onchain history and live catches only
    const events = await withTimeout(() =>
      getEvents({ limit, sources: ["live", "backfill"], ...(minSeverity ? { minSeverity } : {}) }),
    );
    return { live: true, events };
  } catch {
    return { live: false, events: [] };
  }
}

export async function loadProtocol(slug: string) {
  const views = await liveViews();
  const view = views?.find((p) => p.slug === slug) ?? null;
  if (view) {
    let events: FeedItem[] = [];
    try {
      events = await withTimeout(() => getEvents({ protocolId: view.id, limit: 100 }));
    } catch {
      /* timeline unavailable */
    }
    return { live: true, card: fromView(view), view, events };
  }
  if (views) return null; // DB is up and the protocol is unknown
  const card = fallbackCards().find((c) => c.slug === slug);
  return card ? { live: false, card, view: null, events: [] as FeedItem[] } : null;
}

// ---------------------------------------------------------------- Drift replay

// The reconstruction uses placeholder names ("drift-admin (council vault)", "attacker") that the
// rules engine shortens like real addresses. Spell them out for readers.
const readable = (s: string) =>
  s
    .replace("drif…ult)", "the council vault")
    .replace("atta…cker", "the attacker")
    .replace(/sign…er-([A-F])/g, "signer-$1")
    .replace(/nonc…ce-(\d)/g, "nonce-$1");

/** Replays the reconstructed Drift snapshots through the real rules engine and scorer. */
export function driftReplay(): ReplayStep[] {
  const history: OverwatchEvent[] = [];
  return DRIFT_STEPS.map((st, i) => {
    const prev = DRIFT_STEPS[i - 1];
    const alerts = prev
      ? diffSnapshots(prev.snapshot, st.snapshot, { history, slot: i, blockTime: st.date, now: st.date, name: "Drift" })
      : [];
    history.push(...alerts);
    const sc = scoreSnapshot(st.snapshot, history, st.date);
    const level: ReplayStep["level"] =
      i === DRIFT_STEPS.length - 1
        ? "dead"
        : alerts.some((a) => a.severity === "CRITICAL")
          ? "bad"
          : alerts.length || sc.red
            ? "warn"
            : "ok";
    return {
      date: st.date,
      headline: st.headline,
      detail: st.detail,
      level,
      alerts: alerts.map((a) => ({
        severity: a.severity,
        title: a.title,
        explanation: readable(a.explanation),
        labels: a.labels,
      })),
      score: sc.score,
      grade: sc.grade,
      red: sc.red,
      flags: flagNames(sc.flags),
    };
  });
}

export const driftSources = DRIFT_SOURCES;

const DRAIN = Date.parse("2026-04-01T16:05:00Z");
export function warningDays(steps: ReplayStep[]) {
  const first = steps.find((s) => s.alerts.some((a) => a.severity !== "INFO"));
  return first ? Math.round((DRAIN - Date.parse(first.date)) / 86_400_000) : 0;
}
