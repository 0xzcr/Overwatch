# Overwatch
public protocol overwatch @solana

## Web (`apps/web`)

The site is a single page, "Overwatch Editions — The Vigil Edition", built with Next.js, Three.js and GSAP:

- `app/page.tsx` loads live protocols and events from the database. When the database is unreachable it falls back to the mainnet snapshot in `docs/submission/headline-stats.md`, so the page always renders.
- `site/` holds the page: copy (`content.ts`), server data (`data.ts`), markup (`Site.tsx`), animated product mockups (`visuals.ts`) and the client engine (`engine/`: particle stage, scroll, modal, filters, Drift replay).
- The public API under `app/api/*` is unchanged. Old page routes (`/protocols/:slug`, `/case/drift`, `/methodology` and so on) redirect to the matching section or modal, so links from the Telegram bot and alert emails keep working.

```sh
pnpm --filter @overwatch/web dev     # http://localhost:3000
pnpm --filter @overwatch/web e2e     # Playwright smoke tests against a running server
```
