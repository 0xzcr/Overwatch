# Demo runbook

How to show Overwatch end to end in about five minutes. The story is **problem → map → live alarm → automatic exit → integration**. The demo moment is a vault pulling its own funds out seconds after a multisig is weakened on devnet.

There are two ways to run it:

| | Live (devnet) | Rehearsal |
|---|---|---|
| What runs | Real devnet transactions, indexer, Telegram bot, registry, vault keeper | The same rules and scoring code on the server, no transactions |
| Needs | `.env`, funded keypairs in `keys/`, Postgres, `pnpm demo:setup` | Nothing; any `pnpm build && pnpm start` of the web app |
| Use it for | The real demo | Practice, recordings, and the fallback when devnet misbehaves |

The `/demo` page picks the mode itself: live when `DEMO_MODE=true` and `keys/demo-state.json` exists, rehearsal otherwise. The page says which one it's in.

## The five-minute script

Open these tabs first, in this order: `/case-study`, `/protocols`, `/protocols/marginfi`, `/demo`, `/vault`, `/docs/api`. Keep Telegram open on your phone or in a window beside the browser.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | `/case-study` | Let the hero sit for a beat, scroll through the paragraph to the replay, then click **next →** once to reach **Mar 23**. | "Drift lost $285M in April and no smart contract had a bug. Two of five council signers had pre-signed transactions that never expire. That was public onchain nine days before the drain. Here is our rules engine replaying it: CRITICAL on March 23." |
| 0:45 | `/protocols` | Point at the headline line, then the red row and the three *no delay* rows. | "We map who can change the top 15 Solana protocols. One can be upgraded by a single private key. Three multisigs have no timelock at all." |
| 1:15 | `/protocols/marginfi` | Show the control graph, then hover a dotted term (*Timelock*) to show the plain-English tooltip, then the score breakdown. | "Every grade is a list of deductions with a link to the raw account. No opinions." |
| 1:45 | `/demo` | Click **Remove timelock**. Wait. Read the CRITICAL alert, point at the registry line going red and the vault shield line. Glance at the phone. | "This is a real program on devnet behind a 2-of-3 Squads multisig with a two-day timelock. I just removed the timelock. Overwatch caught it, the alert reached Telegram, the score went red in an onchain registry, and the vault that had funds in this protocol pulled them out by itself." |
| 2:45 | `/demo` | Click **Create nonce account for signer**. Point at the *Drift pattern* label. | "Now a signer creates a durable nonce account: the exact sequence before the Drift drain. That's labelled for what it is." |
| 3:15 | `/vault` | Show the position marked shielded and the shield log entry, open its explorer link. | "check_and_exit is permissionless. It reads the registry account, checks the owner and PDA, and moves funds back to idle. Any Solana program can do the same with four lines of Anchor." |
| 3:45 | `/docs/api` | Point at the webhook and SSE rows. Optionally run the curl example in a terminal. | "Curators, wallets and risk desks get the same events over a signed webhook, a live stream or REST." |
| 4:15 | `/demo` | Click **Reset demo**. | "Reset restores the controls and the keeper re-arms the vault, so this is repeatable. Overwatch: know who can move your money, and hear about it the moment that changes." |

**90-second cut:** case-study hero (one line), `/demo` Remove timelock, `/vault`, close. Skip the control map.

**Questions you'll get:**

- *Isn't the demo multisig unusual?* Yes, on purpose: its config authority is the demo admin so changes execute instantly instead of waiting two days. Overwatch flags that as CONTROLLED_MULTISIG from the start, so the demo protocol is never graded as safe.
- *Is the Drift timeline real data?* It's reconstructed from the public incident reports linked on the page. Signer and nonce names are placeholders because the reports don't publish full addresses.
- *How fast is it?* The live console shows the time from click to alert. Expect a few seconds on devnet, mostly confirmation time.

## Setting up the live demo

Do this the day before, then the short checklist below an hour before.

