# TODO

Honest list of what's incomplete. Items here show as "coming soon" in the UI where relevant.

## Coverage

- **Six protocols have unmapped control** (Jito, Jupiter Aggregator, Marinade, Meteora DLMM, OpenBook v2, Sanctum):
  their upgrade authority is a program-owned PDA or Realms DAO we don't decode yet, so they show as unverified and take
  the unmapped-control deduction.
- **Admin config adapters** exist for Drift, Kamino, marginfi and Orca only. Other protocols show "Admin config isn't
  mapped" on their page.
- **`/wallet` in the bot** detects liquid-staking tokens only; lending and perps positions need per-protocol adapters.

## Infrastructure

- **Indexer and bot are not hosted yet.** They run locally; deploy them to Fly with `fly.indexer.toml` and
  `fly.bot.toml` (region `syd`, next to the database) so alerts keep flowing.
- **Onchain publishing** needs the devnet publisher keypair in `keys/` (or a Fly volume); without it the registry is
  not updated.
- **Slow first request** on a fresh Vercel instance (many seconds, then about one second warm). Cause not pinned down.

## Hardening

- **Registry stale-slot check** uses `>=` (an update at the same `last_event_slot` is accepted) while the project rules
  say history must strictly move forward (`>`). Decide, then align `programs/overwatch_registry`, its tests and the docs.
- **Webhooks:** signatures have no timestamp (replay is possible); there is no endpoint to delete a webhook or rotate its
  secret; the test-fire payload has a different shape from real alerts; the URL guard checks DNS at resolve time, so DNS
  rebinding is not fully covered.
- **SDK `verifyWebhook`** compares signatures in non-constant time.
- **API rate limits** are kept in memory per serverless instance.

## Configuration

- **Email alerts** need `RESEND_API_KEY`; without it the alerts page says email isn't configured.
- **Telegram** needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`; without them the bot links are hidden.
- **Deployments without a database** show the Oct 11 2026 mainnet snapshot: no TVL, nonce exposure, change history,
  itemised score deductions or event history.
