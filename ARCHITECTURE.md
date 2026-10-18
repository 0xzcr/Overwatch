# Overwatch architecture

This document explains the whole system: what it reads, how it decides, where data lives, how alerts travel, and how
the website and onchain programs fit in. It is written so that someone who has never seen the code can understand all
of it, and so that someone changing the code knows which other parts a change touches. Paths are relative to the
repository root. Section 22 walks through four complete scenarios end to end; if you prefer learning from examples,
start there and come back.

## Contents

1. [The idea](#1-the-idea)
2. [System map](#2-system-map)
3. [Repository layout](#3-repository-layout)
4. [The domain model](#4-the-domain-model)
5. [Reading the chain](#5-reading-the-chain)
6. [The rules engine](#6-the-rules-engine)
7. [Scoring, grades and flags](#7-scoring-grades-and-flags)
8. [The database](#8-the-database)
9. [The ingest pipeline](#9-the-ingest-pipeline)
10. [The indexer](#10-the-indexer)
11. [Seeding, verification and history](#11-seeding-verification-and-history)
12. [Alerts: the bot and the delivery worker](#12-alerts-the-bot-and-the-delivery-worker)
13. [The public API](#13-the-public-api)
14. [The website](#14-the-website)
15. [The front-end engine](#15-the-front-end-engine)
16. [The onchain programs](#16-the-onchain-programs)
17. [The SDK](#17-the-sdk)
18. [The devnet demo package](#18-the-devnet-demo-package)
19. [Security model](#19-security-model)
20. [Performance and reliability](#20-performance-and-reliability)
21. [Deployment topology](#21-deployment-topology)
22. [End-to-end walkthroughs](#22-end-to-end-walkthroughs)
23. [Testing and CI](#23-testing-and-ci)
24. [Known limitations and open issues](#24-known-limitations-and-open-issues)
25. [Glossary](#25-glossary)

---

## 1. The idea

A DeFi protocol on Solana is a set of programs plus the accounts that configure them. Whoever holds the **upgrade
authority** of a program can replace its code, and code that holds deposits can be replaced with code that sends them
elsewhere. Most serious protocols put that authority behind a **multisig** (several signers must approve) with a
**timelock** (an approved change waits before it takes effect, giving depositors time to leave). Those protections can
be weakened: signers removed, the threshold lowered, the timelock cut, control handed to a single key, or signers can
quietly sign transactions in advance using **durable nonces**, which never expire and can be executed at any later
moment. That last one is how Drift lost about $285M on April 1, 2026.

On Solana every one of these facts is public: it is bytes at a fixed offset in an account anyone can read. Overwatch:

1. **reads** those accounts for a curated list of protocols (`config/protocols.yaml`),
2. **normalises** them into a `ControlSnapshot` (who controls what, right now),
3. **diffs** each new snapshot against the previous one to produce typed **events** ("timelock removed"),
4. **scores** the current state from 0 to 100 with an itemised list of deductions, and a set of risk **flags**,
5. **stores** snapshots, events and scores in Postgres,
6. **tells people**: a live web feed, Telegram, signed webhooks, email and an API,
7. **publishes** the score and flags to an onchain **registry** (devnet), so other programs (for example a vault) can
   react without trusting Overwatch's servers.

Everything is designed to be checkable: every event and score records the account address and the slot it was read
at, and the rules are ordinary readable TypeScript in `packages/core`.

What Overwatch deliberately does **not** do: audit code, price assets, track TVL or solvency, or detect exploits as they
happen. It warns after a change lands onchain; it cannot stop or undo it.

## 2. System map

```
                         Solana mainnet (read-only)                       Solana devnet
                     ┌──────────────────────────────┐            ┌─────────────────────────────┐
                     │ programs, ProgramData,       │            │ overwatch_registry (scores) │
                     │ Squads multisigs, proposals, │            │ overwatch_vault (exits)     │
                     │ nonce accounts, mints,       │            │ demo_protocol + its multisig│
                     │ oracles, admin configs       │            └──────────────▲──────────────┘
                     └──────┬───────────────▲───────┘                           │ upsert_risk / check_and_exit
              websockets    │               │ HTTP JSON-RPC                     │
         (account/logs/program subscribe)   │ (getMultipleAccounts, gPA, …)     │
                     ┌──────▼───────────────┴───────┐                           │
                     │   apps/indexer  (Fly, syd)   │───────────────────────────┘
                     │   packages/core: decode,     │      publisher + keeper (only with devnet keys)
                     │   diff, score                │
                     └──────┬───────────────────────┘
                            │ packages/db: ingestSnapshot()
                            ▼
              ┌────────────────────────────────────────┐   pg_notify('overwatch_events', …)
              │  Postgres (Supabase, Sydney)           │─────────────────────────────┐
              │  protocols, snapshots, events, scores, │                             │ LISTEN
              │  subscriptions, deliveries, …          │                             │
              └──────┬───────────────────────┬─────────┘                             │
                     │ pending deliveries    │ queries                               │
            ┌────────▼─────────┐   ┌─────────▼───────────────────────────────────────▼──┐
            │ apps/bot (Fly)   │   │ apps/web (Vercel, syd1)                             │
            │ Telegram bot +   │   │ pages: control map, protocol pages, live events,   │
            │ delivery worker  │   │ case study, alerts, docs · API /api/v1 · SSE stream │
            └──┬────────┬──────┘   └──────────────────────────┬─────────────────────────┘
               │        │                                     │
        Telegram   webhooks / email                      browsers, API clients, SDK users
```

| Component | Lives in | Runs on | Does |
| --- | --- | --- | --- |
| Core logic | `packages/core` | anywhere (pure) | decoders, snapshot collection, rules, scoring, hashing, Drift reconstruction |
| Solana I/O | `packages/solana` | servers | paced JSON-RPC client, reconnecting websocket subscriptions |
| Storage | `packages/db` | servers | schema, connection handling, queries, the ingest pipeline |
| Indexer | `apps/indexer` | Fly (one process) | subscribes to every watched account, refreshes snapshots, ingests, publishes onchain |
| Bot + worker | `apps/bot` | Fly (one process) | Telegram commands; delivers pending alerts to Telegram, webhooks, email |
| Website + API | `apps/web` | Vercel (serverless, Sydney) | every page, the REST API, the live SSE stream |
| Onchain programs | `programs/` | Solana devnet | registry of scores; a vault that exits red protocols; a demo protocol |
| SDK | `packages/sdk` | integrators | API client, webhook verification, registry/vault PDAs and instructions |
| Demo tooling | `packages/demo`, `scripts/demo.ts` | developer machine | devnet setup and scripted weakening for demonstrations |

## 3. Repository layout

The repository is a **pnpm workspace** orchestrated by **Turborepo** (`turbo.json` defines `build`, `dev`, `lint`,
`typecheck`, `test`). TypeScript packages are consumed as source (`"main": "src/index.ts"`), so there is no build step
between packages; Next.js transpiles them via `transpilePackages` and the workers run them with `tsx`.

```
.
├── apps/
│   ├── web/                    Next.js 15 (App Router), React 19
│   │   ├── app/                routes: pages and /api/v1 route handlers, site.css + pages.css
│   │   ├── site/               shared UI components, copy (content.ts), data loaders (data.ts), engine/
│   │   │   └── engine/         persistent WebGL + scroll runtime and per-page animation wiring
│   │   ├── lib/                server-only helpers: DB view models, API helpers, control graph builder
│   │   ├── e2e/                Playwright smoke tests
│   │   └── public/             favicon
│   ├── indexer/src/            main.ts (watchers, reconciler, health), publisher.ts (registry + keeper), log.ts
│   └── bot/src/                main.ts (Telegram commands), deliver.ts (worker), format.ts (message formats)
├── packages/
│   ├── core/src/               types, decoders/, adapters/, constants/, collect, classify, rules, scoring, hash,
│   │                           drift (reconstruction), rehearsal (offline demo model), net (webhook URL guard)
│   ├── solana/src/             rpc.ts (JSON-RPC client), ws.ts (websocket subscriptions)
│   ├── db/src/                 env.ts, client.ts, schema.ts, queries.ts, pipeline.ts, migrate.ts
│   ├── db/migrations/          SQL migrations generated by drizzle-kit
│   ├── sdk/src/ + idl/         api.ts, registry.ts, tx.ts; the programs' Anchor IDLs
│   └── demo/src/               env.ts (devnet connection, keys, state), index.ts (actions), tx.ts (send)
├── programs/                   Anchor workspace: overwatch_registry, overwatch_vault, demo_protocol (+ LiteSVM tests)
├── config/protocols.yaml       the curated watch list
├── scripts/                    seed, backfill, inspect, discover, tvl, stats, capture-fixtures, demo, dev/*
├── fixtures/                   captured mainnet account bytes and Anchor IDLs (test inputs)
├── docs/submission/            headline-stats.md (snapshot numbers the site falls back to)
├── Dockerfile.worker           one image for indexer and bot (APP build arg)
├── fly.indexer.toml, fly.bot.toml, vercel.json, docker-compose.yml
└── .github/workflows/ci.yml    formatting, lint, typecheck, unit tests, pipeline smoke test, Anchor build + tests
```

## 4. The domain model

All shared types are in `packages/core/src/types.ts`. Understanding these five shapes is understanding Overwatch.

### 4.1 `ControlSnapshot`: who controls a protocol, at one slot

```ts
interface ControlSnapshot {
  protocol: string;        // slug, e.g. "kamino-lend"
  slot: number;            // slot the accounts were read at
  takenAt: string;         // ISO time
  programs: ProgramFacts[];   // each program and its upgrade authority
  multisigs: MultisigFacts[]; // each mapped Squads multisig
  nonces: NonceFacts[];       // durable nonce accounts whose authority is a signer of a watched multisig
  mints: MintFacts[];         // collateral mints and their risky powers
  oracles: OracleFacts[];     // oracle accounts and whether their provider is deprecated
  admin: AdminFacts[];        // protocol-specific admin config (adapters)
  verified: boolean;          // did the seed script prove the multisig mapping
}
```

- **`ProgramFacts`**: `programId`, `label`, `programDataAddress`, `lastDeploySlot`, `upgradeAuthority` (null =
  immutable), `authorityKind` (see 5.6), `authorityOwner` (owner program of the authority account), `multisig` (the
  Squads multisig whose vault PDA equals the authority, if mapped).
- **`MultisigFacts`**: `address`, `version`, `vaultIndex` (which vault PDA, 0–7), `role` (`upgrade_authority`, `admin`,
  `treasury`), `threshold`, `members` (key + permission bitmask: 1 initiate, 2 vote, 4 execute), `timeLockSec`,
  `configAuthority` (a key that can reconfigure the multisig without a vote, or null), transaction indexes, and
  `pending` (open configuration proposals, each decoded into `ConfigActionLite` actions).
- **`NonceFacts`**: `address`, `authority`, `blockhash`.
- **`MintFacts`**: token program, mint and freeze authority, `permanentDelegate`, `transferHookProgram`,
  `defaultAccountStateFrozen`, `pausable`, and the list of Token-2022 extensions.
- **`OracleFacts`**: `address`, `owner`, `kind` (`PYTH`, `SWITCHBOARD`, …), `deprecated`.
- **`AdminFacts`**: decoded by a per-protocol adapter: `admin`, optional `guardian` / `listingAuthority`, a bag of
  numeric/boolean `params`, and the `oracles` and `mints` the config references.

### 4.2 `OverwatchEvent`: something changed

```ts
interface OverwatchEvent {
  protocol: string;
  type: EventType;          // e.g. "TIMELOCK_REMOVED"
  severity: Severity;       // INFO | LOW | MEDIUM | HIGH | CRITICAL
  weakening: boolean;       // true if depositors are less safe after it
  title: string;            // "Kamino Lend removed its 2 days safety delay"
  explanation: string;      // what changed, why it matters
  labels: string[];         // e.g. ["Drift pattern"]
  before?: unknown; after?: unknown;   // the raw values that changed
  slot: number; blockTime: string | null; txSignature: string | null; detectedAt: string;
}
```

### 4.3 `ScoreResult`

`score` (0–100), `grade` (A–F), `flags` (a 64-bit bitmap as a `bigint`), `breakdown` (one `Deduction { key, points,
reason }` per rule that fired) and `red` (whether any red-mask flag is set). See section 7.

### 4.4 `ProtocolConfig` (the watch list entry)

Validated by `zod` in `packages/core/src/config.ts`: `slug`, `name`, `category`, optional `defillama_slug`, `website`,
`docs_sources`, `programs[] {id,label}`, `multisigs[] {address, vault_index, role, discovered_via}`,
`admin_accounts[]`, `collateral_mints[]`, `oracles[]`, `verified` (always false in the file; the seed decides),
`source` (`config` or `demo`), `network` (`mainnet` or `devnet`).

### 4.5 Severities

`SEVERITY_ORDER = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }`. Subscriptions use "at least X"
(`severitiesAtLeast` in `packages/db/src/queries.ts`).

## 5. Reading the chain

### 5.1 The transport: `packages/solana`

**`Rpc` (`rpc.ts`)** is a deliberately small JSON-RPC client, read-only by design:

- **Pacing:** consecutive requests are spaced at least `minIntervalMs` apart: 20ms with a Helius key, 120ms on the
  public RPC.
- **Retries:** HTTP 429 and 5xx retry with exponential backoff and jitter (`(429 ? 1500 : 400)ms × 2^attempt`, capped at
  30s). JSON-RPC errors that cannot succeed on retry (bad params, blocked methods) surface immediately as `RpcError`.
- **Methods:** `getSlot`, `getAccount`, `getMultipleAccounts` (batched; optional `dataSlice`), `getProgramAccounts`
  (with filters), `getSignaturesForAddress`, `getTransaction`. Responses are validated with `zod` and account data is
  decoded from base64 into `Uint8Array`.
- **Endpoints:** `mainnetRpc()` / `devnetRpc()` pick an explicit `SOLANA_*_RPC_URL`, else Helius (from
  `HELIUS_API_KEY`), else the public endpoint. An explicit URL always wins.

**`WsSubscriptions` (`ws.ts`)** manages one websocket per network (Node 22's global `WebSocket`):

- `accountSubscribe(address)`, `logsSubscribe(mention)`, `programSubscribe(program, filters)`.
- Subscribe requests are paced to a number per second: 50 with Helius; 4 on the public mainnet RPC and 10 on public
  devnet, which drop a socket that subscribes too fast.
- On close it reconnects with exponential backoff (500ms doubling to 30s), resets the backoff only after a connection
  has stayed up for 30 seconds, and **re-subscribes everything** on reconnect. `healthy` and `size` feed the indexer's
  health endpoint.

`packages/core` never imports this package. `collectSnapshot` accepts any object with `getSlot`,
`getMultipleAccounts` and `getProgramAccounts` (the `AccountReader` interface), which keeps core pure and testable.

### 5.2 Program and ProgramData accounts (`decoders/loader.ts`)

Upgradeable programs are owned by `BPFLoaderUpgradeab1e11111111111111111111111`. Two accounts matter:

- **Program account** (36 bytes): `u32` tag `2`, then the 32-byte address of its ProgramData account.
- **ProgramData account**: a 45-byte header, then the executable. Bytes 0–3: `u32` tag `3`. Bytes 4–11: `u64` slot of
  the last deploy. Byte 12: `Option` tag (0 = none, 1 = some). Bytes 13–44: the upgrade authority. Overwatch reads
  **only the header** using `dataSlice {offset: 0, length: 45}`; it never downloads the executable.

An upgrade authority of `None` means the program is **immutable**: nobody can change its code again.

### 5.3 Squads v4 multisigs (`decoders/squads.ts`)

Squads v4 (`SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`, itself immutable) is decoded with the official
`@sqds/multisig` account classes, never by hand. Overwatch reads:

- **Multisig** accounts: threshold, members and permissions, time lock, config authority, transaction indexes.
- **Vault PDAs**: a multisig signs through vault PDAs derived from `["multisig", multisig, "vault", index]`.
  `findVaultIndex(multisig, authority)` derives indexes 0–7 and returns the one equal to a program's upgrade
  authority. This is how Overwatch _proves_ a multisig controls a program rather than trusting a label.
- **Proposals** and **ConfigTransactions**: both store the multisig address right after the 8-byte discriminator
  (offset 8), so `getProgramAccounts` with two `memcmp` filters (discriminator at 0, multisig at 8) finds every one
  belonging to a multisig. `pendingFrom()` joins proposals that are still open with their config transactions and turns
  each config action into a small `ConfigActionLite` (`AddMember`, `RemoveMember`, `ChangeThreshold`, `SetTimeLock`,
  `SetRentCollector`, `Other`).

### 5.4 Durable nonce accounts (`decoders/nonce.ts`)

A nonce account is an 80-byte System Program account: `u32` version, `u32` state (1 = initialised), **authority at
offset 8**, blockhash at 40, fee at 72. A transaction built on a durable nonce has no expiry: a signer can sign it
today and an attacker can submit it next month. Overwatch finds nonce accounts _whose authority is a signer of a
watched multisig_ with `getProgramAccounts(System, [dataSize 80, memcmp offset 8 = signer])`.

### 5.5 Token-2022 mints and oracles

`decoders/token.ts` reads a mint's authorities and, for Token-2022 mints, walks the **TLV extension region** that starts
after the account-type byte at offset 165. The risky extensions are `PermanentDelegate` (the issuer can move anyone's
tokens), `TransferHook` (arbitrary code runs on transfer), `DefaultAccountState` = frozen, `Pausable`, and a freeze
authority on Token-2022 mints. `mintRisks()` lists which apply.

Oracles are classified by their **owner program** against `constants/oracles.ts` (Pyth, Switchboard, RedStone,
Chainlink…). Providers that shut down are marked `deprecated` (both Switchboard programs, v2 and On-Demand, after the service shut
down on 2026-09-25); an oracle owned by one of the protocol's own programs is `PROTOCOL_OWNED`.

### 5.6 Classifying an upgrade authority (`classify.ts`)

`classifyAuthority({ authority, owner, squadsV4VaultMatch })` decides, in order:

1. no authority → `IMMUTABLE`
2. a mapped Squads v4 multisig derives it → `SQUADS_V4_VAULT`
3. owned by Squads v3 → `SQUADS_V3`
4. owned by SPL Governance → `REALMS_GOVERNANCE`
5. owned by Squads v4 but not a vault → `UNKNOWN` (such an account cannot sign upgrades)
6. on the ed25519 curve and owned by nobody or the System Program → `SINGLE_KEY` (an ordinary wallet: one private key)
7. off the curve (a PDA) → `OTHER_PROGRAM_PDA` (some program controls it; not yet attributed)
8. anything else → `UNKNOWN`

### 5.7 Admin adapters (`adapters/`)

Some of a protocol's power lives in its own config account rather than in its upgrade authority. An adapter
(`ProtocolAdapter { slug, accounts(), decode(account) }`) decodes that account into `AdminFacts`. Adapters exist for
Drift (`State`), Kamino (`LendingMarket`), marginfi (`MarginfiGroup`) and Orca (`WhirlpoolsConfig`). Their field
layouts are copied from each protocol's **onchain Anchor IDL** (`adapters/specs.ts`, captured in `fixtures/idl/`) and
decoded with `decodePrefix()` (`adapters/idl.ts`), which computes field sizes from IDL types and checks the 8-byte
account discriminator (`sha256("account:<Name>")[0..8]`). Tests assert the specs still match the IDLs and decode real
captured accounts.

### 5.8 Collecting a snapshot (`collect.ts`)

`collectSnapshot(rpc, config, options)` builds one `ControlSnapshot` in five batched steps:

1. **Programs.** `getMultipleAccounts(programIds)` → decode each Program account → `getMultipleAccounts(programData
   addresses, slice 0..45)` → decode headers (slot + authority).
2. **Multisigs.** `getMultipleAccounts(multisigs)`; anything missing or not owned by Squads v4 produces a warning, not a
   crash. Then fetch the authority accounts to learn their owners, find which multisig derives each authority, and
   classify every authority (5.6).
3. **Pending proposals** (unless `scanProposals: false`): two filtered `getProgramAccounts` calls per multisig.
4. **Nonce accounts** (only when `scanNonces: true`, because it is one `getProgramAccounts` per signer): if the RPC
   refuses (the public mainnet RPC blocks System-program scans), it reports `nonceScan: "unsupported"` and the caller
   keeps the nonces it already knew.
5. **Collateral, admin, oracles:** decode collateral mints, run the protocol's adapter if one exists, then classify every
   oracle referenced by the config or by the adapter's output.

It returns `{ snapshot, warnings, nonceScan }`. Warnings are strings; the seed uses them to mark a protocol unverified.

### 5.9 Snapshot identity (`hash.ts`)

`snapshotHash()` is a SHA-256 of the snapshot serialised with **sorted keys** and **without `slot` and `takenAt`**. Two
reads of an unchanged protocol therefore hash the same, and the database stores a new snapshot only when control
actually changed.

## 6. The rules engine

`packages/core/src/rules.ts` turns the difference between two snapshots into events. It is a pure function:

```ts
diffSnapshots(prev: ControlSnapshot | null, next: ControlSnapshot, ctx: DiffContext): OverwatchEvent[]
// ctx: recent event history for compound rules, the slot/blockTime/txSignature to stamp on events, now, display name
```

The first snapshot of a protocol (`prev = null`) produces **no events**: it is the baseline.

### 6.1 Event catalogue

| Area | Event | Severity | Weakening | When |
| --- | --- | --- | --- | --- |
| Upgrade authority | `AUTHORITY_BECAME_SINGLE_KEY` | CRITICAL | yes | authority moved from anything else to one private key |
| | `UPGRADE_AUTHORITY_CHANGED` | CRITICAL | yes | authority moved to a different address |
| | `PROGRAM_MADE_IMMUTABLE` | INFO | no | authority removed; nobody can change the code |
| | `PROGRAM_UPGRADED` | MEDIUM | no | same authority, new deploy slot (routine and malicious upgrades look identical) |
| Timelock | `TIMELOCK_REMOVED` | CRITICAL | yes | timelock went to zero |
| | `TIMELOCK_REDUCED` | HIGH | yes | timelock shortened |
| | `TIMELOCK_INCREASED` | INFO | no | timelock lengthened |
| Threshold | `THRESHOLD_LOWERED` | CRITICAL if the new threshold ≤ 2, else HIGH | yes | fewer approvals needed |
| | `THRESHOLD_RAISED` | INFO | no | more approvals needed |
| Signers | `MEMBERS_CHANGED` | MEDIUM (HIGH with a threshold cut now or in the last 7 days) | yes | signers added or removed |
| Config authority | `CONFIG_AUTHORITY_SET` | HIGH | yes | one key can now rewrite the multisig without a vote |
| | `CONFIG_AUTHORITY_REMOVED` | INFO | no | config changes need a vote again |
| Proposals | `PROPOSAL_WEAKENS_CONTROLS` | HIGH | yes | a new pending proposal would lower the threshold, cut the timelock or add a signer (`actionWeakens`) |
| Durable nonces | `SIGNER_NONCE_ACCOUNT_CREATED` | CRITICAL if enough signers to pass a vote now hold nonce accounts, else HIGH | yes | a signer created a nonce account |
| | `SIGNER_NONCE_ACCOUNT_CLOSED` | INFO | no | a signer's nonce account disappeared |
| | `SIGNER_DURABLE_NONCE_TX` | HIGH | yes | a signer signed a transaction that starts with `AdvanceNonceAccount` (emitted by the indexer, 10.4) |
| Collateral | `COLLATERAL_RISKY_EXTENSION` | HIGH | yes | a collateral mint gained a risky power |
| Oracles | `ORACLE_DEPRECATED` | HIGH | yes | an oracle's provider is now deprecated |
| Admin config | `ADMIN_PARAM_CHANGED` | HIGH (admin key changed, new collateral listed) or MEDIUM (a parameter changed) | varies | adapter-decoded admin config changed |
| History only | `MULTISIG_CONFIG_EXECUTED` | varies | varies | backfill: a multisig configuration transaction executed (6.3) |

### 6.2 Compound rules

After the per-field rules run, two rules look across events and time:

- **Signer churn with a threshold cut.** `MEMBERS_CHANGED` escalates to HIGH if a `THRESHOLD_LOWERED` is in the same
  batch or happened in the last 7 days.
- **The Drift pattern.** Any weakening event within 14 days of a signer creating a durable nonce account, or a nonce
  account created within 14 days of a HIGH or worse weakening, is escalated to **CRITICAL**, labelled
  `"Drift pattern"`, and its explanation says why. This is the exact sequence that preceded the Drift drain.

`ctx.history` carries the last 30 days of the protocol's events so these rules work across separate refreshes.

### 6.3 Grading history: `classifyConfigActions`

The backfill (11.3) reconstructs past configuration changes from transactions, where it only knows the _new_ values.
To say whether a change made things stronger or weaker, it replays each multisig's changes **oldest first** with a
running `ReplayState { timeLockSec, threshold, members }`, and `classifyConfigActions(name, actions, state)` grades each
transaction exactly like the live rules (lengthened timelock → INFO, removed timelock → CRITICAL, etc.). The first
change of each kind inside the scanned window has no known prior value, so it is reported neutrally ("set its safety
delay to 1 day", "The earlier setting is older than the history we scanned") instead of guessing. When the multisig's
signer count is known, titles read "4 of 7".

### 6.4 Writing style for events

Titles start with the protocol name and say the change in plain words. Explanations say what changed, why it matters
to a depositor and, for weakenings, what the risk is. Addresses are shortened (`abcd…wxyz`, `format.ts`) in text; the
full values live in `before`/`after`, `slot` and `txSignature`.

## 7. Scoring, grades and flags

`scoreSnapshot(snapshot, recentEvents, now)` in `packages/core/src/scoring.ts`. Every protocol starts at 100.

### 7.1 Deductions

The "relevant" multisigs exclude upgrade-authority multisigs when every program is immutable (they control nothing).

| Key | Points | Condition |
| --- | --- | --- |
| `single_key` | 60 | any program upgradeable by one private key |
| `controlled_multisig` | 20 | a relevant multisig has a config authority |
| `threshold_le_2` | 20 | the lowest threshold is 2 or less |
| `threshold_ratio` | 10 | otherwise, fewer than half of the voting members are needed |
| `timelock_zero` | 25 | the shortest timelock is 0 |
| `timelock_lt_24h` | 15 | otherwise, under 24 hours |
| `timelock_lt_48h` | 5 | otherwise, under 48 hours |
| `signer_nonce` | 10 per signer, max 30 | signers of watched multisigs hold durable nonce accounts |
| `pending_weakening` | 10 | an open proposal would weaken controls |
| `recent_weakening` | 10 | a HIGH or CRITICAL weakening event in the last 30 days |
| `collateral_oracle` | 10 each, max 20 | collateral with `PermanentDelegate`, or deprecated oracles |
| `unmapped_control` | 15 | a program controlled by something Overwatch cannot attribute (an unmapped PDA, Squads v3, Realms, unknown, or an unmapped Squads vault). Unknown is not safe. |

`score = clamp(100 − Σ points, 0, 100)`. Grades: **A** ≥ 85, **B** ≥ 70, **C** ≥ 55, **D** ≥ 40, **F** below.

### 7.2 Flags

Flags are a `u64` bitmap published onchain. **Bit positions are a public API**: never renumber them.

| Bit | Flag | Set when |
| --- | --- | --- |
| 0 | `SINGLE_KEY` | a program is upgradeable by one key |
| 1 | `NO_TIMELOCK` | a relevant multisig has no timelock |
| 2 | `LOW_THRESHOLD` | a relevant multisig needs ≤ 2 signatures |
| 3 | `CONTROLLED_MULTISIG` | a relevant multisig has a config authority |
| 4 | `SIGNER_NONCE` | a signer holds a durable nonce account |
| 5 | `PENDING_WEAKENING` | an open proposal would weaken controls |
| 6 | `RECENT_WEAKENING` | HIGH/CRITICAL weakening in the last 30 days |
| 7 | `RISKY_COLLATERAL` | a collateral mint has `PermanentDelegate` |
| 8 | `DEPRECATED_ORACLE` | an oracle's provider is deprecated |
| 9 | `UNVERIFIED` | control could not be mapped, or the seed could not verify the protocol |
| 10 | `NO_TIMELOCK_LOW_THRESHOLD` | derived: bits 1 and 2 on the **same** multisig |
| 11 | `RECENT_CRITICAL` | derived: bit 6 where at least one event was CRITICAL |

**`RED_MASK` = bits 0, 4, 10, 11.** A protocol is **red** if `flags & RED_MASK != 0`: one key can upgrade it, a signer
holds a durable nonce account, a multisig has no timelock _and_ needs two or fewer signatures, or it suffered a
CRITICAL weakening in the last 30 days. The derived bits 10 and 11 exist precisely so that "red" is a plain mask an
onchain program can test in one instruction. `RED_MASK` is defined in three places that must agree:
`packages/core/src/scoring.ts`, `packages/sdk/src/registry.ts` and `programs/overwatch_registry/src/lib.rs`.

## 8. The database

Postgres 16 locally (`docker-compose.yml`, port 5433) and Supabase in production. Schema: `packages/db/src/schema.ts`
(Drizzle). Migrations: `packages/db/migrations/`, applied with `pnpm db:migrate` (`src/migrate.ts`, over the direct
connection).

### 8.1 Tables

| Table | One row per | Key columns |
| --- | --- | --- |
| `protocols` | watched protocol | `slug` (unique), `name`, `category`, `network`, `source` (`config`/`demo`), `config` (the YAML entry, JSON), `verified`, `verification` (problems found by the seed), `tvl_usd` (display only) |
| `watched_accounts` | account the seed decided to watch | `protocol_id`, `address`, `kind` (program, programdata, multisig, admin, mint, oracle), `verified` |
| `snapshots` | **distinct** control state | `protocol_id`, `slot`, `content_hash`, `data` (the full `ControlSnapshot`) |
| `events` | change | `protocol_id`, `type`, `severity`, `weakening`, `title`, `explanation`, `labels`, `before`/`after`, `slot`, `block_time`, `tx_signature`, `source` (`live`, `backfill`, `demo`, `reconstructed`), `detected_at`. Unique index `(protocol_id, type, tx_signature, title)` makes re-ingesting idempotent. |
| `scores` | score computation that changed something | `protocol_id`, `score`, `grade`, `flags` (bigint), `breakdown` (deductions JSON), `computed_at` |
| `signers` | (signer, multisig) pair | first/last seen; feeds nonce watching |
| `nonce_accounts` | nonce account ever seen | `address`, `authority`, `first_seen_slot`, `closed_at` |
| `subscriptions` | alert subscriber | `channel` (`telegram`, `webhook`, `email`), `target` (chat id, URL, address), `protocol_ids` (null or empty = all), `min_severity`, `secret` (webhooks), `active` |
| `deliveries` | (subscription, event) to deliver | `status` (`pending`, `delivered`, `failed`), `attempts`, `last_error`, `next_attempt_at`, `delivered_at` |
| `api_keys` | API key | `key_hash` (SHA-256; the key itself is never stored), `owner`, `tier`, `rate_limit` |
| `onchain_publishes` | registry write or vault shield | `protocol_id`, `tx_signature`, `score`, `flags`, `slot`, `status`, `kind` (`registry`, `shield`) |
| `demo_actions` | devnet demo action | action log (devnet tooling only) |

### 8.2 Connections (`packages/db/src/client.ts`)

- `sql()` is the main pool, built from `DATABASE_URL`; `db()` wraps it in Drizzle. `direct()` is a second pool from
  `DIRECT_URL` (falling back to `sql()` when the two URLs are the same) used for `LISTEN` and migrations.
- Any non-local host gets TLS (`ssl: "require"`) unless the URL carries its own `sslmode`.
- **Supabase's transaction pooler (port 6543)** shares a few database connections among many clients, which is what
  serverless needs, but each transaction may land on a different backend. So on port 6543: `prepare: false`
  (prepared statements would not exist on the next backend) and `max_pipeline: 0`. The second is essential: the
  postgres.js driver pipelines **parameterless** queries down a busy connection (they skip the describe round trip),
  and the pooler loses responses to pipelined queries, so a query never returns. With pipelining off, each connection
  carries one query at a time.
- Pool size is 3 on Vercel (each serverless instance has its own pool) and 10 elsewhere.
- `env.ts` finds the repository root (the directory with `pnpm-workspace.yaml`) from any working directory and loads
  `.env.local` then `.env` without overwriting existing variables.

### 8.3 Notifications

The channel `overwatch_events` carries JSON messages via `pg_notify`. Kinds: `event` (a new event, with slug, type,
severity, weakening, slot, source, title, explanation, signature), `score` (slug, score, grade, flags, red), `registry`
(an onchain publish), `shield` (the vault exited), `rearm` (the vault re-armed). The website's SSE endpoint `LISTEN`s
on it (13.3). Notifications are fire-and-forget: a listener that was not connected misses them, which is fine because
every page loads from the tables first.

## 9. The ingest pipeline

`ingestSnapshot(protocolRow, snapshot, { source, txSignature, blockTime, force })` in `packages/db/src/pipeline.ts` is
the single path by which new control state enters the system. The indexer, the seed, the smoke test and the demo all
call it. Step by step:

1. Hash the snapshot (5.9) and load the protocol's latest stored snapshot.
2. Load the protocol's events from the last 30 days (or since the demo's last reset) as `history`.
3. **If the hash changed** (or there was no previous snapshot): insert the snapshot; if there was a previous one, run
   `diffSnapshots(prev, next, ctx)` stamping events with the snapshot slot and, when known, the triggering transaction's
   signature and block time; insert each event (`ON CONFLICT DO NOTHING` against the dedupe index).
4. Score the new snapshot against `history` plus the new events.
5. Insert a `scores` row if anything changed (score, flags, snapshot) or `force` is set.
6. For each new event: `pg_notify` an `event` message and **enqueue deliveries**: for every active subscription whose
   `min_severity` admits the event's severity and whose protocol list is empty or includes this protocol, insert a
   `deliveries` row.
7. If there were new events or a changed snapshot, `pg_notify` a `score` message.
8. Return `{ stored, events, score }`.

Because unchanged state hashes identically, the indexer can refresh as often as it likes: only real changes create
rows, events, alerts or notifications.

## 10. The indexer

`apps/indexer/src/main.ts` is one long-running Node process. It watches every **verified** protocol (and the devnet demo
protocol), keeps each one's snapshot fresh, and runs the pipeline.

### 10.1 Startup and timers

- On start: a full **reconcile with a nonce scan** for every protocol.
- Every **5 minutes**: reconcile (refresh every protocol) without the nonce scan.
- Every **hour**: reconcile with the nonce scan (signer nonce accounts via `getProgramAccounts`).
- Every **15 seconds**: look for protocols added to the database since start (e.g. after `pnpm seed`) and start watching
  them.
- An HTTP server on `INDEXER_PORT` (8787) answers `GET /health` with uptime, last reconcile, refresh/event/error counts
  and websocket health; status 200 if at least one network's websockets are healthy, 503 otherwise.

### 10.2 What it subscribes to (`watch()`)

For each protocol, on the right network:

- `accountSubscribe` for every program and ProgramData account, every multisig, collateral mint, oracle, admin
  account and adapter account. Any change triggers a refresh.
- For every signer of every multisig: `logsSubscribe` (any transaction mentioning the signer → inspect it, 10.4) and,
  where the RPC supports it (devnet, Helius, or `NONCE_PROGRAM_SUBSCRIBE=true`), a `programSubscribe` on the System
  program filtered to 80-byte accounts whose authority is that signer: a real-time feed of nonce accounts being created.
- `logsSubscribe` on every multisig address, so executed proposals trigger a refresh stamped with the transaction.

A set of subscription keys prevents duplicates across reconciles.

### 10.3 Refreshing (`trigger` → `refresh`)

`trigger(slug, why, opts)` **debounces** by 400ms per protocol (a burst of account notifications from one transaction
becomes one refresh) and **coalesces**: if a refresh is already running, it marks `again` and runs once more when the
current one finishes. `refresh()` re-reads the protocol row, runs `collectSnapshot`, records signers and nonce
accounts, calls `ingestSnapshot` with `source: "live"` and the triggering transaction if any, logs any events, and asks
the publisher to publish the score (immediately when there is a CRITICAL event or the protocol is red).

### 10.4 Catching pre-signed transactions (`inspectSignerTx`)

When a watched signer appears in a transaction's logs, the indexer fetches the transaction and checks two things:

- If any System-program instruction touches a nonce account (`AdvanceNonceAccount` = 4, `InitializeNonceAccount` = 6,
  `AuthorizeNonceAccount` = 7), it triggers a refresh with a nonce scan.
- If the signer actually **signed** it and the **first** instruction is `AdvanceNonceAccount`, the transaction was
  built on a durable nonce: signed in advance and held. It inserts a `SIGNER_DURABLE_NONCE_TX` HIGH event, notifies,
  and enqueues deliveries directly.

### 10.5 Publishing and the keeper (`publisher.ts`)

Only active when `REGISTRY_PROGRAM_ID` is set and the devnet keypairs load. For each protocol it publishes at most once
a minute (immediately when critical), never re-sends an unchanged score, and computes `last_event_slot` as the larger of
the newest stored event slot and the slot already onchain, because the registry rejects updates that go backwards
(16.1). After publishing for the demo protocol, the **keeper** reads the demo vault's position: if the protocol is red
and the position is not shielded, it calls the permissionless `check_and_exit`; if it is no longer red and
`DEMO_MODE=true`, it re-arms the position. Every publish and shield is recorded in `onchain_publishes` and notified. If
the keypairs are missing it logs the reason once and stays off.

## 11. Seeding, verification and history

### 11.1 The watch list

`config/protocols.yaml` lists about fifteen of the largest Solana protocols (lending, perps, DEXs, liquid staking,
aggregators). Program IDs come only from each protocol's official docs or repositories (`docs_sources`). Multisigs come
from walking the upgrade authority's transaction history (`discovered_via: tx-history`) and are trusted only after
re-derivation.

### 11.2 Seeding (`scripts/seed-protocols.ts`)

For each entry: collect a snapshot; record a problem if any program fails to decode or if any listed
`upgrade_authority` multisig does **not** derive one of the program authorities at its stated vault index; for
authorities that are unmapped PDAs, try to discover a Squads multisig (`scripts/discover.ts`, which walks the
authority's transactions and verifies by PDA derivation) and suggest it. `verified` is true only with zero problems.
It then upserts the protocol (with TVL from DefiLlama, display only), replaces its watched accounts, ingests the
snapshot, and prints a verification table.

### 11.3 Backfill (`scripts/backfill.ts`)

Rebuilds up to ~180 days of history (`--days`, default 180; `--max` transactions per protocol, default 400). For each
protocol it pages through `getSignaturesForAddress` for every multisig and ProgramData account, parses each successful
transaction once (a transaction touching several watched accounts is not counted twice), and recognises:

- BPF loader `Upgrade` (instruction 3) → `PROGRAM_UPGRADED`; `SetAuthority` / `SetAuthorityChecked` (4 / 7) → a new
  authority (`UPGRADE_AUTHORITY_CHANGED`, CRITICAL) or none (`PROGRAM_MADE_IMMUTABLE`, INFO). Including inner
  instructions, so upgrades executed through a Squads vault are seen.
- Squads `configTransactionExecute`: fetches the config transaction account and decodes its actions; if the account was
  closed, the change is recorded without details and the replay forgets what it knew about that multisig.
- Direct controlled-multisig instructions (set time lock, change threshold, add or remove a member, set config
  authority) executed by a config authority without a vote → HIGH weakening.

Hits are sorted by slot, multisig changes are graded by the replay classifier (6.3), and events are inserted with
`source: "backfill"` and `detected_at` = block time. **The backfill never enqueues deliveries**: history does not page
anyone. Backfilled events in the last 30 days do count towards `recent_weakening` on the next refresh, as they should.

### 11.4 Other scripts

`inspect.ts` (control report for any program), `tvl.ts` (DefiLlama TVL), `headline-stats.ts` + `stats-lib.ts` (the
numbers in `docs/submission/headline-stats.md`), `capture-fixtures.ts` and `dev/idl.ts` (refresh test fixtures),
`dev/probe.ts` (check program IDs), `dev/pipeline-smoke.ts` (the pipeline test), `demo.ts` (devnet demo actions),
`lib.ts` (watch-list loading and table printing).

## 12. Alerts: the bot and the delivery worker

`apps/bot` is one process with two jobs.

### 12.1 The Telegram bot (`main.ts`, grammY, long polling)

Started only when `TELEGRAM_BOT_TOKEN` is set. On start it registers its command menu and descriptions with Telegram.
Every chat is a `subscriptions` row (`channel: "telegram"`, `target: chat id`, default `min_severity: HIGH`), created on
first contact.

| Command | Does |
| --- | --- |
| `/start` | Welcome text. Deep links `t.me/<bot>?start=watch_<slug>` (from the website) subscribe to that protocol at once. |
| `/watch <slug>` / `/unwatch <slug>` | Add or remove a protocol. |
| `/list` | Protocols watched, or the list of available slugs. |
| `/severity low\|medium\|high\|critical` | Minimum severity for this chat. |
| `/status <slug>` | Grade, authority kind, multisig threshold and timelock, nonce exposure, last three changes, link. |
| `/wallet <address>` | Reads the wallet's token balances and subscribes to the liquid-staking protocols whose tokens it holds. Lending and perps positions live in protocol-specific accounts and are not detected yet; the reply says so. |

### 12.2 The delivery worker (`deliver.ts`)

Every 2 seconds it takes up to 50 `deliveries` that are `pending` and due (`next_attempt_at <= now()`), joined with their
subscription, event and protocol, and sends each:

- **Telegram:** `sendMessage` with HTML from `telegramHtml()`.
- **Webhook:** the URL is re-checked by `webhookUrlProblem()` (19.3) on **every** send, because a hostname's DNS can
  change after signup. The body is `webhookPayload()` (`{version, event: {id, protocol, protocol_name, type, severity,
  title, explanation, labels, tx_signature, slot, network, detected_at}}`), signed as
  `x-overwatch-signature: hex(HMAC-SHA256(subscription secret, raw body))`, POSTed with a 10-second timeout and
  `redirect: "manual"` (a redirect is a failure, never followed). Any non-2xx response is a failure.
- **Email:** Resend's HTTP API with `emailHtml()`.

On success: `status = delivered`. On failure: `attempts + 1`, `last_error`, and `next_attempt_at = now +
min(1h, 10s × 2^(attempts−1))` (10s, 20s, 40s, 80s, 160s); after 6 attempts, `status = failed`.

### 12.3 Message format (`format.ts`)

Shared by all channels: a severity marker, the protocol name and severity, labels, the title, the explanation, a
"what you can do" line per severity (CRITICAL: consider withdrawing until the team explains; INFO: good news, no
action), and links to the transaction and the protocol page. HTML is escaped.

## 13. The public API

Route handlers under `apps/web/app/api/v1/`. Every JSON response is `{ "version": "2026-10-11", "data": … }` or
`{ "version", "error" }`.

### 13.1 Endpoints

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/v1/status` | Current mainnet slot (cached 2.5s, capped at 2.5s wait), whether the database answers, protocol count, red count, last change. Always answers. |
| GET | `/api/v1/protocols` | Every protocol's view model: grade, score, flags, breakdown, authority, threshold, timelock, nonce exposure, snapshot. |
| GET | `/api/v1/protocols/{slug}` | One protocol. |
| GET | `/api/v1/protocols/{slug}/events` | Its last 200 events. |
| GET | `/api/v1/scores/{slug}/history` | Its score history. |
| GET | `/api/v1/events?severity=&since=&limit=` | Events across protocols; `severity` is a minimum, `since` an ISO time, `limit` 1–500 (default 100). |
| GET | `/api/v1/stream` | Server-Sent Events (13.3). |
| POST | `/api/v1/subscriptions/webhook` | `{url, min_severity?, protocols?}` → creates a webhook subscription and returns its `secret` once. |
| POST | `/api/v1/subscriptions/test` | `{id, secret}` → sends a signed sample payload and reports the receiver's status. |
| POST | `/api/v1/subscriptions/email` | `{email, min_severity?, protocols?}` (only when `RESEND_API_KEY` is set). |

### 13.2 Cross-cutting behaviour (`apps/web/lib/api.ts`)

- **Validation:** every input is parsed with `zod`; failures answer 400 with the issues. Unknown protocol slugs on
  subscriptions answer 400 (an empty list would otherwise mean "all protocols").
- **Rate limiting (`guard`):** 30 requests a minute per IP anonymously; with an `x-api-key` header, the key's SHA-256 is
  looked up in `api_keys` and its own `rate_limit` applies; an unknown key answers 401. Buckets are in memory per
  serverless instance, so the limit is approximate across instances.
- **Database down (`withDb`):** connection errors answer `503 {"error": "database unavailable"}` instead of a bare 500.

### 13.3 The live stream

`GET /api/v1/stream` returns `text/event-stream`. It sends a `hello` event, then `LISTEN`s on `overwatch_events` over the
**direct** connection (a transaction pooler cannot hold `LISTEN`) and forwards each notification as an SSE event whose
name is the message kind (`event`, `score`, `registry`, `shield`, `rearm`). A comment ping every 15 seconds keeps
proxies from closing it. Closing the request unlistens.

## 14. The website

Next.js 15 App Router, React 19, server components by default. Deployed on Vercel with functions in `syd1`.

### 14.1 Layout and chrome

`app/layout.tsx` loads the fonts (Archivo Variable for display headings, IBM Plex Sans for text, IBM Plex Mono for
technical text; all self-hosted via `@fontsource`), the two stylesheets, and renders on every page:

- `Chrome` (`site/Chrome.tsx`): skip link, the boot overlay, the WebGL `<canvas class="stage">`, vignette/grid/grain
  layers, the custom cursor, the navbar (logo, `NavLinks`, the GMT `NavClock`, menu button, "Get alerts"), the
  slide-in menu (from `content.ts` `pages`), the section dock, a toast area, and shared SVG symbols.
- `Experience` (`site/Experience.tsx`): a client component that lazy-loads the animation engine (section 15) and
  re-initialises page animations on every route change.
- `Footer`.

`<html data-time="night">` selects the red-and-black palette, which the site always uses.

### 14.2 Pages

| Route | What it shows | Built from |
| --- | --- | --- |
| `/` | Hero ("The Protocol Watchdog", the text eye), How it works (Map / Watch / Warn), What you get (product cards in a pinned horizontal scroll), Get started | `app/page.tsx`, `site/AsciiEye.tsx`, `content.ts` (`steps`, `layers`), `visuals.ts` |
| `/protocols` | The control map: a sortable, filterable table of every protocol's grade, authority, m-of-n, timelock, verification | `site/Leaderboard.tsx` (TanStack Table) |
| `/protocols/[slug]` | Grade card; "Who can move your money" (an interactive control graph); Facts; Score breakdown; Onchain registry record (read live from devnet); Get alerts; Governance timeline | `lib/graph.ts` → `site/ControlGraph.tsx` (React Flow), `site/Timeline.tsx`, `@overwatch/sdk` `fetchRiskRecord` |
| `/events` | Live events: a dense log grouped by UTC day, filterable by severity and protocol, with a toggle to hide code deploys, streaming new events over SSE | `site/LiveFeed.tsx` |
| `/case-study` | The Drift incident and a step-by-step replay of current rules over the reconstructed timeline (labelled a backtest) | `core/drift.ts` → `site/data.ts` `driftReplay()` → engine |
| `/alerts` | Telegram link, webhook creation with test-fire, email sign-up | `site/AlertsForms.tsx` |
| `/docs` | The documentation and the scoring methodology: the **source of truth** for rules, events and flags | `app/docs/page.tsx` |
| `/docs/api` | API, SSE, webhooks, SDK and onchain integration | `app/docs/api/page.tsx` |
| `/methodology` | Permanent redirect to `/docs#scoring` | |

### 14.3 Data loading

`lib/data.ts` (server-only) turns database rows into view models (`ProtocolView`: authority labels, worst-case
threshold, minimum timelock, nonce-exposed signer count, flags as names). `site/data.ts` is what pages call. It wraps
every database call in `withTimeout` (5 seconds, long enough for a fresh TLS connection to a distant region) and falls
back to a **dated mainnet snapshot** (October 11, 2026, from `docs/submission/headline-stats.md`) when the database is
unreachable, so the site never breaks and always says which data it is showing. On a production deploy with no
`DATABASE_URL` at all it skips the attempt and serves the snapshot immediately. The live feed shows only `live` and
`backfill` events; the devnet demo protocol is hidden from every page.

### 14.4 Styling

Two stylesheets. `app/site.css` holds design tokens on `:root` (colours, the `--display`/`--sans`/`--mono` fonts,
radii, gutter) and the landing/chrome components; `app/pages.css` holds inner-page components (tables, the event log,
docs, forms) and the hero. Colours are tokens (`--bg` pure black, `--ink`, `--chrome`, `--dim`, `--mint` = the red
accent, `--warn` amber, `--bad` red-orange, `--ok` bone white). Some markup carries the original accent hexes; CSS
rules under `html[data-time="night"]` and `tone()` in `site/nightfall.ts` (for WebGL) map them to the red palette.

## 15. The front-end engine

`apps/web/site/engine/` gives the site its motion. It is plain TypeScript (no React), loaded lazily by `Experience`.

- **`runtime.ts`** is created once per browser session and survives client-side navigation. It owns Lenis smooth
  scrolling (driven by the GSAP ticker so ScrollTrigger stays in sync), the WebGL `Stage`, the boot sequence (landing
  page only, once per session via `sessionStorage`), the custom cursor, the menu, the dock, toasts and small effects
  (`scramble`, `magnetic`). It exposes a `Runtime` object with `morph(shape, options)`.
- **`page.ts`** runs on every route and returns a disposer. It reads `data-stage="<shape>"` and `data-stage-opts` from
  sections and creates ScrollTriggers that morph the particles as each section enters; wires reveals, count-ups and the
  pinned horizontal "What you get" track; selects the hero title one character at a time as you scroll away; and drives
  the Drift replay. On inner pages and for reduced motion it runs in "calm" mode: no intros, reveals or tilt.
- **`stage.ts`** is a Three.js scene: 42,000 particles (18,000 on low-power devices) whose target positions for every
  shape are precomputed into one float texture (256 wide); the vertex shader mixes between two rows of it with a
  per-particle delay, adds idle drift, swirl, pointer repulsion, a scan line and optional "alarm" jitter; an
  `UnrealBloomPass` adds glow. Extra layers: background dust, animated arcs, and HUD rings. Colours pass through
  `tone()`.
- **`shapes.ts`** generates the point clouds: `orb`, `radar`, `lattice`, `shield`, `burst`, `graph`, `lock`, `knot`,
  `terrain`, `globe` (with land masses), `wordmark` (the word OVERWATCH sampled from canvas text) and `scatter`.
  `rand.ts` provides the seeded generator so shapes are deterministic.
- **`AsciiEye.tsx`** (the landing hero) is separate from the stage: a 2D canvas that renders a rotating sphere of
  monospaced characters drawn from Solana-looking strings. Each character cell maps to a point on the sphere; a gaze
  vector (following the pointer, wandering when idle) decides the red iris and the empty pupil; it blinks, draws a
  tracking box around the pupil with a leader line to a readout, and shows the real mainnet slot (from
  `/api/v1/status`, estimated forward at ~400ms per slot). It pauses offscreen and draws one still frame for
  reduced motion.

## 16. The onchain programs

An Anchor workspace in `programs/` (Anchor 1.1.2), deployed to **devnet**. Tests use LiteSVM (`programs/*/tests/`).

### 16.1 `overwatch_registry` (`ZCq8qg8ALrZp4FtKra2FERRREWU8c5bu75EQ9CR3q1X`)

Stores one `RiskRecord` per protocol that any program can read.

- **Accounts:** `Config` at PDA `["config"]`: `admin`, up to 5 `publishers`, `paused`. `RiskRecord` at PDA
  `["risk", sha256(slug)]`: `protocol_id` (the 32-byte hash), `score`, `grade` (0 = A … 4 = F), `flags` (u64, same bits
  as section 7.2), `last_event_slot`, `updated_slot`, `publisher`, `version`, `bump`.
- **Instructions:** `initialize(admin)`; admin-only `add_publisher`, `remove_publisher`, `set_admin`, `set_paused`;
  `upsert_risk(protocol_id, score, grade, flags, last_event_slot)`, which requires a whitelisted publisher, the registry
  not paused, `score ≤ 100`, `grade ≤ 4`, and that `last_event_slot` does not go backwards, then writes the record,
  bumps `version` and emits `RiskUpdated { …, red }`.
- `flags::RED_MASK` and `RiskRecord::is_red()` let integrators check in one line: `flags & RED_MASK != 0`.

### 16.2 `overwatch_vault` (`9HyNZKXgyJzCoSq3PQ16etGn7eC4ZDauTuRUUe9Jef5A`)

An example of reacting to the registry: a vault that pulls deposits out of a protocol that turns red.

- **Accounts:** `Vault` at `["vault", mint]` (manager, mint, share mint, idle token account, `min_score`); `idle` token
  account at `["idle", vault]`; `shares` mint at `["shares", vault]`; `Position` at `["position", vault, protocol_id]`
  (amount, its token account, `shielded`); the position's tokens at `["position_tokens", position]`.
- **Instructions:** `initialize_vault(min_score)`; `deposit(amount)` and `withdraw(shares)` (share math in
  `shares_for_deposit` / `assets_for_shares`); manager-only `allocate(protocol_id, amount)` (refused while shielded) and
  `reset_position` (allowed only once the protocol is no longer red); and **`check_and_exit`**.
- **`check_and_exit` is permissionless by design.** Anyone may call it. It takes the protocol's `RiskRecord` typed as
  the registry's account with `seeds::program = overwatch_registry::ID`, so Anchor verifies the owner and the PDA; if
  `should_exit(record, min_score)` (red, or score below `min_score`), it moves the position's tokens back to idle,
  marks it `shielded`, and emits `ShieldTriggered`. The vault only ever reads the registry; it never trusts a signature
  from Overwatch.

### 16.3 `demo_protocol`

A program that only logs a message. What matters is who can upgrade it: the demo multisig the devnet tooling controls.

## 17. The SDK

`packages/sdk` (`@overwatch/sdk`, plus `@overwatch/sdk/tx`):

- `OverwatchClient(baseUrl, apiKey?)`: `protocols()`, `protocol(slug)`, `events({severity, since})`,
  `scoreHistory(slug)`.
- `verifyWebhook(rawBody, signature, secret)`: recomputes the HMAC with Web Crypto and compares.
- Registry helpers: program IDs, `RED_MASK`, `GRADES`, `protocolIdBytes(slug)` (sha256), `configPda`, `riskPda`,
  `decodeRiskRecord`, `fetchRiskRecord(rpcUrl, slug)`.
- `tx`: `RegistryIx` (`upsertRisk`, admin instructions) and `VaultIx` (`deposit`, `withdraw`, `allocate`,
  `checkAndExit`, `resetPosition`, PDAs), `decodePosition`, `decodeVault`, the `ShieldTriggered` discriminator. These
  build raw instructions from the IDLs in `packages/sdk/idl/` with `@solana/web3.js` as a peer dependency.

## 18. The devnet demo package

`packages/demo` exists to demonstrate the full loop on devnet: create a Squads multisig with a two-day timelock, deploy
`demo_protocol` behind it, register `overwatch-demo` in the database, fund a vault position, then weaken the multisig on
purpose (`removeTimelock`, `lowerThreshold`, `createSignerNonce`, `transferAuthority`) and `reset`. Its `connection()`
refuses any URL containing "mainnet". `env.ts` loads the six keypairs from `keys/` and the demo state from
`keys/demo-state.json`. The indexer's publisher imports its connection, keys and `rearmVault`. It is driven by
`pnpm demo <action>` (`scripts/demo.ts`). `packages/core/src/rehearsal.ts` is an offline model of the same actions used
by the pipeline smoke test and its unit tests.

## 19. Security model

### 19.1 What is trusted

- **Mainnet is read-only.** Nothing in this repository can sign a mainnet transaction.
- **Facts are re-derivable.** Every event and score carries the account address and slot. Multisig mappings are proven
  by PDA derivation, not trusted from configuration.
- **The registry trusts its publishers** (up to five keys, chosen by the admin; in production the admin should be a
  multisig). The vault trusts only the registry account, checked by owner and PDA.
- **Keys** live in `keys/` locally and on a Fly volume in production; never in the repository or the image.

### 19.2 The API surface

- All inputs are validated; unknown protocol slugs are rejected.
- Rate limits per IP and per API key; API keys are stored hashed.
- The SSE stream and read endpoints expose only public chain-derived data.
- Supabase's Data API must stay off: tables have no row-level security, and subscriptions contain chat ids, emails and
  webhook secrets.

### 19.3 Webhooks

Webhook URLs are attacker-controlled input that the servers will call, so `webhookUrlProblem()`
(`packages/core/src/net.ts`, server-only) refuses:

- anything but `https`, and URLs carrying credentials;
- hosts that resolve to private, loopback, CGNAT, link-local (including the cloud metadata address `169.254.169.254`),
  benchmarking, multicast or reserved IPv4 ranges, and unspecified, loopback, NAT64, unique-local, link-local or
  multicast IPv6 ranges; IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`, also in its normalised hex form) are unwrapped
  and checked as IPv4.

It runs at signup, on test-fire, and on every delivery; redirects are never followed. The check happens at DNS
resolution time, so a hostname that re-resolves between the check and the request (DNS rebinding) could slip through;
the code marks this as a known shortcut. `WEBHOOK_ALLOW_PRIVATE_URLS=true` disables the address check for local
development only.

Each webhook has its own secret; payloads are signed with HMAC-SHA256 over the raw body. The signature does not include
a timestamp, so a captured request could be replayed (see section 24).

## 20. Performance and reliability

- **Batched reads:** snapshots use `getMultipleAccounts` and header slices; nonce scans run hourly, not per refresh.
- **No duplicate work:** content hashing means unchanged state writes nothing; refreshes are debounced and coalesced.
- **Pacing and backoff** on RPC; reconnection with backoff on websockets.
- **Regional placement:** database, serverless functions and workers all in Sydney; a query is a local round trip.
- **Connection economy:** the transaction pooler for serverless traffic, a small pool per instance, pipelining off;
  the session pooler only for `LISTEN` and migrations.
- **Graceful degradation:** pages fall back to the dated snapshot after 5 seconds; the API answers 503 JSON; the status
  endpoint always answers.
- **Cold starts:** the first request to a fresh Vercel instance can take many seconds (function start plus new database
  connections); warm requests take about one second.

## 21. Deployment topology

| Piece | Where | Config |
| --- | --- | --- |
| Website + API | Vercel, functions in `syd1` | `vercel.json`; env: `DATABASE_URL` (transaction pooler), `DIRECT_URL` (session pooler), `HELIUS_API_KEY`, `TELEGRAM_BOT_USERNAME`, `REGISTRY_PROGRAM_ID` |
| Indexer | Fly app `overwatch-indexer`, region `syd` | `fly.indexer.toml`, `Dockerfile.worker` (`APP=indexer`), health check on `/health`, keys volume at `/app/keys` |
| Bot + delivery worker | Fly app `overwatch-bot`, region `syd`, exactly one instance | `fly.bot.toml`, `Dockerfile.worker` (`APP=bot`) |
| Database | Supabase, Sydney (`ap-southeast-2`) | Data API off; transaction pooler (6543) + session pooler (5432) |
| Programs | Solana devnet | `Anchor.toml` |

`Dockerfile.worker` installs only the selected app's dependency graph and runs it with `tsx`; keypairs are mounted at
runtime.

## 22. End-to-end walkthroughs

### 22.1 A multisig removes its timelock; a depositor's phone buzzes

1. Signers execute a Squads configuration transaction setting the timelock to 0 on a watched multisig.
2. The indexer's `logsSubscribe` on that multisig fires with the signature; its `accountSubscribe` on the multisig
   account fires with the new data. `trigger()` debounces both into one refresh 400ms later, stamped with the
   signature.
3. `refresh()` → `collectSnapshot()` reads programs, multisigs (now `timeLockSec: 0`), proposals, mints, oracles.
4. `ingestSnapshot()`: the hash differs, so the snapshot is stored; `diffSnapshots()` emits `TIMELOCK_REMOVED`
   (CRITICAL, weakening); if a signer created a nonce account in the last 14 days, it is escalated and labelled
   "Drift pattern". The event is inserted with the slot and signature.
5. `scoreSnapshot()` deducts `timelock_zero` (−25) and, with a threshold ≤ 2, sets `NO_TIMELOCK_LOW_THRESHOLD`: the
   protocol is now red. A score row is written.
6. `pg_notify` sends the `event` and `score` messages; every subscription admitting CRITICAL for this protocol gets a
   `deliveries` row.
7. Within 2 seconds the bot's worker sends the Telegram message ("🚨 … removed its 2 days safety delay … Consider
   withdrawing …"), signs and POSTs webhooks, sends emails, with retries on failure.
8. Every open `/events` page receives the event over SSE and shows it at the top, highlighted.
9. With devnet keys configured, the publisher writes the red score to the registry immediately, and any vault holding a
   position in that protocol can be exited by anyone calling `check_and_exit`.

### 22.2 A visitor opens `/events`

1. The server component calls `loadEvents(200)` and `loadProtocols()` in parallel; each goes through `withTimeout` to
   `lib/data.ts` → `@overwatch/db` queries over the transaction pooler.
2. The HTML arrives with the log already filled. `LiveFeed` hydrates, opens `EventSource("/api/v1/stream")` and shows
   "Live" once connected.
3. Filters (severity, protocol, hide code deploys) work on the client. New events arrive via SSE and are prepended.

### 22.3 A developer creates a webhook

1. `POST /api/v1/subscriptions/webhook {url, min_severity: "HIGH", protocols: ["drift"]}`.
2. Rate limit; `zod` validation; `webhookUrlProblem(url)` resolves the host and refuses internal addresses; unknown slugs
   are refused.
3. A `whsec_…` secret is generated, the subscription stored, and the secret returned once.
4. `POST /api/v1/subscriptions/test {id, secret}` re-checks the URL and sends a signed sample, returning the receiver's
   HTTP status.
5. From then on, matching events are delivered by the worker (12.2). The developer verifies each with
   `verifyWebhook(rawBody, header, secret)`.

### 22.4 Adding a protocol

1. Add the entry to `config/protocols.yaml`; `pnpm seed <slug>` proves the multisig mapping by PDA derivation and stores
   the baseline snapshot and score (no events: it is the baseline).
2. `pnpm backfill <slug>` loads its history (events only, no alerts).
3. Within 15 seconds the running indexer notices the new verified protocol, subscribes to its accounts and signers, and
   runs a refresh with a nonce scan.

## 23. Testing and CI

- **Unit tests** (Vitest): `packages/core` (58 tests: decoders against real fixtures, adapters against real IDLs, every
  rule, scoring and flags, the replay classifier, the webhook URL guard, the rehearsal model), `packages/sdk` (4),
  `apps/bot` (3).
- **Pipeline smoke test** (`pnpm smoke:pipeline`): the real database path end to end, without RPC.
- **Browser tests** (Playwright, `apps/web/e2e/smoke.spec.ts`): navigation, the control map, the case-study replay, every
  main page rendering, the red palette and the ticking GMT clock.
- **Program tests** (LiteSVM): registry authorisation, stale-update rejection and pausing; vault share maths and exits.
- **CI** (`.github/workflows/ci.yml`): on every push and pull request, a TypeScript job (install, migrate a Postgres
  service, `format:check`, lint, typecheck, unit tests, pipeline smoke test) and a programs job (install Solana + Anchor,
  `anchor build`, `cargo test`).

## 24. Known limitations and open issues

- Six watched protocols are controlled by program-owned PDAs or Realms governance that Overwatch does not decode yet;
  they carry the unmapped-control deduction and show as unverified.
- Admin-config adapters exist for Drift, Kamino, marginfi and Orca only.
- Lending and perps positions are not detected by `/wallet`; only liquid-staking tokens are.
- The registry's stale-update check uses `>=` (an update at the same `last_event_slot` is accepted), while the project
  rules say history must strictly move forward (`>`). Decide and align code, tests and docs.
- Webhook signatures carry no timestamp, so replays are possible; there is no endpoint to delete a webhook or rotate its
  secret, and the test-fire payload has a different shape from real alerts.
- The SDK's `verifyWebhook` compares signatures in non-constant time.
- API rate-limit buckets live in memory per serverless instance.
- The first request to a fresh Vercel instance is slow; the cause is not fully pinned down.
- The indexer and bot must run as single instances; there is no leader election.
- Without devnet keypairs, onchain publishing and the vault keeper are off.

## 25. Glossary

| Term | Meaning |
| --- | --- |
| **Upgrade authority** | The key or PDA allowed to replace a program's code. None = immutable. |
| **ProgramData** | The account holding an upgradeable program's executable and its 45-byte header (deploy slot, upgrade authority). |
| **Multisig / threshold** | An account that needs _m_ of _n_ signer approvals; _m_ is the threshold. |
| **Timelock** | Delay between approving a change and executing it; time for depositors to react. |
| **Config authority** | A key that can change a Squads multisig's settings without a vote. |
| **Vault PDA** | The address a Squads multisig signs with; derived from the multisig and an index 0–255 (Overwatch checks 0–7). |
| **PDA** | Program-derived address: an address off the ed25519 curve that only a program can sign for. |
| **Durable nonce** | A nonce account that lets a transaction be signed now and executed any time later; the mechanism behind the Drift attack. |
| **Snapshot** | The normalised control state of a protocol at one slot (`ControlSnapshot`). |
| **Event** | A typed change between two snapshots, with severity and plain-English text. |
| **Weakening** | A change that leaves depositors less safe. |
| **Red** | `flags & RED_MASK != 0`: a condition under which a vault should exit. |
| **Drift pattern** | Weakening within 14 days of a signer creating a durable nonce account; always CRITICAL. |
| **Backfill** | Reconstructing past events from transaction history. |
| **Registry** | The onchain program storing each protocol's score and flags. |
| **Keeper** | The indexer routine that calls `check_and_exit` when a registry update turns a protocol red. |
| **Transaction / session pooler** | Supabase connection poolers: transaction mode shares connections per transaction (serverless); session mode holds a connection per client (`LISTEN`, migrations). |
| **SSE** | Server-Sent Events: a one-way HTTP stream from server to browser. |
