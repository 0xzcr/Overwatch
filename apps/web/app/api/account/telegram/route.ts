import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { db, telegramLinks } from "@overwatch/db";
import { ok, err } from "@/lib/api";
import { withAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

/**
 * A one-time link that connects a Telegram chat to this account: opening it sends /start link_<code> to the bot,
 * which turns the code into a Telegram channel on the account. The code lasts 30 minutes.
 */
export const POST = withAccount(async (_req: NextRequest, account) => {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return err(503, "the Telegram bot is not configured on this deployment");
  const code = randomBytes(12).toString("hex");
  await db()
    .insert(telegramLinks)
    .values({ code, accountId: account.id, expiresAt: new Date(Date.now() + 30 * 60_000) });
  return ok({ url: `https://t.me/${bot}?start=link_${code}`, expiresInMinutes: 30 });
});
