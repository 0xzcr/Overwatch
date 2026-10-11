import "server-only";
import { DRIFT_STEPS, DRIFT_SOURCES, diffSnapshots, scoreSnapshot, flagNames, fmtDuration, type OverwatchEvent } from "@overwatch/core";
import { getProtocols, getEvents, type ProtocolView } from "@/lib/data";

export interface ProtoCard {
  slug: string;
  name: string;
  category: string;
  grade: string;
  score: number | null;
  red: boolean;
  authority: string;
  threshold: string;
  timelock: string;
  tvl: string;
  flags: string[];
  breakdown: { points: number; reason: string }[];
  nonceSigners: number;
  verified: boolean;
  programs: { label: string; id: string }[];
}

export interface FeedItem {
  severity: string;
  title: string;
  name: string;
  at: string;
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

export interface SiteData {
  live: boolean;
  at: string;
  protocols: ProtoCard[];
  stats: { total: number; tvl: string; noTimelock: number; noTimelockTvl: string; singleKey: number; unmapped: number; shortTimelock: number };
  feed: FeedItem[];
  drift: ReplayStep[];
  driftSources: { label: string; url: string }[];
  warningDays: number;
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;

const AUTH: Record<string, string> = {
  SQUADS_V4_VAULT: "Squads v4 multisig",
  SINGLE_KEY: "Single private key",
  OTHER_PROGRAM_PDA: "Program-owned (unmapped)",
  REALMS_GOVERNANCE: "Realms DAO",
  SQUADS_V3: "Squads v3",
  IMMUTABLE: "Immutable",
  UNKNOWN: "Unknown",
};

// Snapshot of the mainnet watch list from docs/submission/headline-stats.md (2026-10-11).
// Used when the database is not reachable, so the site always renders real numbers.
const FALLBACK: [slug: string, name: string, category: string, grade: string, score: number, authority: string, threshold: string, timelock: string][] = [
  ["drift", "Drift Protocol", "perps", "A", 85, "SQUADS_V4_VAULT", "4-of-7", "1 hour"],
  ["jito", "Jito (JitoSOL)", "lst", "A", 85, "OTHER_PROGRAM_PDA", "—", "—"],
  ["jupiter-aggregator", "Jupiter Aggregator", "aggregator", "A", 85, "OTHER_PROGRAM_PDA", "—", "—"],
  ["jupiter-lend", "Jupiter Lend", "lending", "A", 85, "SQUADS_V4_VAULT", "4-of-7", "12 hours"],
  ["jupiter-perps", "Jupiter Perps", "perps", "A", 95, "SQUADS_V4_VAULT", "4-of-8", "1 day"],
  ["kamino-lend", "Kamino Lend", "lending", "A", 85, "SQUADS_V4_VAULT", "5-of-10", "1 day"],
  ["marinade", "Marinade", "lst", "A", 85, "OTHER_PROGRAM_PDA", "—", "—"],
  ["meteora-dlmm", "Meteora DLMM", "dex", "A", 85, "OTHER_PROGRAM_PDA", "—", "—"],
  ["openbook", "OpenBook v2", "dex", "A", 85, "REALMS_GOVERNANCE", "—", "—"],
  ["orca", "Orca Whirlpools", "dex", "A", 85, "SQUADS_V4_VAULT", "5-of-13", "1 day"],
  ["pumpswap", "PumpSwap", "dex", "B", 75, "SQUADS_V4_VAULT", "3-of-4", "no delay"],
  ["raydium", "Raydium", "dex", "B", 75, "SQUADS_V4_VAULT", "3-of-4", "no delay"],
  ["sanctum", "Sanctum", "lst", "A", 85, "OTHER_PROGRAM_PDA", "—", "—"],
  ["save", "Save (formerly Solend)", "lending", "D", 40, "SINGLE_KEY", "—", "—"],
  ["marginfi", "marginfi", "lending", "C", 55, "SQUADS_V4_VAULT", "7-of-15", "no delay"],
];

function fallbackProtocols(): ProtoCard[] {
  return FALLBACK.map(([slug, name, category, grade, score, kind, threshold, timelock]) => {
    const flags = [
      ...(kind === "SINGLE_KEY" ? ["SINGLE_KEY"] : []),
      ...(timelock === "no delay" ? ["NO_TIMELOCK"] : []),
      ...(["OTHER_PROGRAM_PDA", "REALMS_GOVERNANCE"].includes(kind) ? ["UNVERIFIED"] : []),
    ];
    return {
      slug, name, category, grade, score, red: kind === "SINGLE_KEY", authority: AUTH[kind] ?? kind, threshold, timelock,
      tvl: "—", flags, breakdown: [], nonceSigners: 0, verified: kind === "SQUADS_V4_VAULT", programs: [],
    };
  });
}

function fromView(p: ProtocolView): ProtoCard {
  const kinds = p.authorityKind.split(" + ");
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    grade: p.grade ?? "?",
    score: p.score,
    red: p.red,
    authority: kinds.map((k) => AUTH[k] ?? k).join(" + "),
    threshold: p.threshold,
    timelock: p.timelockSec == null ? "—" : p.timelockSec === 0 ? "no delay" : fmtDuration(p.timelockSec),
    tvl: usd(p.tvlUsd),
    flags: p.flagNames,
    breakdown: p.breakdown.map((d) => ({ points: d.points, reason: d.reason })),
    nonceSigners: p.nonceSigners,
    verified: p.verified,
    programs: (p.snapshot?.programs ?? []).map((x) => ({ label: x.label, id: x.programId })),
  };
}

// The reconstruction uses placeholder names ("drift-admin (council vault)", "attacker") that the
// rules engine shortens like real addresses. Spell them out for readers.
const readable = (s: string) =>
  s
    .replace("drif…ult)", "the council vault")
    .replace("atta…cker", "the attacker")
    .replace(/sign…er-([A-F])/g, "signer-$1")
    .replace(/nonc…ce-(\d)/g, "nonce-$1");

function driftReplay(): ReplayStep[] {
  const history: OverwatchEvent[] = [];
  return DRIFT_STEPS.map((st, i) => {
    const prev = DRIFT_STEPS[i - 1];
    const alerts = prev ? diffSnapshots(prev.snapshot, st.snapshot, { history, slot: i, blockTime: st.date, now: st.date, name: "Drift" }) : [];
    history.push(...alerts);
    const sc = scoreSnapshot(st.snapshot, history, st.date);
    const level: ReplayStep["level"] =
      i === DRIFT_STEPS.length - 1 ? "dead" : alerts.some((a) => a.severity === "CRITICAL") ? "bad" : alerts.length || sc.red ? "warn" : "ok";
    return {
      date: st.date,
      headline: st.headline,
      detail: st.detail,
      level,
      alerts: alerts.map((a) => ({ severity: a.severity, title: a.title, explanation: readable(a.explanation), labels: a.labels })),
      score: sc.score,
      grade: sc.grade,
      red: sc.red,
      flags: flagNames(sc.flags),
    };
  });
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const DRAIN = Date.parse("2026-04-01T16:05:00Z");

export async function loadSiteData(): Promise<SiteData> {
  let live = false;
  let protocols = fallbackProtocols();
  let feed: FeedItem[] = [];
  let tvlTotal: number | null = 8.66e9;
  let noTimelockTvl: number | null = 1.65e9;

  try {
    const [views, events] = await withTimeout(Promise.all([getProtocols(), getEvents({ limit: 24, minSeverity: "MEDIUM" })]), 2500);
    const mainnet = views.filter((p) => p.source !== "demo" && p.network === "mainnet");
    if (mainnet.length) {
      live = true;
      protocols = mainnet.map(fromView);
      const sum = (xs: ProtocolView[]) => (xs.some((x) => x.tvlUsd != null) ? xs.reduce((n, x) => n + (x.tvlUsd ?? 0), 0) : null);
      tvlTotal = sum(mainnet);
      noTimelockTvl = sum(mainnet.filter((p) => p.timelockSec === 0));
      feed = events.map((e) => ({ severity: e.severity, title: e.title, name: e.name, at: e.blockTime ?? e.detectedAt }));
    }
  } catch {
    // No database in this environment: keep the static snapshot.
  }

  const drift = driftReplay();
  const firstAlert = drift.find((s) => s.alerts.some((a) => a.severity !== "INFO"));
  const warningDays = firstAlert ? Math.round((DRAIN - Date.parse(firstAlert.date)) / 86_400_000) : 0;

  return {
    live,
    at: new Date().toISOString(),
    protocols: protocols.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name)),
    stats: {
      total: protocols.length,
      tvl: usd(tvlTotal),
      noTimelock: protocols.filter((p) => p.timelock === "no delay").length,
      noTimelockTvl: usd(noTimelockTvl),
      singleKey: protocols.filter((p) => p.flags.includes("SINGLE_KEY")).length,
      unmapped: protocols.filter((p) => p.flags.includes("UNVERIFIED")).length,
      shortTimelock: protocols.filter((p) => /hour/.test(p.timelock)).length,
    },
    feed,
    drift,
    driftSources: DRIFT_SOURCES,
    warningDays,
  };
}
