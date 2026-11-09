/**
 * Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others) that every page in the sitemap is new or
 * changed, so they recrawl now instead of on their own schedule. Run after a deploy that changes content:
 *   pnpm tsx scripts/indexnow.ts [site URL, default https://overwatch-chi.vercel.app]
 * The key is public by design: search engines confirm ownership by fetching it from the site.
 */
const KEY = "a72be525d730ab243b7d7450f1fb5602"; // served from apps/web/public/<KEY>.txt
const site = (process.argv[2] ?? "https://overwatch-chi.vercel.app").replace(/\/$/, "");

const sitemap = await (await fetch(`${site}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
if (!urls.length) throw new Error(`no URLs found in ${site}/sitemap.xml`);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(site).host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList: urls }),
});
// 200 = accepted, 202 = accepted while the key is being verified; anything else is an error.
console.log(`IndexNow: submitted ${urls.length} URLs, HTTP ${res.status}`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
