import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next"; // SEO component
import { GLOSSARY, SITE_URL, REPO_URL } from "./content"; // SEO component
import { explorer, GRADE_WORD } from "@/lib/format";

export const cssVars = (v: Record<string, string>) => v as CSSProperties;

export function Vis({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Technical term with a "What does this mean?" tooltip (hover or keyboard focus, no JS). */
export function Term({ t, children }: { t: string; children?: ReactNode }) {
  const text = GLOSSARY[t.toLowerCase()];
  if (!text) return <>{children ?? t}</>;
  return (
    <span className="term" tabIndex={0}>
      {children ?? t}
      <span className="term__tip" role="tooltip">
        <b className="mono">What does this mean?</b>
        {text}
      </span>
    </span>
  );
}

export function Grade({
  grade,
  score,
  size = "md",
}: {
  grade: string | null;
  score: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const g = grade ?? "?";
  return (
    <span className={`grade grade--${size} g-${g}`}>
      <b>{g}</b>
      <span className="mono">
        {score ?? "—"}
        {size !== "sm" && <> · {GRADE_WORD[g] ?? "Unscored"}</>}
      </span>
    </span>
  );
}

export function Badge({
  tone = "dim",
  children,
}: {
  tone?: "ok" | "warn" | "bad" | "dim" | "accent" | "violet";
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone} mono`}>{children}</span>;
}

export function Addr({
  v,
  network = "mainnet",
  kind = "address",
  full = false,
}: {
  v: string | null | undefined;
  network?: "mainnet" | "devnet";
  kind?: "address" | "tx";
  full?: boolean;
}) {
  if (!v) return <span className="mono addr addr--none">none</span>;
  const real = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(v);
  if (!real)
    return (
      <span className="mono addr" title="placeholder (reconstructed)">
        {v}
      </span>
    );
  return (
    <a href={explorer(kind, v, network)} target="_blank" rel="noreferrer" className="mono addr" title={v}>
      {full ? v : `${v.slice(0, 4)}…${v.slice(-4)}`}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

/** Page header in the same visual language as the landing hero. */
export function PageHero({
  eyebrow,
  lines,
  lede,
  aside,
  dock,
  compact = true,
}: {
  eyebrow?: ReactNode;
  lines: ReactNode[];
  lede?: ReactNode;
  aside?: ReactNode;
  dock: string;
  compact?: boolean;
}) {
  return (
    <section className={`hero${compact ? " hero--page" : ""}`} id="top" data-dock={dock}>
      <div className="hero__title-wrap">
        {eyebrow && <p className="hero__eyebrow mono">{eyebrow}</p>}
        <h1 className="hero__title hero__title--page">
          {lines.map((l, i) => (
            <span className="hero__line" key={i}>
              <span>{l}</span>
            </span>
          ))}
        </h1>
      </div>
      {(lede || aside) && (
        <div className="hero__aside">
          {lede && <p className="hero__lede">{lede}</p>}
          {aside}
        </div>
      )}
    </section>
  );
}

export function SectionHead({ title, lede, row = false }: { title: ReactNode; lede?: ReactNode; row?: boolean }) {
  return (
    <header className={`section-head${row ? " section-head--row" : ""}`}>
      <div>
        <h2 className="h2">{title}</h2>
      </div>
      {lede && <p className="section-head__lede">{lede}</p>}
    </header>
  );
}

// ------------------------------------------------------------ search and AI-assistant metadata

/** The id other JSON-LD nodes use to point at the publisher (defined once in the root layout). */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`; // SEO component

/**
 * Title, description, canonical URL and matching Open Graph / Twitter previews for one page.
 * Without this, every page would share the site-wide description and social card text.
 */
export function pageMetadata({
  // SEO component
  title, // SEO component
  description, // SEO component
  path, // SEO component
}: {
  // SEO component
  title: string; // SEO component
  description: string; // SEO component
  path: string; // SEO component
}): Metadata {
  // SEO component
  const fullTitle = `${title} · Overwatch`; // SEO component
  // A page that sets its own openGraph no longer inherits the root social card, so name it explicitly.
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: "Overwatch — Know who can move your money" }; // SEO component
  return {
    // SEO component
    title, // SEO component
    description, // SEO component
    alternates: { canonical: path }, // SEO component
    openGraph: { type: "website", siteName: "Overwatch", title: fullTitle, description, url: path, images: [image] }, // SEO component
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] }, // SEO component
  }; // SEO component
} // SEO component

/** A BreadcrumbList for a page below the home page, e.g. [["Control map", "/protocols"], ["Kamino Lend", "/protocols/kamino-lend"]]. */
export function breadcrumbs(trail: [name: string, path: string][]) {
  // SEO component
  const items = [["Overwatch", "/"] as [string, string], ...trail]; // SEO component
  return {
    // SEO component
    "@type": "BreadcrumbList", // SEO component
    itemListElement: items.map(([name, path], index) => ({
      // SEO component
      "@type": "ListItem", // SEO component
      position: index + 1, // SEO component
      name, // SEO component
      item: `${SITE_URL}${path}`, // SEO component
    })), // SEO component
  }; // SEO component
} // SEO component

/** Licence and publisher fields shared by the datasets Overwatch publishes. */
export const DATASET_COMMON = {
  // SEO component
  creator: { "@id": ORGANIZATION_ID }, // SEO component
  publisher: { "@id": ORGANIZATION_ID }, // SEO component
  license: "https://www.apache.org/licenses/LICENSE-2.0", // SEO component
  isAccessibleForFree: true, // SEO component
  sameAs: REPO_URL, // SEO component
}; // SEO component

/**
 * Renders schema.org JSON-LD. Pass one node or several; several are wrapped in an @graph.
 * `<` is escaped so text from the database can never close the script tag.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  // SEO component
  const body = Array.isArray(data) // SEO component
    ? { "@context": "https://schema.org", "@graph": data } // SEO component
    : { "@context": "https://schema.org", ...data }; // SEO component
  return (
    // SEO component
    <script // SEO component
      type="application/ld+json" // SEO component
      dangerouslySetInnerHTML={{ __html: JSON.stringify(body).replace(/</g, "\\u003c") }} // SEO component
    /> // SEO component
  ); // SEO component
} // SEO component
