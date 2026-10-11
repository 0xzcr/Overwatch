import { Site } from "@/site/Site";
import { loadSiteData } from "@/site/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <Site data={await loadSiteData()} />;
}
