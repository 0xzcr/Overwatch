import { getPublishes } from "@/lib/data";
import { VaultApp } from "@/components/VaultApp";
import { WalletProviders } from "@/components/WalletProviders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Protected vault" };

export default async function Vault() {
  const shields = (await getPublishes(100)).filter((p) => p.kind === "shield").map((p) => ({ tx: p.tx, at: p.at, slug: p.slug }));
  return (
    <div className="px-4 sm:px-10 pt-28 space-y-8">
      <header className="max-w-4xl">
        <p className="label">protected vault · demo · devnet</p>
        <h1 className="text-4xl sm:text-6xl font-light mt-4">A vault that <span className="serif text-accent">leaves</span> before the fire.</h1>
        <p className="text-chrome mt-4">Deposit demo USDC and the vault allocates it to a strategy. When Overwatch publishes a red score for that protocol to the onchain registry, anyone (our keeper, or you) can call <span className="mono">check_and_exit</span> to pull the funds back.</p>
      </header>
      <WalletProviders>
        <VaultApp registryId={process.env.REGISTRY_PROGRAM_ID ?? ""} vaultId={process.env.VAULT_PROGRAM_ID ?? ""} initialShields={shields} />
      </WalletProviders>
    </div>
  );
}
