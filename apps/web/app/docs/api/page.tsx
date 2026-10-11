import { Section } from "@/components/ui/Section";
export const metadata = { title: "API reference" };

const EP: [string, string, string][] = [
  ["GET", "/api/v1/protocols", "All watched protocols with grade, score, flags and key facts."],
  ["GET", "/api/v1/protocols/:slug", "One protocol including the full control snapshot."],
  ["GET", "/api/v1/protocols/:slug/events", "Governance timeline for a protocol."],
  ["GET", "/api/v1/events?severity=high&since=ISO", "Events across protocols, filtered by minimum severity and time."],
  ["GET", "/api/v1/scores/:slug/history", "Score history."],
  ["GET", "/api/v1/stream", "Server-Sent Events: event, score, registry, shield."],
  ["POST", "/api/v1/subscriptions/webhook", "Create a webhook. Returns the signing secret once."],
  ["POST", "/api/v1/subscriptions/test", "Test-fire a webhook with a signed sample payload."],
];

const Code = ({ children }: { children: string }) => <pre className="mono text-xs bg-[var(--bg-2)] border hairline p-4 overflow-x-auto leading-relaxed text-chrome">{children}</pre>;

export default function ApiDocs() {
  return (
    <article className="px-4 sm:px-10 pt-28 max-w-4xl space-y-14">
      <header>
        <p className="label">api · version 2026-10-11</p>
        <h1 className="text-4xl sm:text-6xl font-light mt-4">Overwatch <span className="serif text-accent">API</span></h1>
        <p className="text-chrome mt-5">JSON over HTTPS. Every response is <span className="mono">{`{ version, data }`}</span>. Pass <span className="mono">x-api-key</span> for paid tiers. Anonymous use is limited to 30 requests a minute.</p>
      </header>
      <Section k="01" title="Endpoints">
        <table className="w-full text-sm border hairline"><tbody>{EP.map(([m, p, d]) => <tr key={p} className="border-b hairline"><td className="px-3 py-2.5 mono text-accent text-xs">{m}</td><td className="px-3 py-2.5 mono text-xs">{p}</td><td className="px-3 py-2.5 text-chrome">{d}</td></tr>)}</tbody></table>
      </Section>
      <Section k="02" title="Examples">
        <Code>{`curl -s https://<host>/api/v1/protocols/drift -H "x-api-key: $OVERWATCH_KEY" | jq '.data | {grade, score, flagNames, threshold, timelockSec}'

curl -s "https://<host>/api/v1/events?severity=critical&since=2026-10-01T00:00:00Z"

curl -N https://<host>/api/v1/stream     # event: event / score / registry / shield`}</Code>
        <Code>{`curl -X POST https://<host>/api/v1/subscriptions/webhook -H 'content-type: application/json' \\
  -d '{"url":"https://example.com/hooks/overwatch","min_severity":"HIGH","protocols":["drift","kamino-lend"]}'`}</Code>
      </Section>
      <Section k="03" title="Webhook signatures">
        <p className="text-chrome mb-3">Each delivery is signed: <span className="mono">x-overwatch-signature = hex(HMAC-SHA256(secret, rawBody))</span>. Failed deliveries are retried with exponential backoff, up to 6 attempts.</p>
        <Code>{`import { verifyWebhook } from "@overwatch/sdk";
const ok = await verifyWebhook(rawBody, req.headers["x-overwatch-signature"], process.env.OVERWATCH_SECRET);`}</Code>
      </Section>
      <Section k="04" title="Onchain: read the registry from your program">
        <p className="text-chrome mb-3">The <span className="mono">RiskRecord</span> PDA is <span className="mono">[&quot;risk&quot;, sha256(slug)]</span> under the registry program. Check the owner and the PDA, then test <span className="mono">flags &amp; RED_MASK</span>.</p>
        <Code>{`#[account(seeds = [b"risk", protocol_id.as_ref()], bump = risk.bump, seeds::program = overwatch_registry::ID)]
pub risk: Account<'info, overwatch_registry::RiskRecord>,   // owner checked by Account<>
...
if risk.flags & overwatch_registry::flags::RED_MASK != 0 { /* exit */ }`}</Code>
        <Code>{`import { fetchRiskRecord } from "@overwatch/sdk";
const r = await fetchRiskRecord("https://api.devnet.solana.com", "drift");  // { score, grade, flags, red, ... }`}</Code>
      </Section>
    </article>
  );
}
