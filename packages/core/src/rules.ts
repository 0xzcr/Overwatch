import { fmtDuration, people, short } from "./format";
import type { ConfigActionLite, ControlSnapshot, MultisigFacts, OverwatchEvent, Severity, EventType } from "./types";
import { SEVERITY_ORDER } from "./types";
import { mintRisks } from "./decoders/token";

const DAY = 86_400_000;

export interface DiffContext {
  /** recent prior events for the protocol (for compound rules) */
  history: Pick<OverwatchEvent, "type" | "detectedAt" | "blockTime" | "weakening" | "severity">[];
  slot: number;
  blockTime: string | null;
  txSignature?: string | null;
  now: string;
  name: string;
}

type Draft = Omit<OverwatchEvent, "protocol" | "slot" | "blockTime" | "txSignature" | "detectedAt" | "labels"> & { labels?: string[] };

const ev = (type: EventType, severity: Severity, weakening: boolean, title: string, explanation: string, before: unknown, after: unknown): Draft => ({
  type, severity, weakening, title, explanation, before, after,
});

/** Map multisigs by role so a migration to a new multisig still compares old vs new controls. */
function byRole(s: ControlSnapshot | null) {
  const m = new Map<string, MultisigFacts>();
  for (const x of s?.multisigs ?? []) m.set(`${x.role}:${x.vaultIndex}`, x);
  return m;
}

export function diffMultisig(name: string, a: MultisigFacts, b: MultisigFacts): Draft[] {
  const out: Draft[] = [];
  const n = b.members.length;
  if (b.timeLockSec < a.timeLockSec) {
    if (b.timeLockSec === 0)
      out.push(ev("TIMELOCK_REMOVED", "CRITICAL", true, `${name} removed its ${fmtDuration(a.timeLockSec)} safety delay`,
        `${name} removed its ${fmtDuration(a.timeLockSec)} safety delay. ${people(b.threshold)} can now change the program instantly, with no time for depositors to react.`,
        { timeLockSec: a.timeLockSec }, { timeLockSec: 0 }));
    else
      out.push(ev("TIMELOCK_REDUCED", "HIGH", true, `${name} shortened its safety delay to ${fmtDuration(b.timeLockSec)}`,
        `The waiting period before approved changes take effect dropped from ${fmtDuration(a.timeLockSec)} to ${fmtDuration(b.timeLockSec)}. You have less time to withdraw if something bad is approved.`,
        { timeLockSec: a.timeLockSec }, { timeLockSec: b.timeLockSec }));
  } else if (b.timeLockSec > a.timeLockSec) {
    out.push(ev("TIMELOCK_INCREASED", "INFO", false, `${name} lengthened its safety delay to ${fmtDuration(b.timeLockSec)}`,
      `Approved changes now wait ${fmtDuration(b.timeLockSec)} before taking effect (was ${fmtDuration(a.timeLockSec)}). This is good for depositors.`,
      { timeLockSec: a.timeLockSec }, { timeLockSec: b.timeLockSec }));
  }
  if (b.threshold < a.threshold) {
    out.push(ev("THRESHOLD_LOWERED", b.threshold <= 2 ? "CRITICAL" : "HIGH", true, `${name} now needs only ${b.threshold} of ${n} signatures`,
      `Approving a change used to take ${people(a.threshold)}; now ${people(b.threshold)} out of ${n} are enough. Fewer people need to be compromised or collude to move funds.`,
      { threshold: a.threshold, members: a.members.length }, { threshold: b.threshold, members: n }));
  } else if (b.threshold > a.threshold) {
    out.push(ev("THRESHOLD_RAISED", "INFO", false, `${name} now requires ${b.threshold} of ${n} signatures`,
      `More people must approve changes (was ${a.threshold}). This strengthens controls.`, { threshold: a.threshold }, { threshold: b.threshold }));
  }
  if (!a.configAuthority && b.configAuthority) {
    out.push(ev("CONFIG_AUTHORITY_SET", "HIGH", true, `A single key can now rewrite ${name}'s multisig`,
      `Key ${short(b.configAuthority)} became the multisig's config authority. It can change signers, threshold and delay instantly, without a vote.`,
      { configAuthority: null }, { configAuthority: b.configAuthority }));
  } else if (a.configAuthority && !b.configAuthority) {
    out.push(ev("CONFIG_AUTHORITY_REMOVED", "INFO", false, `${name}'s multisig is no longer controlled by a single key`,
      `Config changes now require a multisig vote.`, { configAuthority: a.configAuthority }, { configAuthority: null }));
  }
  const ak = new Set(a.members.map((m) => m.key));
  const bk = new Set(b.members.map((m) => m.key));
  const added = [...bk].filter((k) => !ak.has(k));
  const removed = [...ak].filter((k) => !bk.has(k));
  if (added.length || removed.length) {
    out.push(ev("MEMBERS_CHANGED", "MEDIUM", true, `${name} changed its multisig signers`,
      `${added.length} signer(s) added, ${removed.length} removed. New signers are new people (or devices) who can approve changes.`,
      { members: [...ak] }, { members: [...bk], added, removed }));
  }
  return out;
}

