import { DemoConsole } from "@/site/DemoConsole";
import { Badge, PageHero, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo console" };

export default function Demo() {
  const enabled = process.env.DEMO_MODE === "true";
  return (
    <>
      <PageHero
        dock="Demo"
        eyebrow={<span data-scramble>Demo console · devnet · real Squads v4 transactions</span>}
        lines={["Weaken the locks.", <span key="s" className="serif hero__accent">Watch the alarm.</span>]}
        lede={
          <>
            The demo protocol is a real devnet program whose upgrade authority is a Squads v4 vault: 2-of-3 signers with a 2-day timelock. Its multisig is controlled, so these
            buttons execute instantly, and Overwatch flags it as CONTROLLED_MULTISIG from the start.
          </>
        }
        aside={
          <div className="detail__badges">
            <Badge tone="violet">devnet only</Badge>
            <Badge tone="accent">source: demo</Badge>
          </div>
        }
        stageAttrs={stage("lattice", { colorA: "#D27DFF", colorB: "#2BFFB0", x: 2.8, y: 0.4, yNarrow: 1.5, scale: 0.85, opacity: 1, autoRotate: 0.14, tiltX: 0.2 })}
      />
      <section className="page-block" data-dock="Console" {...stage("lattice", { colorA: "#D27DFF", colorB: "#1b2340", opacity: 0.2, scale: 1.3, autoRotate: 0.05 })}>
        <DemoConsole enabled={enabled} />
        <p className="page-note mono">
          Each action lands onchain, the indexer detects it within seconds, the score is published to the devnet registry, and red scores make the protected vault pull its funds
          out permissionlessly.
        </p>
      </section>
    </>
  );
}
