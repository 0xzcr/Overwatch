import "server-only";
import { db, protocols, inArray, type subscriptions } from "@overwatch/db";
import { z } from "zod";

type Row = typeof subscriptions.$inferSelect;

export const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const severity = z.enum(SEVERITIES);
/** Protocol filter in requests: a list of slugs, or "all". */
export const protocolFilter = z.union([z.array(z.string()).max(50), z.literal("all")]);

/** The public shape of a subscription. The secret is never echoed back. */
export async function describe(s: Row) {
  const slugs = s.protocolIds?.length
    ? (await db().select({ slug: protocols.slug }).from(protocols).where(inArray(protocols.id, s.protocolIds))).map(
        (r) => r.slug,
      )
    : "all";
  return {
    id: s.id,
    channel: s.channel,
    target: s.target,
    min_severity: s.minSeverity,
    protocols: slugs,
    active: s.active,
    confirmed: s.confirmed,
    created_at: s.createdAt.toISOString(),
  };
}
