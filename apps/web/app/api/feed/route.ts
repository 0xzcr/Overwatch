import { loadEvents } from "@/site/data";

export const dynamic = "force-dynamic";

/** Polling fallback for the live events page: the same list the page renders, for when the stream is reconnecting. */
export async function GET() {
  const { live, events } = await loadEvents(200);
  // Every open events tab polls this, so let the CDN answer: one database read per 10 s instead of one per visitor.
  return Response.json({ live, events }, { headers: { "cache-control": "s-maxage=10, stale-while-revalidate=30" } });
}
