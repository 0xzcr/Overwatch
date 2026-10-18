# Overwatch — project instructions

## What this is

Overwatch is an early-warning system for Solana DeFi **depositors**. It monitors the
*control plane* of a protocol — who is permitted to move user funds — and alerts when
those protections weaken.

Live site: https://overwatch-chi.vercel.app

## The premise (do not drift from this)

Overwatch does **not** monitor solvency, TVL, price, bad debt, depegs, or exploits in
progress. It monitors **authority**: upgrade authority, multisig threshold, timelock,
signer set, durable nonce accounts, Token-2022 extensions, oracle dependencies.

The claim is: on Solana, "who controls this protocol" is literally bytes at a known
offset in an account. It is readable by anyone. Before the April 1 2026 Drift drain
(~$285M in 12 minutes), the warning signs sat on-chain in public for days. Nobody was
watching on the depositor's behalf.

If a proposed feature is about *how a protocol is performing* rather than *who can
change it*, it is out of scope. Say so rather than building it.

## Positioning

The Solana Foundation launched STRIDE (April 2026) with Asymmetric Research: funded
24/7 threat monitoring for protocols over $10M TVL, formal verification over $100M.
SIRN is the incident-response collective.

Overwatch is deliberately the complement, not the competitor:
- STRIDE is **TVL-gated at $10M**. Overwatch covers the long tail below it.
- STRIDE is **protocol-side** — the protocol is the customer. At Drift, attackers had
  reportedly been inside the team for six months, which is exactly when protocol-
  commissioned monitoring fails. Overwatch answers to the depositor.
- SIRN is **response**, after funds move. Overwatch is warning, before.

## Architecture

Turborepo + pnpm monorepo.

| Component | Role | Stack |
|---|---|---|
| `overwatch_registry` | RiskRecord PDAs, publisher whitelist, stale-slot rejection | Anchor |
| `overwatch_vault` | deposit / withdraw / allocate + permissionless `check_and_exit` | Anchor |
| Indexer | reads accounts, diffs snapshots, runs rules | TS, own JSON-RPC + websocket client (`packages/solana`), `@sqds/multisig` |
| `protocols.yaml` | the curated watch list + per-protocol baselines | YAML |
| DB | snapshots, flags, events, subscriptions | Postgres + Drizzle |
| Web | control map, protocol pages, live events, case study, alerts, documentation | Next.js 15 |
| Bot | alerts | grammY (Telegram) |

## Account layouts that matter

- **ProgramData** — 45-byte header. Bytes 0–3 enum tag, 4–11 last deploy slot,
  byte 12 the Option tag, **bytes 13–44 the upgrade authority**. Always read with
  `dataSlice` — never download the whole ELF.
- **Program account** — 36 bytes, points at its ProgramData.
- **Durable nonce** — 80-byte System Program account, **authority at offset 8**.
  This is the Drift tell and most tools ignore it.
- **Squads v4** — decode via `@sqds/multisig`, never by hand. Derive vault PDAs 0–7 and
  match against the on-chain upgrade authority.
- **Token-2022 mint** — parse the extension TLV: PermanentDelegate, TransferHook,
  DefaultAccountState, Pausable.

## Rules and scoring

Scores start at 100 and clamp to 0–100. Grades: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40.
The full deduction table and event-severity table are published at `/docs#scoring` and
that page is the source of truth — keep code and page in sync, and if they diverge,
the published page is what users relied on.

The composite **Drift pattern** rule is the important one: a weakening event within 14
days of a signer creating a durable nonce account (or the reverse) escalates to
CRITICAL regardless of individual deductions.

## Non-negotiable conventions

- **Every alert and every score carries the raw account address and the slot it was
  read at.** Anyone must be able to re-fetch and recompute independently. This is the
  entire basis of trust — there is no appeal to authority here.
- **The registry rejects any record with a slot ≤ the one it holds.** History is not
  rewritable.
- **The vault only ever reads the registry.** It never trusts a signature of ours.
  `check_and_exit` is permissionless by design — do not add an admin gate to it.
- **Rules live in the repo and stay readable.** The product is auditable or it is worth
  nothing.
- **Never let a protocol pay for a score.** Sponsorship may buy listing and registered
  change windows only, and sponsors must be published.

## Honesty rules for any copy you write

Overwatch reads authority, not code. It warns *after* a change lands on-chain and
cannot undo an executed action. Detection lag is the poll interval plus confirmation.
Protocols off the watch list are invisible to it. Key hygiene and social engineering
happen off-chain where it cannot see.

Any backtest against Drift must be labelled as applying current rules to the public
record — not as a live catch. Do not let marketing copy blur this.

## Deployment state (as of 2026-10-18)

- Web: live on Vercel (functions in `syd1`), reading a Supabase Postgres in Sydney (transaction pooler for queries,
  session pooler for `LISTEN`). The demo console and protected-vault pages were removed from the site.
- Indexer and bot: written and working, run locally; Fly configs (`fly.indexer.toml`, `fly.bot.toml`, region `syd`) are
  ready but not deployed yet.
- Registry and vault: deployed on devnet; onchain publishing needs the devnet keypairs in `keys/`.

ARCHITECTURE.md explains the whole system; CONTRIBUTING.md covers setup, workflow and deployment; TODO.md lists what is
incomplete.
