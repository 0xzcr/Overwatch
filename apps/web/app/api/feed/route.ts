import { loadEvents } from "@/site/data";

export const dynamic = "force-dynamic";

/** Polling fallback for the live events page: the same list the page renders, for when the stream is reconnecting. */
export async function GET() {
  const { live, events } = await loadEvents(200);
  return Response.json({ live, events }, { headers: { "cache-control": "no-store" } });
}
