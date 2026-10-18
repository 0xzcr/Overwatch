import { PageHero, SectionHead, stage } from "@/site/ui";

export const metadata = {
  title: "API reference",
  alternates: { canonical: "/docs/api" },
};

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

function Code({ title, children }: { title: string; children: string }) {
  return (
    <div className="codeblock">
      <div className="vz-win">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <pre className="mono">{children}</pre>
    </div>
  );
}

export default function ApiDocs() {
  return (
    <>
      <PageHero
        dock="API"
        lines={["API"]}
        lede={
          <>
            JSON over HTTPS. Every response is <span className="mono">{"{ version, data }"}</span>. Pass{" "}
            <span className="mono">x-api-key</span> for paid tiers; anonymous use is limited to 30 requests a minute.
          </>
        }
        stageAttrs={stage("terrain", {
          colorA: "#5AA8FF",
          colorB: "#8B7CFF",
          x: 2.2,
          y: -0.2,
          yNarrow: 1.2,
          scale: 0.9,
          opacity: 1,
          autoRotate: 0.06,
        })}
      />

      <section
        className="page-block"
        data-dock="Endpoints"
        {...stage("terrain", {
          colorA: "#5AA8FF",
          colorB: "#1b2340",
          opacity: 0.25,
          y: -1.2,
          scale: 1.3,
          autoRotate: 0.02,
        })}
      >
        <SectionHead title="Endpoints" />
        <table className="dtable dtable--api">
          <tbody>
            {EP.map(([m, p, d]) => (
              <tr key={p}>
                <td className={`mono method-tag is-${m.toLowerCase()}`}>{m}</td>
                <td className="mono">{p}</td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="page-block" data-dock="Examples">
        <SectionHead title="Examples" />
        <div className="codegrid" data-reveal>
          <Code title="curl">{`curl -s https://<host>/api/v1/protocols/drift -H "x-api-key: $OVERWATCH_KEY" \\
  | jq '.data | {grade, score, flagNames, threshold, timelockSec}'

curl -s "https://<host>/api/v1/events?severity=critical&since=2026-10-01T00:00:00Z"

curl -N https://<host>/api/v1/stream   # event: event / score / registry / shield`}</Code>
          <Code title="create a webhook">{`curl -X POST https://<host>/api/v1/subscriptions/webhook \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://example.com/hooks/overwatch",
       "min_severity":"HIGH",
       "protocols":["drift","kamino-lend"]}'`}</Code>
        </div>
      </section>

      <section className="page-block" data-dock="Webhooks">
        <SectionHead
          title="Webhook signatures"
          lede={
            <>
              Each delivery is signed:{" "}
              <span className="mono">x-overwatch-signature = hex(HMAC-SHA256(secret, rawBody))</span>. Failed deliveries
              retry with exponential backoff, up to 6 attempts.
            </>
          }
          row
        />
        <Code title="verify.ts">{`import { verifyWebhook } from "@overwatch/sdk";

const ok = await verifyWebhook(rawBody, req.headers["x-overwatch-signature"], process.env.OVERWATCH_SECRET);
if (!ok) return new Response(null, { status: 401 });`}</Code>
      </section>

      <section className="page-block" data-dock="Onchain">
        <SectionHead
          title="Onchain: read the registry from your program"
          lede={
            <>
              The <span className="mono">RiskRecord</span> PDA is{" "}
              <span className="mono">[&quot;risk&quot;, sha256(slug)]</span> under the registry program. Check the owner
              and the PDA, then test <span className="mono">flags &amp; RED_MASK</span>.
            </>
          }
          row
        />
        <div className="codegrid" data-reveal>
          <Code title="lib.rs">{`#[account(seeds = [b"risk", protocol_id.as_ref()], bump = risk.bump,
          seeds::program = overwatch_registry::ID)]
pub risk: Account<'info, overwatch_registry::RiskRecord>,   // owner checked by Account<>
...
if risk.flags & overwatch_registry::flags::RED_MASK != 0 { /* exit */ }`}</Code>
          <Code title="sdk.ts">{`import { fetchRiskRecord } from "@overwatch/sdk";

const r = await fetchRiskRecord("https://api.devnet.solana.com", "drift");
// { score, grade, flags, red, ... }`}</Code>
        </div>
      </section>
    </>
  );
}
