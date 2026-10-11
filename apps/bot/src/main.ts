/** Telegram bot (grammY) + alert delivery worker. Delivery runs even without a bot token (webhooks/email). */
import "@overwatch/db/env";
import { Bot } from "grammy";
import { z } from "zod";
import { db, protocols, subscriptions, eq, and, listEvents, getProtocol } from "@overwatch/db";
import { fmtDuration, type ControlSnapshot, type ProtocolConfig } from "@overwatch/core";
import { mainnetRpc } from "@overwatch/solana";
import { deliverPending } from "./deliver";

const log = (m: string) => console.log(`${new Date().toISOString()} [bot] ${m}`);
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new Bot(token) : null;
const SEVS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

async function subFor(chatId: string) {
  const [s] = await db().select().from(subscriptions).where(and(eq(subscriptions.channel, "telegram"), eq(subscriptions.target, chatId)));
  if (s) return s;
  const [n] = await db().insert(subscriptions).values({ channel: "telegram", target: chatId, protocolIds: [], minSeverity: "HIGH" }).returning();
  return n!;
}
async function bySlug(slug: string) {
  const [p] = await db().select().from(protocols).where(eq(protocols.slug, slug.toLowerCase()));
  return p ?? null;
}

if (bot) {
  bot.command("start", async (ctx) => {
    const s = await subFor(String(ctx.chat.id));
    const payload = ctx.match?.trim();
    let extra = "";
    if (payload?.startsWith("watch_")) {
      const p = await bySlug(payload.slice(6));
      if (p) { await db().update(subscriptions).set({ protocolIds: [...new Set([...(s.protocolIds ?? []), p.id])], active: true }).where(eq(subscriptions.id, s.id)); extra = `\n\nYou're now watching <b>${p.name}</b>.`; }
    }
    await ctx.reply(`👁 <b>Overwatch</b>: a smoke detector for Solana DeFi.\nI alert you when someone weakens the controls over a protocol you use.\n\n/watch &lt;slug&gt; · /unwatch &lt;slug&gt; · /list\n/severity low|medium|high|critical\n/status &lt;slug&gt;\n/wallet &lt;address&gt;${extra}`, { parse_mode: "HTML" });
  });
  bot.command("watch", async (ctx) => {
    const p = await bySlug(ctx.match.trim());
    if (!p) return ctx.reply(`Unknown protocol. See ${SITE}/protocols for slugs.`);
    const s = await subFor(String(ctx.chat.id));
    await db().update(subscriptions).set({ protocolIds: [...new Set([...(s.protocolIds ?? []), p.id])], active: true }).where(eq(subscriptions.id, s.id));
    await ctx.reply(`Watching ${p.name}. Alerts at ${s.minSeverity} and above.`);
  });
  bot.command("unwatch", async (ctx) => {
    const p = await bySlug(ctx.match.trim());
    const s = await subFor(String(ctx.chat.id));
    if (!p) return ctx.reply("Unknown protocol.");
    await db().update(subscriptions).set({ protocolIds: (s.protocolIds ?? []).filter((x) => x !== p.id) }).where(eq(subscriptions.id, s.id));
    await ctx.reply(`Stopped watching ${p.name}.`);
  });
  bot.command("list", async (ctx) => {
    const s = await subFor(String(ctx.chat.id));
    const all = await db().select().from(protocols);
    const mine = all.filter((p) => (s.protocolIds ?? []).includes(p.id));
    await ctx.reply(mine.length ? `Watching (≥ ${s.minSeverity}):\n${mine.map((p) => `• ${p.name} (${p.slug})`).join("\n")}` : `You're not watching anything yet. Try /watch drift\n\nAvailable: ${all.map((p) => p.slug).join(", ")}`);
  });
  bot.command("severity", async (ctx) => {
    const v = ctx.match.trim().toUpperCase();
    if (!SEVS.includes(v)) return ctx.reply("Usage: /severity low|medium|high|critical");
    const s = await subFor(String(ctx.chat.id));
    await db().update(subscriptions).set({ minSeverity: v }).where(eq(subscriptions.id, s.id));
    await ctx.reply(`You'll get ${v} alerts and above.`);
  });
  bot.command("status", async (ctx) => {
    const row = await getProtocol(ctx.match.trim().toLowerCase());
    if (!row) return ctx.reply("Unknown protocol.");
    const snap = row.snapshot as ControlSnapshot | null;
    const ms = snap?.multisigs[0];
    const evs = await listEvents({ protocolId: row.id, limit: 3 });
    const lines = [
      `<b>${row.name}</b>: grade <b>${row.score?.grade ?? "?"}</b> (${row.score?.score ?? "?"}/100)`,
      ...(snap?.programs.map((p) => `Upgrade authority: ${p.authorityKind.replaceAll("_", " ").toLowerCase()}`) ?? []),
      ms ? `Multisig: ${ms.threshold}-of-${ms.members.length}, timelock ${fmtDuration(ms.timeLockSec)}${ms.configAuthority ? ", controlled by one key" : ""}` : "",
      snap?.nonces.length ? `⚠ ${snap.nonces.length} signer durable nonce account(s)` : "",
      evs.length ? `\nLast changes:\n${evs.map(({ e }) => `• ${e.severity}: ${e.title}`).join("\n")}` : "\nNo recorded changes yet.",
      `\n${SITE}/protocols/${row.slug}`,
    ].filter(Boolean);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  });
  bot.command("wallet", async (ctx) => {
    const addr = ctx.match.trim();
    if (!z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).safeParse(addr).success) return ctx.reply("Usage: /wallet <solana address>");
    // Feasible today: token balances in watched protocols' receipt/collateral mints (e.g. JitoSOL, mSOL).
    const rpc = mainnetRpc();
    const res = await rpc.call<{ value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number } } } } } }[] }>("getTokenAccountsByOwner", [addr, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]).catch(() => null);
    const held = new Set((res?.value ?? []).filter((t) => t.account.data.parsed.info.tokenAmount.uiAmount > 0).map((t) => t.account.data.parsed.info.mint));
    const all = await db().select().from(protocols);
    const lst = all.filter((p) => p.category === "lst" && (p.config as ProtocolConfig).collateral_mints.some((m) => held.has(m)));
    if (lst.length) {
      const s = await subFor(String(ctx.chat.id));
      await db().update(subscriptions).set({ protocolIds: [...new Set([...(s.protocolIds ?? []), ...lst.map((p) => p.id)])] }).where(eq(subscriptions.id, s.id));
    }
    await ctx.reply(`${lst.length ? `Found positions in: ${lst.map((p) => p.name).join(", ")}. Subscribed ✅` : "No positions detected in watched liquid-staking tokens."}\n\nLimitation: lending and perps positions live in protocol-specific accounts. Detecting those needs per-protocol adapters, which are coming soon. Use /watch for now.`);
  });
  bot.catch((e) => log(`bot error: ${e.message}`));
  void bot.start({ onStart: (me) => log(`telegram bot @${me.username} running`) });
} else {
  log("TELEGRAM_BOT_TOKEN not set: bot disabled; delivery worker still sends webhooks/email");
}

setInterval(() => void deliverPending(bot, log).catch((e) => log(`worker: ${(e as Error).message}`)), 2000);
log("delivery worker started");