/** One multisig's settings while replaying its executed config transactions oldest-first. undefined = not known yet. */
export interface ReplayState { timeLockSec?: number; threshold?: number; members?: number }

const andJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n: number, one: string) => (n === 1 ? `a ${one}` : `${n} ${one}s`);
const UNKNOWN_BEFORE = "The earlier setting is older than the history we scanned.";

/**
 * One executed Squads config transaction (historical backfill) → one event, graded the same way as the live rules.
 * Direction needs the value before the change, so callers replay a multisig's transactions oldest-first; the first change
 * of each kind has no known prior value and stays neutral rather than guessing. Mutates `st`; a known `st.members`
 * lets thresholds read as "4 of 7".
 */
export function classifyConfigActions(name: string, actions: ConfigActionLite[], st: ReplayState): Pick<OverwatchEvent, "type" | "severity" | "weakening" | "title" | "explanation"> {
  const parts: string[] = []; // short phrases for the title
  const why: string[] = []; // one plain sentence per change
  const types = new Set<EventType>();
  let severity: Severity = "INFO";
  let weakening = false;
  const mark = (t: EventType, s: Severity, weak: boolean) => {
    types.add(t);
    if (SEVERITY_ORDER[s] > SEVERITY_ORDER[severity]) severity = s;
    weakening ||= weak;
  };

  // Signer changes first, so a threshold in the same transaction reads against the new signer count.
  const added = actions.flatMap((a) => (a.kind === "AddMember" ? [short(a.key)] : []));
  const removed = actions.flatMap((a) => (a.kind === "RemoveMember" ? [short(a.key)] : []));
  if (st.members !== undefined) st.members += added.length - removed.length;
  const of = (v: number) => (st.members !== undefined ? `${v} of ${st.members}` : `${v}`);
  if (added.length || removed.length) {
    if (added.length) { parts.push(`added ${plural(added.length, "signer")}`); why.push(`${added.join(", ")} can now approve changes.`); }
    if (removed.length) { parts.push(`removed ${plural(removed.length, "signer")}`); why.push(`${removed.join(", ")} can no longer approve changes.`); }
    if (st.members !== undefined) why.push(`The multisig now has ${st.members} signers.`);
    mark("MEMBERS_CHANGED", "MEDIUM", true);
  }

  for (const a of actions) {
    if (a.kind === "SetTimeLock") {
      const was = st.timeLockSec, v = a.newTimeLock;
      st.timeLockSec = v;
      if (was === undefined) {
        parts.push(v === 0 ? "set no safety delay" : `set its safety delay to ${fmtDuration(v)}`);
        why.push(v === 0 ? `Approved changes take effect immediately, with no time for depositors to react. ${UNKNOWN_BEFORE}` : `Approved changes wait ${fmtDuration(v)} before they take effect. ${UNKNOWN_BEFORE}`);
        mark("MULTISIG_CONFIG_EXECUTED", v === 0 ? "HIGH" : "MEDIUM", v === 0);
      } else if (v > was) {
        parts.push(`lengthened its safety delay from ${fmtDuration(was)} to ${fmtDuration(v)}`);
        why.push(`Approved changes now wait ${fmtDuration(v)} before they take effect, which gives depositors more time to react.`);
        mark("TIMELOCK_INCREASED", "INFO", false);
      } else if (v < was) {
        parts.push(v === 0 ? `removed its ${fmtDuration(was)} safety delay` : `cut its safety delay from ${fmtDuration(was)} to ${fmtDuration(v)}`);
        why.push(v === 0 ? "Approved changes now take effect immediately. Depositors get no warning before they land." : `Approved changes now take effect after only ${fmtDuration(v)}, so depositors have less time to withdraw if a bad one passes.`);
        mark(v === 0 ? "TIMELOCK_REMOVED" : "TIMELOCK_REDUCED", v === 0 ? "CRITICAL" : "HIGH", true);
      }
    } else if (a.kind === "ChangeThreshold") {
      const was = st.threshold, v = a.newThreshold;
      st.threshold = v;
      if (was === undefined) {
        parts.push(`set approvals needed to ${of(v)}`);
        why.push(`Every change now needs ${of(v)} signers to approve it. ${UNKNOWN_BEFORE}`);
        mark("MULTISIG_CONFIG_EXECUTED", v <= 2 ? "HIGH" : "MEDIUM", v <= 2);
      } else if (v > was) {
        parts.push(`raised approvals needed from ${was} to ${of(v)}`);
        why.push("More signers must approve each change, so more keys would have to be stolen or collude to push one through.");
        mark("THRESHOLD_RAISED", "INFO", false);
      } else if (v < was) {
        parts.push(`lowered approvals needed from ${was} to ${of(v)}`);
        why.push("Fewer signers must approve each change, so fewer keys would have to be stolen or collude to push one through.");
        mark("THRESHOLD_LOWERED", v <= 2 ? "CRITICAL" : "HIGH", true);
      }
    } else if (a.kind === "SetRentCollector") {
      parts.push("changed where its rent refunds go");
      why.push("This doesn't change who controls the protocol.");
      mark("MULTISIG_CONFIG_EXECUTED", "INFO", false);
    } else if (a.kind === "Other") {
      parts.push(`ran "${a.name}"`);
      mark("MULTISIG_CONFIG_EXECUTED", "INFO", false);
    }
  }
  if (!parts.length) { parts.push("re-applied its existing multisig settings"); why.push("Nothing about who controls the protocol changed."); }
  const type = types.size === 1 ? [...types][0]! : "MULTISIG_CONFIG_EXECUTED";
  return { type, severity, weakening, title: `${name} ${andJoin(parts)}`, explanation: why.join(" ") };
}

