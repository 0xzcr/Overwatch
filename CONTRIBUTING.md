# Contributing to Overwatch

Thanks for helping. This guide takes you from a fresh clone to a running system, explains every environment
variable, walks through the common kinds of change step by step, and covers deployment and troubleshooting. Read
[ARCHITECTURE.md](ARCHITECTURE.md) alongside it when you need to know _why_ something is built the way it is.

## Contents

1. [Before you start: what Overwatch is (and is not)](#1-before-you-start-what-overwatch-is-and-is-not)
2. [Prerequisites](#2-prerequisites)
3. [First-time setup](#3-first-time-setup)
4. [Environment variables](#4-environment-variables)
5. [Running each part](#5-running-each-part)
6. [The database](#6-the-database)
7. [Day-to-day workflow](#7-day-to-day-workflow)
8. [Code conventions](#8-code-conventions)
9. [Tests](#9-tests)
10. [Recipes for common changes](#10-recipes-for-common-changes)
11. [The devnet registry, vault and demo](#11-the-devnet-registry-vault-and-demo)
12. [Deploying](#12-deploying)
13. [Troubleshooting](#13-troubleshooting)
14. [Reporting security issues](#14-reporting-security-issues)

---

## 1. Before you start: what Overwatch is (and is not)

Overwatch monitors **authority**: who can change a Solana protocol that holds user deposits. Upgrade authorities,
multisig thresholds, timelocks, signer sets, durable nonce accounts, Token-2022 extensions on collateral, and oracle
dependencies. It alerts when those protections get weaker.

It does **not** monitor solvency, TVL, prices, bad debt, depegs or exploits in progress. If a feature you want to build
is about _how a protocol is performing_ rather than _who can change it_, it is out of scope; please open an issue to
discuss it before writing code.

Four rules are non-negotiable, because the whole product rests on them:

- **Every alert and every score carries the raw account address and the slot it was read at.** Anyone must be able to
  re-fetch the account and recompute the result. There is no appeal to authority.
- **The rules live in this repository and stay readable.** If a grade cannot be explained by reading
  `packages/core/src/scoring.ts` and `packages/core/src/rules.ts`, it is a bug.
- **Copy stays honest.** Overwatch warns _after_ a change lands onchain and cannot undo it. Anything about the Drift
  incident is a **backtest** of current rules on the public record and must say so. Nothing illustrative is presented
  as live data.
- **A protocol can never pay for a score.**

## 2. Prerequisites

| Tool        | Version          | Needed for                                                                    |
| ----------- | ---------------- | ----------------------------------------------------------------------------- |
| Node.js     | 22.x             | everything (the repo pins `engines.node` to 22)                               |
| pnpm        | 11.3.0           | the workspace; run `corepack enable` and pnpm installs itself from `packageManager` |
| Docker      | any recent       | a local Postgres via `docker compose`                                         |
| Git         | any              |                                                                               |
| Rust        | stable           | only for the onchain programs in `programs/`                                  |
| Solana CLI  | stable (Agave)   | only for the onchain programs and the devnet demo                             |
| Anchor CLI  | 1.1.2            | only for the onchain programs (`cargo install --git https://github.com/solana-foundation/anchor --tag v1.1.2 anchor-cli --locked`) |

Optional accounts: a free [Helius](https://helius.dev) API key (strongly recommended), a Telegram bot token from
[@BotFather](https://t.me/BotFather), a [Resend](https://resend.com) key for email, and a
[Supabase](https://supabase.com) project if you want a hosted database.

## 3. First-time setup

```sh
git clone https://github.com/0xzcr/Overwatch.git
cd Overwatch
corepack enable            # makes the pinned pnpm version available
pnpm install               # installs every workspace package
cp .env.example .env       # local defaults; fill in keys as you need them (section 4)
docker compose up -d       # Postgres 16 on localhost:5433 (user/password/db: overwatch)
pnpm db:migrate            # creates the tables
pnpm seed                  # reads config/protocols.yaml, verifies each protocol on mainnet, stores snapshots + scores
pnpm smoke:pipeline        # proves rules → events → NOTIFY → signed webhook works, without any RPC
pnpm --filter @overwatch/web dev   # http://localhost:3000
```

What each step does:

- `pnpm seed` (`scripts/seed-protocols.ts`) is the only step that touches mainnet. For every protocol in
  `config/protocols.yaml` it reads the program accounts, re-derives the Squads vault PDAs to prove each listed multisig
  really controls the program, fetches TVL from DefiLlama (display only), stores the protocol, its watched accounts, a
  first snapshot and a first score, and prints a verification table. A protocol that fails any check is stored with
  `verified = false` and the indexer ignores it. It is safe to run again; it updates rows in place.
- `pnpm smoke:pipeline` (`scripts/dev/pipeline-smoke.ts`) creates a throwaway protocol, feeds a "timelock removed"
  change through the real ingest pipeline, runs the delivery worker once against a local webhook receiver, checks the
  HMAC signature and the NOTIFY messages, then deletes everything it created.

Optional, for real history in the Live events feed:

```sh
pnpm backfill              # walks ~180 days of each protocol's transactions (needs HELIUS_API_KEY to finish in reasonable time)
```

## 4. Environment variables

All apps and scripts read the **repo-root** `.env` (and `.env.local`, which wins) through `packages/db/src/env.ts`, no
matter which directory they run from. A variable already set in your shell is never overwritten. `.env` and
`.env.local` are git-ignored; `.env.example` is the template and must stay in sync with the code.

### Solana RPC

| Variable | Default | What it does |
| --- | --- | --- |
| `HELIUS_API_KEY` | empty | When set, mainnet and devnet RPC and websockets go to Helius, request pacing drops from 120ms to 20ms, and the indexer subscribes at 50 per second instead of 4. |
| `SOLANA_MAINNET_RPC_URL` | empty | Explicit mainnet HTTP endpoint. **It takes priority over `HELIUS_API_KEY`**, so leave it empty to use Helius. |
| `SOLANA_MAINNET_WS_URL` | empty | Explicit mainnet websocket endpoint. Same priority rule. |
| `SOLANA_DEVNET_RPC_URL` | empty | Explicit devnet HTTP endpoint (demo, registry, vault). |
| `SOLANA_DEVNET_WS_URL` | empty | Explicit devnet websocket endpoint. |

### Database

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://overwatch:overwatch@localhost:5433/overwatch` | Every query. Locally the Docker Postgres; on Supabase see [section 6](#6-the-database). |
| `DIRECT_URL` | `DATABASE_URL` | A connection that can hold a session: `LISTEN` (the live event stream) and migrations. Set it when `DATABASE_URL` is a transaction pooler (port 6543). |

### Alerts

| Variable | Default | What it does |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | empty | The bot only starts when set. The delivery worker still sends webhooks and email without it. |
| `TELEGRAM_BOT_USERNAME` | empty | Without the `@`. The site shows "Open @name" buttons only when set. |
| `RESEND_API_KEY` | empty | Enables email alerts and the email sign-up form. |
| `RESEND_FROM` | `Overwatch <alerts@resend.dev>` | Sender address for email alerts. |
| `WEBHOOK_ALLOW_PRIVATE_URLS` | empty | **Local development only.** `true` lets webhooks use `http://` and private hosts like `127.0.0.1`. Production must never set it: it is what stops webhook URLs from reaching internal networks. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Base URL used in alert links. |

### Indexer

| Variable | Default | What it does |
| --- | --- | --- |
| `INDEXER_PORT` | `8787` | Port for `GET /health`. |
| `NONCE_PROGRAM_SUBSCRIBE` | empty | `true` forces real-time `programSubscribe` for signer nonce accounts on the public mainnet RPC (which normally rejects it; with Helius it is always on). |

### Devnet registry, vault and demo

| Variable | Default | What it does |
| --- | --- | --- |
| `REGISTRY_PROGRAM_ID` | the deployed devnet registry | The indexer publishes scores here; protocol pages read the onchain record. Unset it to turn publishing off. |
| `VAULT_PROGRAM_ID` | the deployed devnet vault | Used by the keeper and the demo scripts. |
| `PUBLISHER_KEYPAIR_PATH` | `./keys/publisher-keypair.json` | Key allowed to write to the registry. |
| `DEMO_ADMIN_KEYPAIR_PATH` | `./keys/demo-admin-keypair.json` | Admin of the demo protocol's multisig. |
| `DEMO_MODE` | `false` | `true` lets the keeper re-arm the demo vault after a reset. |
| `FUNDER_KEYPAIR_PATH` | empty | A funded devnet key used instead of the airdrop faucet. |

Set automatically by the platform, never by hand: `VERCEL` (shrinks the connection pool on Vercel) and `NODE_ENV`.

## 5. Running each part

| Part | Command | Notes |
| --- | --- | --- |
| Website + API | `pnpm --filter @overwatch/web dev` | http://localhost:3000. Pages fall back to a dated snapshot if the database is unreachable. |
| Indexer | `pnpm --filter @overwatch/indexer dev` | Watches every verified protocol. `curl localhost:8787/health` shows subscriptions, processed refreshes and errors. |
| Bot + delivery worker | `pnpm --filter @overwatch/bot dev` | Polls Telegram (one process per bot token, or Telegram rejects the second) and delivers pending alerts every 2 seconds. |
| Everything at once | `pnpm dev` | Turborepo runs every app's `dev` task in parallel. |

`dev` scripts restart on file changes (`next dev` and `tsx watch`). Environment changes need a manual restart.

Useful one-off scripts (all in `scripts/`, all read-only against mainnet unless noted):

| Command | What it does |
| --- | --- |
| `pnpm inspect <programId> [--devnet] [--multisig <addr>]` | Control report for **any** program: upgrade authority, its kind, and the multisig behind it. Use it before adding a protocol. |
| `pnpm seed [slug…]` | Verify and store the watch list (or only the listed slugs). |
| `pnpm backfill [slug…] [--days 180] [--max 400]` | Rebuild change history from past transactions. Writes events but never sends alerts. |
| `pnpm stats` | Regenerates `docs/submission/headline-stats.md` from the database. |
| `pnpm smoke:pipeline` | End-to-end pipeline check without RPC (writes to the database, then cleans up). |
| `pnpm fixtures:capture` | Re-captures real account bytes into `fixtures/` for the decoder tests. |
| `pnpm fixtures:idl` | Re-fetches protocol Anchor IDLs into `fixtures/idl/` for the adapter tests. |
| `pnpm probe <id…>` | Low-level check that program IDs exist and are upgradeable. |
| `pnpm demo <action>` | **Devnet transactions.** See [section 11](#11-the-devnet-registry-vault-and-demo). |

## 6. The database

Postgres, accessed with [Drizzle ORM](https://orm.drizzle.team) over the [postgres.js](https://github.com/porsager/postgres)
driver. The schema is `packages/db/src/schema.ts`; migrations are SQL files in `packages/db/migrations/`.

**Changing the schema:**

1. Edit `packages/db/src/schema.ts`.
2. `pnpm --filter @overwatch/db generate`, which writes a new SQL migration from the diff.
3. Read the generated SQL. Make sure it never drops data you need.
4. `pnpm db:migrate` to apply it locally. Commit the schema change and the migration together.

**Local:** `docker compose up -d` gives Postgres 16 on port 5433 with a persistent volume. `docker compose down -v`
wipes it.

**Supabase** (what production uses):

1. Create a project, preferably in the same region as the servers (production uses Sydney, `ap-southeast-2`).
2. **Turn off the Data API** (Project Settings → Data API). Overwatch never uses it, its tables have no row-level
   security, and with it on anyone holding the project's public key could read subscribers.
3. Under **Connect**, copy two strings and put your database password in both:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`. Lets many short-lived clients share a few connections.
   - **Session pooler** (port 5432) → `DIRECT_URL`. Holds a real session for `LISTEN` and migrations.
4. `pnpm db:migrate && pnpm seed`.

The client (`packages/db/src/client.ts`) handles the pooler differences for you: TLS for any non-local host,
no prepared statements on port 6543, and **no query pipelining on port 6543**. That last one matters: the transaction
pooler loses responses when several queries are pipelined down one connection, and the stuck query never returns.

## 7. Day-to-day workflow

1. Branch from `main`: `git switch -c short-description`.
2. Make the smallest change that fully solves the problem (see [section 8](#8-code-conventions)).
3. Run the checks CI runs:
   ```sh
   pnpm format            # Prettier; or pnpm format:check to only check
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm smoke:pipeline    # if you touched packages/db, packages/core, apps/bot or apps/indexer
   ```
4. If you changed the website, run the browser tests against the dev server:
   `pnpm --filter @overwatch/web dev` in one terminal, `pnpm --filter @overwatch/web e2e --workers=1` in another.
5. If you changed a program in `programs/`, run `anchor build && cargo test -p overwatch_registry -p overwatch_vault`.
6. Commit with a short imperative subject ("Reject unknown protocol slugs on webhook signup"), and a body that says
   _why_. Keep unrelated changes in separate commits.
7. Open a pull request. CI (`.github/workflows/ci.yml`) runs formatting, lint, typecheck, unit tests, the pipeline
   smoke test against a Postgres service, and builds and tests the Anchor programs.

## 8. Code conventions

**The smallest complete change.** Before writing code, check whether it needs to exist, whether the codebase already
has a helper for it, whether the platform or an installed dependency already does it. Deleting code beats adding it.
Never add a dependency for a few lines. But finish the change: callers, tests and docs it affects.

**Never cut corners on:** validation at trust boundaries (every API input goes through `zod`), error handling that
prevents data loss, security, accessibility.

**Package boundaries:**

- `packages/core` is pure logic with no network or database access, so it can be tested with captured bytes and run in
  the browser. The one exception is `@overwatch/core/net` (DNS-based webhook URL checks), which is a separate,
  server-only entry point; never re-export it from `packages/core/src/index.ts`.
- `packages/db` owns all SQL. Apps call its functions; they do not hand-write queries.
- `apps/web/lib/*` is server-only (`import "server-only"` where it touches the database).
- `packages/demo` is devnet-only and refuses mainnet RPC URLs. Nothing on the website depends on it.

**Style:** TypeScript strict mode, ESM everywhere, Prettier (120 columns, double quotes, trailing commas). Names say
what a thing is. Comments explain _why_, in one line, only when the code cannot. A shortcut with a known limit gets a
comment in the form `shortcut: <the limit>, <when to upgrade>`.

**Solana specifics:** read the 45-byte ProgramData header with a data slice, never the whole executable. Decode Squads
accounts with `@sqds/multisig`, never by hand. Token-2022 extensions are parsed from the TLV region after byte 165.

**Copy:** plain English, no hype, no jargon where a plain word works. Say what changed, why it matters to a depositor,
and what to do. Every claim must be checkable.

## 9. Tests

| Where | Run | What it covers |
| --- | --- | --- |
| `packages/core/test/` | `pnpm --filter @overwatch/core test` | Decoders against real captured bytes (`fixtures/`), admin adapters against real IDLs, every rule and severity, scoring and flags, the backfill replay classifier, the webhook URL guard, the rehearsal model. Runs with coverage. |
| `packages/sdk/test/` | `pnpm --filter @overwatch/sdk test` | PDA derivation, RiskRecord decoding, webhook signature verification. |
| `apps/bot/test/` | `pnpm --filter @overwatch/bot test` | Alert formatting and retry backoff. |
| `scripts/dev/pipeline-smoke.ts` | `pnpm smoke:pipeline` | The database pipeline end to end (needs Postgres). |
| `apps/web/e2e/` | `pnpm --filter @overwatch/web e2e --workers=1` | Playwright smoke tests: landing → docs navigation, control map → protocol page, case-study replay, every main page renders, the red palette and the GMT clock. Needs the dev server on :3000. |
| `programs/*/tests/` | `cargo test -p overwatch_registry -p overwatch_vault` | Registry publisher rules and stale-slot rejection; vault share math and the exit decision. |

Writing tests: new rule or scoring logic always gets a test in `packages/core/test/` using the helpers in
`test/helpers.ts` (`snap()`, `ms()`, `ctx()`). New decoders get a real fixture: capture the account with
`pnpm fixtures:capture` (add it to `scripts/capture-fixtures.ts` first) and assert against it, never against invented
bytes. The headless browser in the e2e tests occasionally crashes on WebGL in CI-like environments ("Target page,
context or browser has been closed"); rerun with `--last-failed` before assuming a regression.

## 10. Recipes for common changes

### Add a protocol to the watch list

1. Find the program IDs in the protocol's official docs or repository. Never trust an address from anywhere else.
2. `pnpm inspect <programId>`. It prints the upgrade authority and, if it is a Squads vault, searches the authority's
   transaction history for the multisig that derives it.
3. Add an entry to `config/protocols.yaml`:
   ```yaml
   - slug: example-lend                    # lowercase, a-z0-9 and dashes; becomes the URL
     name: Example Lend
     category: lending                     # lending | perps | dex | lst | aggregator | yield | infra
     defillama_slug: example-lend          # optional; TVL is display-only
     website: https://example.finance
     docs_sources: [https://docs.example.finance]   # where you got the program IDs
     programs: [{ id: <programId>, label: Lending program }]
     multisigs: [{ address: <multisig>, vault_index: 0, role: upgrade_authority, discovered_via: tx-history }]
     collateral_mints: [<mint>, …]         # optional; Token-2022 risks are checked
     oracles: [<feed>, …]                  # optional; deprecated oracle providers are flagged
   ```
   Do not set `verified`; the seed script decides that.
4. `pnpm seed example-lend`. The report must show ✔ with no problems. If the multisig does not derive the authority,
   the entry is wrong; fix it rather than forcing it.
5. `pnpm backfill example-lend` to load its history.
6. The running indexer picks up new verified protocols within 15 seconds.

### Add or change a rule

Rules are in `packages/core/src/rules.ts`, in `diffSnapshots(prev, next, ctx)`, which compares two snapshots and
returns typed events.

1. If it is a new kind of event, add its name to `EventType` in `packages/core/src/types.ts`.
2. Emit it with the `ev(type, severity, weakening, title, explanation, before, after)` helper. `weakening` is true only
   if the change makes depositors less safe. Titles start with the protocol name; explanations say what changed and why
   it matters, in plain English.
3. Add a test in `packages/core/test/rules.test.ts` for each severity branch.
4. Update the events table on the documentation page (`apps/web/app/docs/page.tsx`). **The published page is the source
   of truth**; code and page must agree.
5. If history can contain this change too, teach the backfill: `scripts/backfill.ts` parses transactions, and
   `classifyConfigActions` in `rules.ts` grades multisig configuration changes.

### Change scoring or add a flag

Scoring is `scoreSnapshot()` in `packages/core/src/scoring.ts`. A new flag bit is a public API change, because it is
published onchain:

1. Add the bit to `FLAG` (never reuse or renumber an existing bit).
2. If it should make a protocol red, add it to `RED_MASK` **and** to `packages/sdk/src/registry.ts` (`RED_MASK`) **and**
   to `programs/overwatch_registry/src/lib.rs` (`flags::RED_MASK`). All three must match.
3. Update the scoring and flag tables in `apps/web/app/docs/page.tsx`.
4. Add tests in `packages/core/test/scoring.test.ts`.

### Add an admin-config adapter

Adapters decode a protocol's own config account (admin key, limits, listed collateral) in
`packages/core/src/adapters/protocols.ts`.

1. `pnpm fixtures:idl` (add the program to `scripts/dev/idl.ts` first) to fetch its onchain Anchor IDL.
2. Copy the account's leading fields into `packages/core/src/adapters/specs.ts`.
3. Write the adapter with `decodePrefix()` and register it with `registerAdapter()`.
4. Capture a real account into `fixtures/` and add a test in `packages/core/test/adapters.test.ts` that the spec matches
   the IDL and decodes the real bytes.

### Add a public API route

1. Create `apps/web/app/api/v1/<path>/route.ts`. Validate every input with `zod`.
2. Wrap the handler in `withDb()` (an unreachable database answers `503` JSON instead of a bare 500) and call `guard()`
   for rate limiting and optional API keys.
3. Return `ok(data)` or `err(status, message)` from `apps/web/lib/api.ts` so every response carries `version`.
4. Document it on `apps/web/app/docs/api/page.tsx`. If it is useful to SDK users, add a method to
   `packages/sdk/src/api.ts`.

### Add a page

1. Create `apps/web/app/<route>/page.tsx`. Start with `<PageHero>` from `site/ui.tsx` and give sections a
   `data-dock` name and a particle shape via `{...stage("shape", opts)}`.
2. Add it to the menu in `site/content.ts` (`pages`) and, if it is a main page, to `site/NavLinks.tsx` and the footer in
   `site/Chrome.tsx`.
3. Add it to the "pages render" test in `apps/web/e2e/smoke.spec.ts`.
4. Data comes from loaders in `site/data.ts`, which fall back to the snapshot when the database is down. Keep that
   behaviour for anything a visitor sees.

## 11. The devnet registry, vault and demo

These run on **devnet only**; `packages/demo` refuses any RPC URL containing "mainnet". None of it is on the website.

**Programs.** `anchor build` builds `overwatch_registry`, `overwatch_vault` and `demo_protocol` into `target/deploy/`.
The registry and vault are already deployed on devnet at the IDs in `.env.example`. To deploy your own:
`anchor deploy --provider.cluster devnet`, then set `REGISTRY_PROGRAM_ID` and `VAULT_PROGRAM_ID`.

**Keys.** `keys/` (git-ignored) needs `demo-admin-keypair.json`, `publisher-keypair.json`, `signer-a-keypair.json`,
`signer-b-keypair.json`, `signer-c-keypair.json` and `attacker-keypair.json`. Create each with
`solana-keygen new --no-bip39-passphrase -o keys/<name>.json`. Never commit keys; never reuse them on mainnet.

**Publishing.** When the publisher key exists, the indexer writes each protocol's score and flags to the registry
(at most once a minute per protocol, immediately for critical changes). Without keys it logs once and carries on.

**The demo protocol.** `pnpm demo setup` creates a 2-of-3 Squads multisig with a two-day timelock, deploys
`demo_protocol` behind it, initialises the vault with a funded position, and registers `overwatch-demo` in the
database. Then:

```sh
pnpm demo remove-timelock       # CRITICAL: the indexer alerts, the registry goes red, the keeper calls check_and_exit
pnpm demo lower-threshold
pnpm demo create-signer-nonce   # the "Drift pattern"
pnpm demo transfer-authority
pnpm demo reset                 # restores the controls; with DEMO_MODE=true the keeper re-arms the vault
```

## 12. Deploying

Production is three pieces: the website on **Vercel**, the indexer and bot on **Fly**, and Postgres on **Supabase**,
all in Sydney so queries stay local.

### Website (Vercel)

The repo root is linked to the Vercel project. `vercel.json` pins functions to `syd1`.

```sh
vercel env add DATABASE_URL production --sensitive   # Supabase transaction pooler (6543)
vercel env add DIRECT_URL production --sensitive     # Supabase session pooler (5432)
vercel env add HELIUS_API_KEY production --sensitive
vercel env add TELEGRAM_BOT_USERNAME production
vercel env add REGISTRY_PROGRAM_ID production
vercel --prod
```

Do **not** add `WEBHOOK_ALLOW_PRIVATE_URLS` or the bot token to Vercel. Without `DATABASE_URL` the site still deploys
and serves the snapshot. After deploying, check `https://<your-domain>/api/v1/status` reports `"database":"ok"`.

### Indexer and bot (Fly)

Both use `Dockerfile.worker` with a build argument choosing the app. Keypairs are mounted from a volume, never baked
into the image.

```sh
fly launch --config fly.indexer.toml --no-deploy
fly volumes create overwatch_keys --region syd --size 1 --config fly.indexer.toml   # the config mounts it at /app/keys;
                                                    # leave it empty unless you publish to the devnet registry
fly secrets set DATABASE_URL=… DIRECT_URL=… HELIUS_API_KEY=… --config fly.indexer.toml
fly deploy --config fly.indexer.toml

fly launch --config fly.bot.toml --no-deploy
fly secrets set DATABASE_URL=… TELEGRAM_BOT_TOKEN=… NEXT_PUBLIC_SITE_URL=https://… --config fly.bot.toml
fly deploy --config fly.bot.toml
```

Run exactly **one** bot instance: Telegram allows a single long-polling client per token. Stop any local bot first.

### Telegram

Create the bot with [@BotFather](https://t.me/BotFather) (`/newbot`), put the token in `TELEGRAM_BOT_TOKEN` and the
username (without `@`) in `TELEGRAM_BOT_USERNAME`. The bot registers its own command menu and description when it
starts.

## 13. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Live events says **"No event history on this deployment"** | The site cannot reach the database within 5 seconds, or `DATABASE_URL` is not set where it runs. Check `/api/v1/status`. |
| **`max clients reached in session mode`** | `DATABASE_URL` points at Supabase's session pooler (15 clients). Use the transaction pooler (6543) for `DATABASE_URL` and the session pooler only as `DIRECT_URL`. |
| Queries **hang** forever on the transaction pooler | Query pipelining on port 6543. `packages/db/src/client.ts` turns it off (`max_pipeline: 0`); don't remove that. |
| Your **Helius key seems ignored** | An explicit `SOLANA_*_URL` wins over `HELIUS_API_KEY`. Leave those empty. |
| The indexer's **mainnet websocket keeps reconnecting** | You are on the public RPC, which drops sockets that subscribe to many accounts. Set `HELIUS_API_KEY` (and leave `SOLANA_MAINNET_WS_URL` empty). |
| The bot logs **409 Conflict** | Another process is polling with the same bot token. Run one instance. |
| `pnpm smoke:pipeline` fails with **expected event and score notifications** | `DIRECT_URL` (or `DATABASE_URL`) must support `LISTEN`; a transaction pooler alone cannot. |
| Webhook creation says **"points to a private or internal address"** | Intended in production. Locally set `WEBHOOK_ALLOW_PRIVATE_URLS=true` to test against `127.0.0.1`. |
| `pnpm seed` shows **✘** for a protocol | The listed multisig does not derive the program's upgrade authority, or an account is missing. Re-check with `pnpm inspect`. |
| The first request after a deploy is slow | Server functions start cold on Vercel and open fresh database connections. Later requests take about a second. |

## 14. Reporting security issues

Please do not open a public issue for a vulnerability. Contact the maintainer privately through GitHub
(https://github.com/0xzcr) with steps to reproduce, and give a reasonable time to fix it before disclosure.
