import { DemoConsole } from "@/components/DemoConsole";
export const metadata = { title: "Demo console" };
export default function Demo() {
  return (
    <div className="px-4 sm:px-10 pt-28 space-y-8">
      <header className="max-w-4xl">
        <p className="label">demo console · devnet · real Squads v4 transactions</p>
        <h1 className="text-4xl sm:text-6xl font-light mt-4">Weaken the locks. <span className="serif text-accent">Watch the alarm.</span></h1>
        <p className="text-chrome mt-4 max-w-3xl">The demo protocol is a real devnet program whose upgrade authority is a Squads v4 vault: 2-of-3 signers with a 2-day timelock. Its multisig is <em>controlled</em> (a config authority can change it without a vote), so these buttons execute instantly. Overwatch flags that as CONTROLLED_MULTISIG from the start. Each action lands onchain, the indexer detects it within seconds, the score is published to the devnet registry, and red scores make the protected vault pull its funds out permissionlessly.</p>
      </header>
      <DemoConsole />
    </div>
  );
}
