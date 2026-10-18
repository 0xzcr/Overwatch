import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEvents } from "@/lib/data";
import { guard, ok, err, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
const q = z.object({
  severity: z
    .enum(["info", "low", "medium", "high", "critical", "INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

async function handleGET(req: NextRequest) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!p.success) return err(400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return ok(
    await getEvents({
      minSeverity: p.data.severity?.toUpperCase(),
      since: p.data.since ? new Date(p.data.since) : undefined,
      limit: p.data.limit,
    }),
  );
}

export const GET = withDb(handleGET);
