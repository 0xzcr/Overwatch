import type { MetadataRoute } from "next";
import { loadEvents, loadProtocols } from "@/site/data";
import { SITE_URL } from "@/site/content";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;

/**
 * Every public page plus one entry per watched protocol (from the database, or the snapshot when it is down).
 * lastModified comes from real control changes, so search engines recrawl what actually changed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ cards }, { events }] = await Promise.all([loadProtocols(), loadEvents(1)]);
  const latestEvent = events[0]?.detectedAt;
  const latestChange = cards
    .map((c) => c.lastChange)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const pages: { path: string; priority: number; lastModified?: string }[] = [
    { path: "", priority: 1, lastModified: latestEvent },
    { path: "/protocols", priority: 0.9, lastModified: latestChange },
    { path: "/events", priority: 0.8, lastModified: latestEvent },
    { path: "/docs", priority: 0.7 },
    { path: "/alerts", priority: 0.6 },
    { path: "/case-study", priority: 0.6 },
    { path: "/docs/api", priority: 0.5 },
  ];
  return [
    ...pages.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      changeFrequency: "daily" as const,
      priority: p.priority,
      ...(p.lastModified && { lastModified: p.lastModified }),
    })),
    ...cards.map((c) => ({
      url: `${SITE_URL}/protocols/${c.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
      ...(c.lastChange && { lastModified: c.lastChange }),
    })),
  ];
}
