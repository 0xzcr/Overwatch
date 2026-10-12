# TODO

Honest list of what's incomplete. Items here show as "coming soon" in the UI where relevant.

- **Six protocols have unmapped control** (Jito, Jupiter Aggregator, Marinade, Meteora DLMM, OpenBook v2, Sanctum): their upgrade authority is a program-owned PDA or Realms DAO we don't decode yet, so they show as unverified and take the unmapped-control deduction.
- **Admin config adapters** exist for Drift, Kamino, marginfi and Orca only. Other protocols show "Admin config isn't mapped" on their page.
- **Email alerts** need `RESEND_API_KEY`; without it the alerts page says email isn't configured.
- **Telegram** needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`; without them the bot links are hidden.
- **Deployments without a database** show the Oct 11 2026 mainnet snapshot: no TVL, nonce exposure, change history, itemised score deductions or event history.
