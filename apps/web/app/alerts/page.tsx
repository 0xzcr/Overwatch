import { getProtocols } from "@/lib/data";
import { AlertsForms } from "@/components/AlertsForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function Alerts({ searchParams }: { searchParams: Promise<{ protocol?: string }> }) {
  const [ps, sp] = await Promise.all([getProtocols(), searchParams]);
  return (
    <div className="px-4 sm:px-10 pt-28 space-y-10">
      <header className="max-w-3xl">
        <p className="label">alerts</p>
        <h1 className="text-4xl sm:text-6xl font-light mt-4">Get the alarm <span className="serif text-accent">where you are</span>.</h1>
        <p className="text-chrome mt-4">Each alert is plain English: what changed, why it matters, what you can do, with links to the transaction. Free for depositors. Curators and funds use the API.</p>
      </header>
      <AlertsForms protocols={ps.map((p) => ({ slug: p.slug, name: p.name }))} preselect={sp.protocol} bot={process.env.TELEGRAM_BOT_USERNAME || undefined} emailEnabled={!!process.env.RESEND_API_KEY} />
    </div>
  );
}
