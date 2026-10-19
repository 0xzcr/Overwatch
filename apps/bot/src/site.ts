/** Public site for links in alerts. A localhost value (the local .env) is unreachable from Telegram, so it falls back to production. */
const PROD = "https://overwatch-chi.vercel.app";
const env = (process.env.BOT_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
export const SITE = env && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(env) ? env : PROD;
