import type { NextRequest } from "next/server";
import { isRehearsalAction, rehearsalBaseline, rehearse } from "@overwatch/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starting state of the rehearsal. */
export function GET() {
  return Response.json({ state: rehearsalBaseline() });
}

/**
 * Runs one demo action through the rules engine and scoring without sending a transaction.
 * Body: { done: string[], action: string }. `done` is the actions already taken, so the route stays stateless.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { done?: unknown; action?: unknown } | null;
  const done = Array.isArray(body?.done) ? body.done : [];
  const action = typeof body?.action === "string" ? body.action : "";
  if (!isRehearsalAction(action)) return Response.json({ error: `unknown action ${action}` }, { status: 404 });
  if (done.length > 50 || !done.every((a): a is string => typeof a === "string" && isRehearsalAction(a))) return Response.json({ error: "invalid history" }, { status: 400 });
  return Response.json(rehearse(done.filter(isRehearsalAction), action));
}
