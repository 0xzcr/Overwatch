// Animated HTML/SVG "product footage" for cards, headliners and the modal.
// Pure string renderers (seeded), so the server and client produce identical markup.
// Motion is CSS-only and pauses offscreen.

import { mulberry, hash, type Rand } from "./engine/rand";
import { flagBits, type Capability, type TermLine } from "./content";
import { GRADE_WORD } from "@/lib/format";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (r: Rand, n = 4) => {
  let a = "", b = "";
  for (let i = 0; i < n; i++) a += B58[Math.floor(r() * B58.length)];
  for (let i = 0; i < n; i++) b += B58[Math.floor(r() * B58.length)];
  return `${a}…${b}`;
};

const KIND_GLYPH: Record<TermLine[0], string> = { $: "›", i: "·", w: "!", e: "✕", s: "✓" };

const DEFAULT_TERM: TermLine[] = [
  ["$", "ow watch --all"],
  ["i", "15 protocols · 42 accounts · 96 signers"],
  ["i", "snapshot → diff → score"],
  ["s", "no weakening events in the last hour"],
];

function terminal(u: Capability) {
  const lines = u.term ?? DEFAULT_TERM;
  return `
  <div class="vz vz-term">
    <div class="vz-win"><i></i><i></i><i></i><span>overwatch — ${esc(u.chapter)}</span></div>
    <ol class="vz-term__lines">
      ${lines.map(([k, t], i) => `<li class="t-${k === "$" ? "cmd" : k}" style="--i:${i}"><span class="t-k">${KIND_GLYPH[k]}</span><span class="t-x">${esc(t)}</span></li>`).join("")}
    </ol>
  </div>`;
}

function radar(_u: Capability, r: Rand) {
  const blips = Array.from({ length: 6 }, (_, i) => {
    const a = r() * 360, d = 18 + r() * 28;
    return `<i class="${i < 2 ? "hot" : ""}" style="--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}%;--delay:${(r() * 3).toFixed(2)}s"></i>`;
  }).join("");
  return `
  <div class="vz vz-radar">
    <div class="vz-radar__scope">
      <span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
      <span class="cross"></span><span class="sweep"></span>${blips}
    </div>
    <div class="vz-radar__read mono">
      <span>WATCHING <b>15</b></span>
      <span>SIGNERS <b>96</b></span>
      <span class="hot">NONCES <b>2</b></span>
    </div>
  </div>`;
}

function code(u: Capability) {
  const lines = u.codeLines ?? ["  // overwatch", "+ watch(protocol)"];
  return `
  <div class="vz vz-diff">
    <div class="vz-win"><i></i><i></i><i></i><span>${u.chapter === "act" || u.chapter === "build" ? "src/lib.rs" : "snapshot.diff"}</span><em class="mono">${esc(u.code)}</em></div>
    <ol>
      ${lines
        .map((l, i) => {
          const k = l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "ctx";
          return `<li class="d-${k}" style="--i:${i}"><span>${i + 12}</span><b>${k === "add" ? "+" : k === "del" ? "−" : ""}</b><code>${esc(l.replace(/^[+-]/, "").replace(/^ /, ""))}</code></li>`;
        })
        .join("")}
    </ol>
  </div>`;
}

function gauge(u: Capability) {
  const score = u.chapter === "map" ? 70 : u.chapter === "build" ? 85 : 85;
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : "C";
  const C = 2 * Math.PI * 42;
  const rows =
    u.chapter === "map"
      ? [["Upgrade authority", "Program PDA"], ["Mapped", "No"], ["Deduction", "−15"]]
      : [["Multisig", "5-of-10"], ["Timelock", "1 day"], ["Nonce signers", "0"]];
  return `
  <div class="vz vz-gauge">
    <div class="vz-gauge__dial">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" class="track" />
        <circle cx="50" cy="50" r="42" class="val" style="stroke-dasharray:${C.toFixed(1)};--off:${(C * (1 - score / 100)).toFixed(1)};--len:${C.toFixed(1)}" />
        <g class="ticks">${Array.from({ length: 40 }, (_, i) => `<line x1="50" y1="3" x2="50" y2="${i % 5 ? 6 : 8}" transform="rotate(${i * 9} 50 50)"/>`).join("")}</g>
      </svg>
      <div class="vz-gauge__num"><b>${grade}</b><span class="mono">${score} · ${GRADE_WORD[grade]}</span></div>
    </div>
    <ul class="vz-gauge__rows mono">${rows.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join("")}</ul>
  </div>`;
}

