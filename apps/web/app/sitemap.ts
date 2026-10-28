import type { MetadataRoute } from "next";
import { loadProtocols } from "@/site/data";
import { SITE_URL } from "@/site/content";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;

/** Every public page plus one entry per watched protocol (from the database, or the snapshot when it is down). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { cards } = await loadProtocols();
  const pages = ["", "/protocols", "/events", "/case-study", "/alerts", "/docs", "/docs/api"];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "daily" as const })),
    ...cards.map((c) => ({ url: `${SITE_URL}/protocols/${c.slug}`, changeFrequency: "hourly" as const })),
  ];
}
