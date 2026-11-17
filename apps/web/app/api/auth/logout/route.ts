import type { NextRequest } from "next/server";
import { endSession, sameOrigin } from "@/lib/session";
import { ok, err } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return err(403, "cross-site request refused");
  await endSession();
  return ok({ signedOut: true });
}
