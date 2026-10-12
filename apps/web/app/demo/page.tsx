import { hasState } from "@overwatch/demo";
import { DemoConsole } from "@/site/DemoConsole";
import { Badge, PageHero, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo console" };

export default function Demo() {
  const live = process.env.DEMO_MODE === "true" && hasState();
  return (
    <>
      <PageHero
        dock="Demo"
        lines={["Demo console"]}
        lede={
          live ? (
            <>
              The demo protocol is a real devnet program whose upgrade authority is a Squads v4 vault: 2-of-3 signers with a 2-day timelock. Its multisig is controlled, so these
              buttons execute instantly. Weaken it and watch the alert, the registry update and the vault exit arrive.
            </>
          ) : (
            <>
              Weaken a demo protocol (a 2-of-3 Squads multisig with a 2-day timelock) and watch the alert, the registry update and the vault exit. This deployment has no devnet
              keys, so it runs a rehearsal: the same rules and scoring code, with no transactions sent.
            </>
          )
        }
        aside={<div className="detail__badges">{live ? <Badge tone="violet">devnet</Badge> : <Badge tone="dim">rehearsal</Badge>}</div>}
        stageAttrs={stage("lattice", { colorA: "#D27DFF", colorB: "#2BFFB0", x: 2.8, y: 0.4, yNarrow: 1.5, scale: 0.85, opacity: 1, autoRotate: 0.14, tiltX: 0.2 })}
      />
      <section className="page-block" data-dock="Console" {...stage("lattice", { colorA: "#D27DFF", colorB: "#1b2340", opacity: 0.2, scale: 1.3, autoRotate: 0.05 })}>
        <DemoConsole mode={live ? "live" : "rehearsal"} />
        <p className="page-note">
          {live ? (
            <>
              Each action lands onchain, the indexer detects it within seconds, the score is published to the devnet registry, and a red score lets anyone call the vault&apos;s
              check_and_exit.
            </>
          ) : (
            <>
              For the live version, set <span className="mono">DEMO_MODE=true</span>, run <span className="mono">pnpm demo:setup</span> and start the indexer. See{" "}
              <span className="mono">docs/DEMO.md</span>.
            </>
          )}
        </p>
      </section>
    </>
  );
}
