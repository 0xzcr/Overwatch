// Search and AI-assistant metadata shared by every page: titles, descriptions, social previews and schema.org JSON-LD.
import type { Metadata } from "next";
import { SITE_URL, REPO_URL } from "./content";

/** The id other JSON-LD nodes use to point at the publisher (defined once in the root layout). */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * Title, description, canonical URL and matching Open Graph / Twitter previews for one page.
 * Without this, every page would share the site-wide description and social card text.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const fullTitle = `${title} · Overwatch`;
  // A page that sets its own openGraph no longer inherits the root social card, so name it explicitly.
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: "Overwatch — Know who can move your money" };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Overwatch", title: fullTitle, description, url: path, images: [image] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] },
  };
}

/** A BreadcrumbList for a page below the home page, e.g. [["Control map", "/protocols"], ["Drift", "/protocols/drift"]]. */
export function breadcrumbs(trail: [name: string, path: string][]) {
  const items = [["Overwatch", "/"] as [string, string], ...trail];
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: `${SITE_URL}${path}`,
    })),
  };
}

/** Licence and publisher fields shared by the datasets Overwatch publishes. */
export const DATASET_COMMON = {
  creator: { "@id": ORGANIZATION_ID },
  publisher: { "@id": ORGANIZATION_ID },
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  isAccessibleForFree: true,
  sameAs: REPO_URL,
};

/**
 * Renders schema.org JSON-LD. Pass one node or several; several are wrapped in an @graph.
 * `<` is escaped so text from the database can never close the script tag.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const body = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(body).replace(/</g, "\\u003c") }}
    />
  );
}