function chart(u: Capability, r: Rand) {
  const W = 300, H = 120;
  const pts: number[] = [];
  let v = 82;
  const drop = 18 + Math.floor(r() * 12);
  for (let i = 0; i < 40; i++) {
    v += (r() - 0.5) * 3;
    v = Math.max(70, Math.min(92, v));
    pts.push(i < drop ? v : i < drop + 6 ? 55 + (r() - 0.5) * 3 : 70 + (r() - 0.5) * 4);
  }
  const path = pts.map((p, i) => `${i ? "L" : "M"}${((i / 39) * W).toFixed(1)},${(H - (p / 100) * H).toFixed(1)}`).join(" ");
  const sx = ((drop / 39) * W).toFixed(1);
  const label = u.chapter === "watch" ? "threshold 4 → 2" : "score";
  return `
  <div class="vz vz-chart">
    <div class="vz-chart__head mono"><span>${esc(u.title)}</span><b class="hot">▼ ${label}</b></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="g-${u.code}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".4"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      ${[0.25, 0.5, 0.75].map((y) => `<line class="grid" x1="0" x2="${W}" y1="${H * y}" y2="${H * y}"/>`).join("")}
      <line class="limit" x1="0" x2="${W}" y1="${H * 0.3}" y2="${H * 0.3}"/>
      <path class="area" d="${path} L${W},${H} L0,${H} Z" fill="url(#g-${u.code})"/>
      <path class="line" d="${path}" pathLength="1"/>
      <line class="mark" x1="${sx}" x2="${sx}" y1="0" y2="${H}"/>
    </svg>
    <div class="vz-chart__foot mono"><span>A · 85</span><span>slot +${drop * 1200}</span><span class="hot">C · 55</span></div>
  </div>`;
}

function nodes(_u: Capability, r: Rand) {
  // layered control graph: program → authority → multisig → signers → nonce
  const layers = [1, 1, 1, 5, 2];
  const ns: { x: number; y: number; l: number; bad: boolean }[] = [];
  layers.forEach((c, l) => {
    for (let i = 0; i < c; i++) {
      ns.push({ x: 26 + l * 62, y: 80 + (i - (c - 1) / 2) * (c > 3 ? 26 : 40), l, bad: l === 4 || (l === 3 && i < 2) });
    }
  });
  const edges: [number, number][] = [];
  ns.forEach((n, i) => {
    if (n.l === 0) return;
    const parents = ns.map((p, j) => [p, j] as const).filter(([p]) => p.l === n.l - 1);
    const pick = n.l === 4 ? parents[(ns.filter((x) => x.l === 4).indexOf(n)) % parents.length] : parents[Math.floor(r() * parents.length)];
    if (pick) edges.push([pick[1], i]);
  });
  const labels = ["program", "authority", "squads 2/5", "signers", "nonces"];
  return `
  <div class="vz vz-nodes">
    <svg viewBox="0 0 300 160">
      ${edges
        .map(([a, b], k) => {
          const A = ns[a]!, B = ns[b]!;
          return `<path class="${B.bad ? "hot" : ""}" d="M${A.x},${A.y} C${A.x + 30},${A.y} ${B.x - 30},${B.y} ${B.x},${B.y}" style="--d:${(k * 0.15).toFixed(2)}s"/>`;
        })
        .join("")}
      ${ns.map((n, i) => `<circle class="${n.bad ? "bad" : ""} l${n.l}" cx="${n.x}" cy="${n.y}" r="${n.l === 0 ? 7 : 4.5}" style="--d:${(i * 0.12).toFixed(2)}s"/>`).join("")}
      ${labels.map((t, l) => `<text x="${26 + l * 62}" y="154" text-anchor="middle">${t}</text>`).join("")}
    </svg>
    <div class="vz-nodes__legend mono"><span><i class="bad"></i> exposed ${addr(r, 3)}</span><span><i></i> verified</span></div>
  </div>`;
}

const DEFAULT_ALERTS: Capability["alerts"] = [
  ["crit", "Removed its 2 days safety delay", "Overwatch Demo · devnet"],
  ["high", "Pending vote to lower the threshold to 2", "proposal #14 · not executed"],
  ["ok", "Lengthened its safety delay to 1 day", "good for depositors"],
];

function alerts(u: Capability) {
  const list = u.alerts ?? DEFAULT_ALERTS ?? [];
  return `
  <div class="vz vz-alerts">
    ${list
      .map(
        ([lvl, t, s], i) => `
      <div class="vz-alert lvl-${lvl}" style="--i:${i}">
        <span class="vz-alert__lvl mono">${lvl === "crit" ? "CRITICAL" : lvl === "med" ? "MEDIUM" : lvl.toUpperCase()}</span>
        <div><b>${esc(t)}</b><span class="mono">${esc(s)}</span></div>
        <time class="mono">${i * 4 + 2}s</time>
      </div>`,
      )
      .join("")}
  </div>`;
}

function pipeline(u: Capability) {
  const flows: Record<string, [string[], number, string, string]> = {
    act: [["event", "score", "publish", "registry", "check_and_exit", "idle"], 6, "Shield triggered", "position moved to idle · permissionless"],
    build: [["signatures", "loader ix", "squads cfg", "diff", "events", "timeline"], 6, "Backfill complete", "180 days · 2 programs · 1 multisig"],
    watch: [["deploy", "programdata", "slot diff", "rules", "alert"], 5, "PROGRAM_UPGRADED", "MEDIUM · unannounced upgrades deserve a look"],
    score: [["snapshot", "deductions", "flags", "grade", "publish"], 5, "Tests passing", "includes Drift timeline replay"],
  };
  const [steps, done, head, msg] = flows[u.chapter] ?? flows.act!;
  return `
  <div class="vz vz-pipe">
    <div class="vz-pipe__head mono"><span>${esc(u.title.toLowerCase())}</span><b>${esc(head)}</b></div>
    <ol>${steps.map((s, i) => `<li class="${i < done ? "ok" : "skip"}" style="--i:${i}"><i></i><span class="mono">${esc(s)}</span></li>`).join("")}</ol>
    <div class="vz-pipe__msg mono"><span class="dot dot--live"></span> ${esc(msg)}</div>
  </div>`;
}