export function actionWeakens(ms: Pick<MultisigFacts, "threshold" | "timeLockSec">, a: ConfigActionLite): string | null {
  if (a.kind === "ChangeThreshold" && a.newThreshold < ms.threshold) return `lower the threshold to ${a.newThreshold}`;
  if (a.kind === "SetTimeLock" && a.newTimeLock < ms.timeLockSec) return a.newTimeLock === 0 ? "remove the safety delay" : `cut the safety delay to ${fmtDuration(a.newTimeLock)}`;
  if (a.kind === "AddMember") return `add signer ${short(a.key)}`;
  return null;
}

/** Pure diff: prev snapshot (or null for first sighting) → typed events. */
export function diffSnapshots(prev: ControlSnapshot | null, next: ControlSnapshot, ctx: DiffContext): OverwatchEvent[] {
  const name = ctx.name;
  const drafts: Draft[] = [];

  // Upgrade authority
  for (const p of next.programs) {
    const q = prev?.programs.find((x) => x.programId === p.programId);
    if (!q) continue;
    if (q.upgradeAuthority !== p.upgradeAuthority) {
      if (p.upgradeAuthority === null) {
        drafts.push(ev("PROGRAM_MADE_IMMUTABLE", "INFO", false, `${name}'s ${p.label} can no longer be upgraded`,
          `The upgrade authority was removed. Nobody can change this program's code anymore.`, { authority: q.upgradeAuthority }, { authority: null }));
      } else if (p.authorityKind === "SINGLE_KEY" && q.authorityKind !== "SINGLE_KEY") {
        drafts.push(ev("AUTHORITY_BECAME_SINGLE_KEY", "CRITICAL", true, `One private key now controls ${name}'s ${p.label}`,
          `Control of the program moved from a ${q.authorityKind.replaceAll("_", " ").toLowerCase()} to a single key (${short(p.upgradeAuthority)}). Whoever holds that key can replace the code and move deposits.`,
          { authority: q.upgradeAuthority, kind: q.authorityKind }, { authority: p.upgradeAuthority, kind: p.authorityKind }));
      } else {
        drafts.push(ev("UPGRADE_AUTHORITY_CHANGED", "CRITICAL", true, `${name}'s ${p.label} has a new owner`,
          `The key that can replace this program's code changed from ${short(q.upgradeAuthority)} to ${short(p.upgradeAuthority)}. Check that this migration was announced.`,
          { authority: q.upgradeAuthority, kind: q.authorityKind }, { authority: p.upgradeAuthority, kind: p.authorityKind }));
      }
    } else if (q.lastDeploySlot !== p.lastDeploySlot) {
      drafts.push(ev("PROGRAM_UPGRADED", "MEDIUM", false, `${name} deployed new code to its ${p.label}`,
        `The program was upgraded at slot ${p.lastDeploySlot}. Routine upgrades are normal; unannounced ones deserve a look.`,
        { slot: q.lastDeploySlot }, { slot: p.lastDeploySlot }));
    }
  }

  // Multisig config (compare by role, so migrations count)
  const pr = byRole(prev);
  for (const [role, b] of byRole(next)) {
    const a = pr.get(role);
    if (a) drafts.push(...diffMultisig(name, a, b));
    else if (prev && b.configAuthority)
      drafts.push(ev("CONFIG_AUTHORITY_SET", "HIGH", true, `A single key can rewrite ${name}'s multisig`,
        `Key ${short(b.configAuthority)} is the config authority of this multisig and can change signers, threshold and delay without a vote.`, null, { configAuthority: b.configAuthority }));
  }

  // Pending weakening proposals (new ones only)
  for (const ms of next.multisigs) {
    const before = new Set(prev?.multisigs.find((x) => x.address === ms.address)?.pending.map((p) => p.transactionIndex) ?? []);
    for (const p of ms.pending) {
      if (before.has(p.transactionIndex)) continue;
      const bad = p.actions.map((a) => actionWeakens(ms, a)).filter((x): x is string => !!x);
      if (bad.length)
        drafts.push(ev("PROPOSAL_WEAKENS_CONTROLS", "HIGH", true, `${name} has a pending vote to ${bad[0]}`,
          `Proposal #${p.transactionIndex} would ${bad.join(" and ")}. It has not executed yet. This is your early warning.`, null, p));
    }
  }

  // Durable nonce accounts tied to signers
  const signerSet = new Set(next.multisigs.flatMap((m) => m.members.map((x) => x.key)));
  const prevNonces = new Set(prev?.nonces.map((n) => n.address) ?? []);
  const nextNonces = new Set(next.nonces.map((n) => n.address));
  const exposed = new Set(next.nonces.filter((n) => signerSet.has(n.authority)).map((n) => n.authority));
  const minThreshold = Math.min(...next.multisigs.map((m) => m.threshold), Infinity);
  if (prev) {
    for (const n of next.nonces) {
      if (prevNonces.has(n.address)) continue;
      const crit = exposed.size >= minThreshold;
      drafts.push(ev("SIGNER_NONCE_ACCOUNT_CREATED", crit ? "CRITICAL" : "HIGH", true,
        crit ? `Enough ${name} signers to pass a vote now hold never-expiring transactions` : `A signer of ${name} created a never-expiring transaction account`,
        `Signer ${short(n.authority)} controls a durable nonce account (${short(n.address)}). Transactions signed with it never expire and can be executed later, as happened in the Drift hack. ${exposed.size} signer(s) now have one; ${minThreshold === Infinity ? "?" : minThreshold} are needed to approve changes.`,
        null, { nonce: n.address, authority: n.authority, exposedSigners: exposed.size }));
    }
    for (const a of prevNonces) {
      if (!nextNonces.has(a))
        drafts.push(ev("SIGNER_NONCE_ACCOUNT_CLOSED", "INFO", false, `A signer of ${name} closed a durable nonce account`, `Nonce account ${short(a)} no longer exists.`, { nonce: a }, null));
    }
  }

  // Collateral & oracles (new risks only)
  const prevMints = new Map((prev?.mints ?? []).map((m) => [m.address, mintRisks(m)]));
  for (const m of next.mints) {
    const r = mintRisks(m).filter((x) => x !== "FreezeAuthority" || m.tokenProgram === "token-2022");
    const old = new Set(prevMints.get(m.address) ?? []);
    const fresh = r.filter((x) => !old.has(x) && ["PermanentDelegate", "TransferHook", "DefaultFrozen", "FreezeAuthority", "Pausable"].includes(x));
    if (prev && fresh.length)
      drafts.push(ev("COLLATERAL_RISKY_EXTENSION", "HIGH", true, `${name} collateral ${short(m.address)} has risky token powers`,
        `This token has ${fresh.join(", ")}. Its issuer could freeze, seize or block transfers of the collateral backing your deposit.`, null, m));
  }
  const prevOr = new Set((prev?.oracles ?? []).filter((o) => o.deprecated).map((o) => o.address));
  for (const o of next.oracles) {
    if (prev && o.deprecated && !prevOr.has(o.address))
      drafts.push(ev("ORACLE_DEPRECATED", "HIGH", true, `${name} relies on a shut-down price feed`,
        `Oracle ${short(o.address)} belongs to ${o.kind}, which stopped operating. Stale prices can be exploited to borrow against fake value.`, null, o));
  }

  // Admin params (adapter-specific)
  for (const ad of next.admin) {
    const old = prev?.admin.find((x) => x.account === ad.account);
    if (!old) continue;
    if (old.admin !== ad.admin)
      drafts.push(ev("ADMIN_PARAM_CHANGED", "HIGH", true, `${name}'s admin key changed`, `Admin moved from ${short(old.admin)} to ${short(ad.admin)}.`, { admin: old.admin }, { admin: ad.admin }));
    for (const [k, v] of Object.entries(ad.params)) {
      if (old.params[k] !== v)
        drafts.push(ev("ADMIN_PARAM_CHANGED", "MEDIUM", false, `${name} changed setting "${k}"`, `${k}: ${String(old.params[k])} → ${String(v)}.`, { [k]: old.params[k] }, { [k]: v }));
    }
    const newMints = ad.mints.filter((m) => !old.mints.includes(m));
    if (newMints.length)
      drafts.push(ev("ADMIN_PARAM_CHANGED", "HIGH", true, `${name} listed ${newMints.length} new collateral token(s)`, `New collateral: ${newMints.map(short).join(", ")}. A fake token listing with a manipulated oracle was the final step of the Drift drain.`, null, { mints: newMints }));
  }

  // MEMBERS_CHANGED escalates to HIGH with a threshold change within 7 days
  const now = Date.parse(ctx.now);
  const hasThresholdNow = drafts.some((d) => d.type === "THRESHOLD_LOWERED");
  const recentThreshold = ctx.history.some((h) => h.type === "THRESHOLD_LOWERED" && now - Date.parse(h.blockTime ?? h.detectedAt) <= 7 * DAY);
  for (const d of drafts) if (d.type === "MEMBERS_CHANGED" && (hasThresholdNow || recentThreshold)) d.severity = "HIGH";

  // Compound "Drift pattern": weakening within 14 days of a signer nonce account
  const nonceNow = drafts.some((d) => d.type === "SIGNER_NONCE_ACCOUNT_CREATED");
  const recentNonce = ctx.history.some((h) => h.type === "SIGNER_NONCE_ACCOUNT_CREATED" && now - Date.parse(h.blockTime ?? h.detectedAt) <= 14 * DAY);
  const recentWeakening = ctx.history.some((h) => h.weakening && h.type !== "SIGNER_NONCE_ACCOUNT_CREATED" && SEVERITY_ORDER[h.severity] >= SEVERITY_ORDER.HIGH && now - Date.parse(h.blockTime ?? h.detectedAt) <= 14 * DAY);
  for (const d of drafts) {
    const isNonce = d.type === "SIGNER_NONCE_ACCOUNT_CREATED";
    if (d.weakening && ((!isNonce && (recentNonce || nonceNow)) || (isNonce && recentWeakening))) {
      d.severity = "CRITICAL";
      d.labels = [...(d.labels ?? []), "Drift pattern"];
      if (!d.explanation.includes("Drift pattern"))
        d.explanation += " ⚠ Drift pattern: controls weakened within 14 days of a signer creating durable nonce accounts — the exact sequence that preceded the $285M Drift drain.";
    }
  }

  return drafts.map((d) => ({
    ...d,
    labels: d.labels ?? [],
    protocol: next.protocol,
    slot: ctx.slot,
    blockTime: ctx.blockTime,
    txSignature: ctx.txSignature ?? null,
    detectedAt: ctx.now,
  }));
}
