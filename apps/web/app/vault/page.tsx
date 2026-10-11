import { loadShields } from "@/site/data";
import { Vault } from "@/site/VaultApp";
import { PageHero, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Protected vault" };

export default async function VaultPage() {
  const shields = await loadShields();
  return (
    <>
      <PageHero
        dock="Vault"
        eyebrow={<span data-scramble>Protected vault · demo · devnet</span>}
        lines={["A vault that", <span key="s" className="serif hero__accent">leaves first.</span>]}
        lede={
          <>
            Deposit demo USDC and the vault allocates it to a simulated strategy. When Overwatch publishes a red score for that protocol to the onchain registry, anyone (our keeper,
            or you) can call <span className="mono">check_and_exit</span> to pull the funds back.
          </>
        }
        stageAttrs={stage("lock", { colorA: "#B6FF3B", colorB: "#2BFFB0", x: 2.6, y: 0.3, yNarrow: 1.5, scale: 0.85, opacity: 1, front: true, sway: 0.45 })}
      />
      <section className="page-block" data-dock="Vault" {...stage("lock", { colorA: "#B6FF3B", colorB: "#1b2340", opacity: 0.2, scale: 1.4, front: true, sway: 0.3 })}>
        <Vault registryId={process.env.REGISTRY_PROGRAM_ID || undefined} vaultId={process.env.VAULT_PROGRAM_ID || undefined} initialShields={shields} />
      </section>
    </>
  );
}
