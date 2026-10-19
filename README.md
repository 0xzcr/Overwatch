# Overwatch

**An early-warning system for people with deposits in Solana DeFi.**

Overwatch watches the _control plane_ of the protocols holding your money: who can upgrade the program, how many
signers a change needs, how long an approved change waits before it takes effect, which signers hold durable nonce
accounts (pre-signed transactions that never expire), risky Token-2022 collateral and dead oracles. When those controls
get weaker, it tells you, in plain English, with the account address and slot so you can check it yourself.

Live site: **https://overwatch-chi.vercel.app**

> Overwatch reads **authority, not code**. It does not audit programs or track prices, TVL, solvency, bad debt or
> exploits in progress. It warns **after** a change lands onchain and cannot undo it. Protocols off the watch list are
> invisible to it, and key hygiene and social engineering happen off-chain where it cannot see.

## Why

On April 1, 2026, Drift lost about $285M in twelve minutes without a single smart-contract bug. The attacker collected
pre-signed durable-nonce transactions from two of five Security Council signers, waited, and used them to take admin.
Every step sat on Solana, in public, for days. Nobody was reading it on the depositor's behalf. On Solana, "who controls
this protocol" is literally bytes at a known offset in an account, so anyone can read it. Overwatch does, continuously.

The site's [case study](https://overwatch-chi.vercel.app/case-study) replays that timeline through Overwatch's current
rules. It is a **backtest** on a timeline reconstructed from public incident reports, not a live catch.

## What it does

|                      |                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Control map**      | Grades (A–F, 0–100) for the top Solana protocols. Every point lost is an itemised deduction with a reason.                                       |
| **Live events**      | Every change to who controls a watched protocol, caught live over websockets, plus 180 days of history rebuilt from chain data.                  |
| **Alerts**           | Telegram bot, HMAC-signed webhooks with retries, and email. Each alert says what changed, why it matters and what to do.                         |
| **API**              | Versioned REST (`/api/v1`), a Server-Sent Events stream and a small TypeScript SDK.                                                              |
| **Onchain registry** | Scores and risk flags published to Solana accounts (devnet), so any program can read them and act, e.g. a vault that exits when a protocol turns red. |

## Quickstart

You need Node 22, pnpm 11 and Docker (for a local Postgres).

```sh
git clone https://github.com/0xzcr/Overwatch.git && cd Overwatch
pnpm install
cp .env.example .env               # the defaults work for local development
docker compose up -d               # Postgres 16 on localhost:5433
pnpm db:migrate                    # create the tables
pnpm seed                          # verify the watch list against mainnet and store the first snapshots
pnpm --filter @overwatch/web dev   # http://localhost:3000
```

Without a database the site still runs: every page falls back to a dated mainnet snapshot and says so.

To see the whole pipeline (rules → events → alerts) without touching any RPC:

```sh
pnpm smoke:pipeline
```

To run everything live, also start the indexer and the bot in their own terminals:

```sh
pnpm --filter @overwatch/indexer dev   # watches mainnet; health on http://localhost:8787/health
pnpm --filter @overwatch/bot dev       # Telegram bot + webhook/email delivery worker
```

A free [Helius](https://helius.dev) key in `HELIUS_API_KEY` makes the indexer and the seed far more reliable than the
public RPC. [CONTRIBUTING.md](CONTRIBUTING.md) has the full setup, every environment variable, and how to deploy.

## Repository

```
apps/
  web/        Next.js 15 site and public API (Vercel)
  indexer/    long-running mainnet watcher: websockets → snapshots → rules → scores → publish (Fly)
  bot/        Telegram bot and the alert delivery worker for Telegram, webhooks and email (Fly)
packages/
  core/       pure logic: account decoders, rules engine, scoring, Squads/Token-2022 parsing (no I/O)
  solana/     minimal read-only JSON-RPC client and reconnecting websocket manager
  db/         Postgres schema (Drizzle), queries, and the ingest pipeline
  sdk/        TypeScript SDK: API client, webhook verification, registry and vault instructions
programs/     Anchor programs: overwatch_registry, overwatch_vault
config/       protocols.yaml, the curated watch list
scripts/      seed, backfill, inspect, stats and fixtures
fixtures/     real account bytes and IDLs captured from mainnet, used by the tests
```

[ARCHITECTURE.md](ARCHITECTURE.md) explains every part of this in depth: the data flow, account layouts, the rules,
scoring, the database, the indexer, alerts, the API, the onchain programs and the website.

## Checks

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test   # what CI runs, plus the pipeline smoke test
pnpm --filter @overwatch/web e2e                                  # Playwright, against a running dev server
cargo test -p overwatch_registry -p overwatch_vault               # onchain programs (after `anchor build`)
```

## How grades work

Every protocol starts at 100. Deductions: a single-key upgrade authority (−60), no timelock (−25), a timelock under 24h
(−15) or 48h (−5), two or fewer signatures needed (−20) or under half the signers (−10), a multisig a single key can
reconfigure (−20), signers holding durable nonce accounts (−10 each, up to −30), a pending proposal that would weaken
controls (−10), a HIGH or CRITICAL weakening in the last 30 days (−10), risky collateral or deprecated oracles (−10 each,
up to −20), and control Overwatch cannot attribute (−15, because unknown is not safe). Grades: A ≥ 85, B ≥ 70, C ≥ 55,
D ≥ 40, F below. A protocol is **red** if one key can upgrade it, a multisig has no timelock and needs two or fewer
signatures, a signer holds a durable nonce account, or it had a CRITICAL weakening in the last 30 days.

The published [documentation](https://overwatch-chi.vercel.app/docs#scoring) is the source of truth for these rules. A
protocol can never pay for a score.

## License

No license has been chosen yet; all rights are reserved until one is added.
