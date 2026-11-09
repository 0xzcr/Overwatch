import type { MetadataRoute } from "next";
import { SITE_URL } from "@/site/content";

// AI assistants' crawlers, named explicitly so a future rule for "*" can never shut them out by accident.
// Each company runs separate agents for search answers, on-demand fetches and model training; all are welcome,
// because Overwatch's grades only help depositors if assistants can cite them.
const AI_AGENTS = [
  // SEO component
  "OAI-SearchBot", // SEO component
  "ChatGPT-User", // SEO component
  "GPTBot", // SEO component
  "Claude-SearchBot", // SEO component
  "Claude-User", // SEO component
  "ClaudeBot", // SEO component
  "PerplexityBot", // SEO component
  "Perplexity-User", // SEO component
  "Google-Extended", // SEO component
  "Applebot-Extended", // SEO component
  "Bingbot", // SEO component
]; // SEO component

// The JSON API is for programs, not crawlers, except the two read-only datasets the structured data points to.
const RULES = { allow: ["/", "/api/v1/protocols", "/api/v1/events"], disallow: "/api/" }; // SEO component

export default function robots(): MetadataRoute.Robots {
  return {
    // SEO component
    rules: [
      // SEO component
      { userAgent: "*", ...RULES }, // SEO component
      { userAgent: AI_AGENTS, ...RULES }, // SEO component
    ], // SEO component
    sitemap: `${SITE_URL}/sitemap.xml`, // SEO component
  }; // SEO component
}