1. **Environment.** `cp .env.example .env` and fill in:
   - `HELIUS_API_KEY` (strongly recommended; public devnet RPC rate-limits and drops websocket subscriptions).
   - `DATABASE_URL`, `DEMO_MODE=true`, `NEXT_PUBLIC_SITE_URL`.
   - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` for phone alerts.
   - `FUNDER_KEYPAIR_PATH` pointing at a devnet keypair with a few SOL, so setup doesn't depend on the airdrop faucet.
2. **Keys.** `keys/` needs `demo-admin-keypair.json`, `publisher-keypair.json`, `signer-a-keypair.json`, `signer-b-keypair.json`, `signer-c-keypair.json` and `attacker-keypair.json`. Use the same keys as the original setup: the devnet registry at `REGISTRY_PROGRAM_ID` is already initialized with that admin. With fresh keys, deploy your own registry and vault (`anchor build && anchor deploy`) and set `REGISTRY_PROGRAM_ID` and `VAULT_PROGRAM_ID`. Generate keys with `solana-keygen new --no-bip39-passphrase -o keys/<name>.json`.
3. **Database.** `docker compose up -d && pnpm db:migrate && pnpm seed`. Then run `pnpm smoke:pipeline`: it checks the DB pipeline end to end (rules engine, events, NOTIFY, signed webhook delivery) without touching any RPC.
4. **Demo protocol.** `anchor build` (produces `target/deploy/overwatch_demo_protocol.so`), then `pnpm demo:setup`. This creates the demo multisig, deploys the demo program behind it, initializes the vault with a funded position, and registers `overwatch-demo` in the database. It writes `keys/demo-state.json`.
5. **Services**, each in its own terminal:
   ```sh
   pnpm --filter @overwatch/indexer start   # health: http://localhost:8787/health
   pnpm --filter @overwatch/bot start       # Telegram bot + webhook/email delivery worker
   pnpm --filter @overwatch/web build && pnpm --filter @overwatch/web start
   ```
6. **Telegram.** Open the bot and send `/watch overwatch-demo`. Then send `/status overwatch-demo` to confirm it answers.
7. **Dry run.** Go through the whole script once, then **Reset demo**. Run the e2e test against the live console: `E2E_DEVNET=true pnpm --filter @overwatch/web e2e`.

### One hour before

- [ ] `curl localhost:8787/health` shows a recent `lastReconcile` and few errors.
- [ ] `/demo` shows **devnet**, Multisig `2-of-3`, Timelock `48h`, Upgrade authority `multisig vault`, Vault position allocated. If not, click **Reset demo** and wait for the keeper to re-arm.
- [ ] Funder and publisher wallets have SOL: `solana balance <address> -u devnet`.
- [ ] Every tab has been opened once, so the boot animation and WebGL shaders are warm.
- [ ] Desktop notifications off, browser zoom 100%, window at least 1440 px wide (the split console needs it).
- [ ] A screen recording of a successful run is on the desktop.

## When something goes wrong

| Symptom | Do this |
|---|---|
| The action log shows an RPC or airdrop error | Click the action again once. If it fails again, switch to rehearsal (below) and say so. |
| Action confirmed but no alert after ~20 s | The indexer's websocket dropped. The action is onchain, so open the signature on the explorer, then restart the indexer; it reconciles on start and the alert arrives. |
| Alert arrived but no vault shield | The keeper runs after the registry update. Check the indexer log for `keeper` lines, and show `/vault` once it lands. |
| Devnet is down or very slow | Restart the web app without `DEMO_MODE` (or with `DEMO_MODE=false`). `/demo` switches to rehearsal: same buttons, same alerts, same registry and vault lines, labelled as a rehearsal. |
| No internet at all | Run the web app locally in rehearsal mode. The case study, control map snapshot and demo rehearsal all work offline. |

## What each step proves

| Demo step | Code that runs |
|---|---|
| Drift replay | `packages/core/src/drift.ts` through `diffSnapshots` and `scoreSnapshot` in `packages/core/src/rules.ts` and `scoring.ts` |
| Control map | `apps/indexer` collecting mainnet accounts (read-only), `packages/core/src/collect.ts`, grades from `scoring.ts` |
| Remove timelock | `packages/demo` sends the Squads config transaction; the indexer's account subscription triggers `ingestSnapshot` (`packages/db/src/pipeline.ts`) |
| Telegram / webhook | `apps/bot/src/deliver.ts`, HMAC-SHA256 signature in `x-overwatch-signature` |
| Registry goes red | `apps/indexer/src/publisher.ts` → `upsert_risk` in `programs/overwatch_registry` |
| Vault exits | Keeper calls `check_and_exit` in `programs/overwatch_vault` |
| Rehearsal | `packages/core/src/rehearsal.ts`: the demo protocol modelled as snapshots, run through the same rules and scoring |
