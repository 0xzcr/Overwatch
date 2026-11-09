import type { MetadataRoute } from "next";
import { loadEvents, loadProtocols } from "@/site/data"; // SEO component
import { SITE_URL } from "@/site/content";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;

/**
 * Every public page plus one entry per watched protocol (from the database, or the snapshot when it is down).
 * lastModified comes from real control changes, so search engines recrawl what actually changed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ cards }, { events }] = await Promise.all([loadProtocols(), loadEvents(1)]); // SEO component
  const latestEvent = events[0]?.detectedAt; // SEO component
  const latestChange = cards // SEO component
    .map((c) => c.lastChange) // SEO component
    .filter((d): d is string => !!d) // SEO component
    .sort() // SEO component
    .at(-1); // SEO component
  const pages: { path: string; priority: number; lastModified?: string }[] = [
    // SEO component
    { path: "", priority: 1, lastModified: latestEvent }, // SEO component
    { path: "/protocols", priority: 0.9, lastModified: latestChange }, // SEO component
    { path: "/events", priority: 0.8, lastModified: latestEvent }, // SEO component
    { path: "/docs", priority: 0.7 }, // SEO component
    { path: "/alerts", priority: 0.6 }, // SEO component
    { path: "/case-study", priority: 0.6 }, // SEO component
    { path: "/docs/api", priority: 0.5 }, // SEO component
  ]; // SEO component
  return [
    ...pages.map((p) => ({
      // SEO component
      url: `${SITE_URL}${p.path}`, // SEO component
      changeFrequency: "daily" as const, // SEO component
      priority: p.priority, // SEO component
      ...(p.lastModified && { lastModified: p.lastModified }), // SEO component
    })), // SEO component
    ...cards.map((c) => ({
      // SEO component
      url: `${SITE_URL}/protocols/${c.slug}`, // SEO component
      changeFrequency: "hourly" as const, // SEO component
      priority: 0.8, // SEO component
      ...(c.lastChange && { lastModified: c.lastChange }), // SEO component
    })), // SEO component
  ];
}
