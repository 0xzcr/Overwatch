# Overwatch
public protocol overwatch @solana

## Web (`apps/web`)

Next.js site with a persistent Three.js particle stage, GSAP scroll animations and Lenis smooth scrolling:

- Pages: `/` landing, `/protocols` control map, `/protocols/[slug]` detail (React Flow control graph, facts, score breakdown, registry, timeline), `/events` live feed (SSE), `/case-study` (why Overwatch exists + Drift replay), `/alerts`, `/vault` (devnet, wallet adapter), `/demo` (needs `DEMO_MODE=true`), `/methodology`, `/docs/api`.
- Data comes from the database. When it is unreachable, pages fall back to the mainnet snapshot in `docs/submission/headline-stats.md` and say so in the UI, and the `/api/v1` routes answer `503 {"error":"database unavailable"}`.
- From 18:00 to 06:00 in the visitor's local time the accent turns red and black, particles included (`site/nightfall.ts`, `html[data-time="night"]` in `site.css`). `?time=night` or `?time=day` forces a palette for the tab; `?time=auto` returns to the clock.
- `/demo` sends real devnet transactions when `DEMO_MODE=true` and the demo is set up. Otherwise it runs a rehearsal: the same rules and scoring code (`packages/core/src/rehearsal.ts`) with no transactions sent.
- `site/` holds shared components, copy (`content.ts`), data loaders (`data.ts`) and the animation engine (`engine/`: `runtime.ts` persists across navigations, `page.ts` runs per route). Sections pick their particle shape with `data-stage` attributes.
- The public API under `app/api/*` is unchanged.

```sh
pnpm --filter @overwatch/web dev     # http://localhost:3000
pnpm --filter @overwatch/web e2e     # Playwright smoke tests against a running server
```

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm db:migrate && pnpm smoke:pipeline   # Postgres → rules → events/scores → NOTIFY → signed webhook, no RPC needed
```

## Demo

See [`docs/DEMO.md`](docs/DEMO.md) for the five-minute script, live devnet setup and fallbacks.
