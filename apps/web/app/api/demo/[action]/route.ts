import type { NextRequest } from "next/server";
import { ACTIONS, hasState, type ActionName } from "@overwatch/demo";
import { db, demoActions } from "@overwatch/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

let busy = false;

/** Runs a real DEVNET action against the demo multisig/program. Enabled only when DEMO_MODE=true. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (process.env.DEMO_MODE !== "true") return Response.json({ error: "demo disabled (set DEMO_MODE=true)" }, { status: 403 });
  if (!hasState()) return Response.json({ error: "demo not set up: run `pnpm demo:setup`" }, { status: 409 });
  const { action } = await params;
  const fn = ACTIONS[action as ActionName];
  if (!fn) return Response.json({ error: `unknown action ${action}` }, { status: 404 });
  if (busy) return Response.json({ error: "another demo action is running" }, { status: 429 });
  busy = true;
  const log: { line: string; sig?: string; at: string }[] = [];
  const started = Date.now();
  try {
    await fn((line: string, sig?: string) => { log.push({ line, sig, at: new Date().toISOString() }); });
    await db().insert(demoActions).values({ action, status: "ok", txSignatures: log.filter((l) => l.sig).map((l) => l.sig), log: log.map((l) => l.line).join("\n") });
    return Response.json({ ok: true, action, ms: Date.now() - started, log });
  } catch (e) {
    const msg = (e as Error).message;
    log.push({ line: `✘ ${msg}`, at: new Date().toISOString() });
    await db().insert(demoActions).values({ action, status: "error", txSignatures: [], log: msg }).catch(() => {});
    return Response.json({ ok: false, action, error: msg, log }, { status: 500 });
  } finally {
    busy = false;
  }
}
