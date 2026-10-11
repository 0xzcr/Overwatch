# Overwatch
public protocol overwatch @solana

## Web (`apps/web`)

Next.js site with a persistent Three.js particle stage, GSAP scroll animations and Lenis smooth scrolling:

- Pages: `/` landing, `/protocols` control map, `/protocols/[slug]` detail (React Flow control graph, facts, score breakdown, registry, timeline), `/events` live feed (SSE), `/case-study` (why Overwatch exists + Drift replay), `/alerts`, `/vault` (devnet, wallet adapter), `/demo` (needs `DEMO_MODE=true`), `/methodology`, `/docs/api`.
- Data comes from the database. When it is unreachable, pages fall back to the mainnet snapshot in `docs/submission/headline-stats.md` and say so in the UI.
- `site/` holds shared components, copy (`content.ts`), data loaders (`data.ts`) and the animation engine (`engine/`: `runtime.ts` persists across navigations, `page.ts` runs per route). Sections pick their particle shape with `data-stage` attributes.
- The public API under `app/api/*` is unchanged.

```sh
pnpm --filter @overwatch/web dev     # http://localhost:3000
pnpm --filter @overwatch/web e2e     # Playwright smoke tests against a running server
```
