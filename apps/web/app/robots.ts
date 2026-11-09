import type { MetadataRoute } from "next";
import { SITE_URL } from "@/site/content";

// AI assistants' crawlers, named explicitly so a future rule for "*" can never shut them out by accident.
// Each company runs separate agents for search answers, on-demand fetches and model training; all are welcome,
// because Overwatch's grades only help depositors if assistants can cite them.
const AI_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
];

// The JSON API is for programs, not crawlers, except the two read-only datasets the structured data points to.
const RULES = { allow: ["/", "/api/v1/protocols", "/api/v1/events"], disallow: "/api/" };

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", ...RULES },
      { userAgent: AI_AGENTS, ...RULES },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