const TOGGLES: Record<string, [string, string, boolean][]> = {
  map: [["PermanentDelegate", "can seize balances", false], ["TransferHook", "program on every transfer", true], ["DefaultAccountState", "frozen by default", true], ["Pausable", "issuer can pause", true]],
  watch: [["ChangeThreshold → 2", "proposal #14", false], ["SetTimeLock → 0", "proposal #15", false], ["AddMember 4Fq…a9P", "proposal #16", false], ["Executed", "not yet", true]],
  warn: [["CRITICAL", "always", true], ["HIGH", "default", true], ["MEDIUM", "upgrades & signer changes", false], ["LOW", "everything", false]],
  act: [["Remove timelock", "2 days → none", true], ["Lower threshold", "3 → 1", false], ["Transfer authority", "to a single key", false], ["Create signer nonce", "signer-A", false]],
};
function toggles(u: Capability) {
  const list = TOGGLES[u.chapter] ?? TOGGLES.warn!;
  const head = u.chapter === "map" ? ["mint.token-2022", "4 extensions"] : u.chapter === "watch" ? ["squads.pending", "WEAKENING"] : u.chapter === "act" ? ["demo.devnet", "ARMED"] : ["subscription", "HIGH+"];
  return `
  <div class="vz vz-toggles">
    <div class="vz-toggles__head mono"><span>${head[0]}</span><b>${head[1]}</b></div>
    ${list
      .map(
        ([t, s, on], i) => `
      <div class="vz-toggle ${on ? "on" : "off"} ${u.chapter === "map" && !on ? "risk" : ""}" style="--i:${i}">
        <div><b>${esc(t)}</b><span class="mono">${esc(s)}</span></div>
        <span class="sw"><i></i></span>
      </div>`,
      )
      .join("")}
  </div>`;
}

function bits() {
  const on = new Set([1, 2, 10]);
  const red = new Set([0, 4, 10, 11]);
  return `
  <div class="vz vz-bits">
    <div class="vz-bits__head mono"><span>flags: u64</span><b>0x406 · RED</b></div>
    <ol>${flagBits
      .map((f, i) => `<li class="${on.has(i) ? "on" : ""} ${red.has(i) ? "mask" : ""}" style="--i:${i}"><b class="mono">${i}</b><span class="mono">${f.replaceAll("_", " ").toLowerCase()}</span></li>`)
      .join("")}</ol>
    <div class="vz-bits__foot mono"><span>flags &amp; RED_MASK (0xC11)</span><b>≠ 0 → exit</b></div>
  </div>`;
}

function chat() {
  return `
  <div class="vz vz-chat">
    <div class="vz-chat__top"><span class="vz-chat__av"><svg viewBox="0 0 64 64"><use href="#ow-mark"/></svg></span><div><b>Overwatch</b><span class="mono">bot</span></div></div>
    <div class="vz-chat__msgs">
      <p class="me" style="--i:0">/watch drift</p>
      <p style="--i:1">Watching Drift Protocol. Alerts at HIGH and above.</p>
      <p class="me" style="--i:2">/status drift</p>
      <p style="--i:3"><b>Drift Protocol</b>: grade <b>A</b> (85/100)<br/>Upgrade authority: squads v4 vault<br/>Multisig: 4-of-7, timelock 1 hour</p>
      <p class="alert" style="--i:4">🔴 <b>CRITICAL</b> · Overwatch Demo removed its 2 days safety delay</p>
    </div>
  </div>`;
}

function ledger() {
  const rows: [string, string][] = [
    ["Single upgrade key", "−60"],
    ["No timelock", "−25"],
    ["Threshold ≤ 2", "−20"],
    ["Controlled multisig", "−20"],
    ["Signer durable nonce (each)", "−10"],
    ["Pending weakening vote", "−10"],
    ["Unmapped control", "−15"],
  ];
  return `
  <div class="vz vz-ledger">
    <div class="vz-ledger__head mono"><span>score = 100</span><b>clamp(0, 100)</b></div>
    <ol>${rows.map(([a, b], i) => `<li style="--i:${i}"><span>${a}</span><b class="mono">${b}</b></li>`).join("")}</ol>
  </div>`;
}

const RENDER: Record<Capability["vis"], (u: Capability, r: Rand) => string> = {
  terminal, radar, code, gauge, chart, nodes, alerts, pipeline, toggles, bits, chat, ledger,
};

export function visual(u: Capability, color: string): string {
  const r = mulberry(hash(u.id));
  return `<div class="vis" style="--c:${color}">${RENDER[u.vis](u, r)}</div>`;
}
