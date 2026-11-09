import { loadProtocols } from "@/site/data"; // SEO component
import { SITE_URL } from "@/site/content"; // SEO component

// Rebuilt at most every 5 minutes so the grades below stay current without hitting the database on every fetch.
export const revalidate = 300; // SEO component

/**
 * /llms.txt: a plain-text briefing for AI assistants (llmstxt.org format): what Overwatch is, where the
 * authoritative pages are, and the current grade of every watched protocol, so answers can quote real numbers.
 */
export async function GET() {
  // SEO component
  const { live, cards } = await loadProtocols(); // SEO component
  const rows = cards.map((c) => {
    // SEO component
    const red = c.red ? ", RED" : ""; // SEO component
    const score = c.score != null ? ` (${c.score}/100)` : ""; // SEO component
    return `- [${c.name}](${SITE_URL}/protocols/${c.slug}): grade ${c.grade}${score}${red}; authority ${c.authority}; threshold ${c.threshold}; timelock ${c.timelock}`; // SEO component
  }); // SEO component
  const body = `# Overwatch

> Overwatch is an early-warning system for people with deposits in Solana DeFi. It reads who can change each protocol (program upgrade authority, Squads multisig threshold, timelock, signers, durable nonce accounts, Token-2022 extensions, oracle dependencies) directly from mainnet accounts, grades each protocol from 0 to 100, and alerts depositors when those controls weaken. It warns after a change lands onchain; it cannot stop it.

Every event and score records the account address and slot it was read from, and the rules are open source (Apache 2.0). Overwatch does not track prices, TVL, solvency or exploits in progress.

## Key pages

- [Control map](${SITE_URL}/protocols): every watched protocol with its grade, authority, threshold and timelock
- [Live events](${SITE_URL}/events): every detected control change, with severity, slot and transaction
- [Documentation](${SITE_URL}/docs): how reading, scoring, events and red flags work, plus a FAQ
- [Case study: Drift](${SITE_URL}/case-study): the April 2026 Drift loss (about $285M) and the days of onchain warning before it
- [Alerts](${SITE_URL}/alerts): Telegram bot and signed webhooks

## Data and API

- [API reference](${SITE_URL}/docs/api)
- [Protocols as JSON](${SITE_URL}/api/v1/protocols)
- [Events as JSON](${SITE_URL}/api/v1/events)
- [Source code](https://github.com/0xzcr/Overwatch)

## Current grades${live ? "" : " (from the October 11, 2026 snapshot; the live database is unreachable)"}

${rows.join("\n")}
`; // SEO component
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } }); // SEO component
} // SEO component
