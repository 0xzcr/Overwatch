/**
 * Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others) that every page in the sitemap is new or
 * changed, so they recrawl now instead of on their own schedule. Run after a deploy that changes content:
 *   pnpm tsx scripts/indexnow.ts [site URL, default https://overwatch1.xyz]
 * The key is public by design: search engines confirm ownership by fetching it from the site.
 */
const KEY = "a72be525d730ab243b7d7450f1fb5602"; // served from apps/web/public/<KEY>.txt // SEO component
const site = (process.argv[2] ?? "https://overwatch1.xyz").replace(/\/$/, ""); // SEO component

const sitemap = await (await fetch(`${site}/sitemap.xml`)).text(); // SEO component
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!); // SEO component
if (!urls.length) throw new Error(`no URLs found in ${site}/sitemap.xml`); // SEO component

const res = await fetch("https://api.indexnow.org/indexnow", {
  // SEO component
  method: "POST", // SEO component
  headers: { "content-type": "application/json; charset=utf-8" }, // SEO component
  body: JSON.stringify({ host: new URL(site).host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList: urls }), // SEO component
}); // SEO component
// 200 = accepted, 202 = accepted while the key is being verified; anything else is an error.
console.log(`IndexNow: submitted ${urls.length} URLs, HTTP ${res.status}`); // SEO component
if (res.status !== 200 && res.status !== 202) {
  // SEO component
  console.error(await res.text()); // SEO component
  process.exit(1); // SEO component
} // SEO component
