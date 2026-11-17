import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource-variable/archivo/wdth.css";
import "./site.css";
import "./pages.css";
import { Chrome, Footer } from "@/site/Chrome";
import { Experience } from "@/site/Experience";
import { SITE_URL, REPO_URL } from "@/site/content";

const TITLE = "Overwatch — Know how easily your deposits could be taken";
const DESCRIPTION =
  "Overwatch grades every Solana DeFi protocol by how many keys an attacker must steal to drain it and how long depositors would have to withdraw, and alerts you the moment that gets worse.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Overwatch" },
  description: DESCRIPTION,
  applicationName: "Overwatch",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Overwatch",
    title: TITLE,
    description: "Control grades, alerts and an onchain risk registry for Solana DeFi depositors.",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Control grades, alerts and an onchain risk registry for Solana DeFi depositors.",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Who runs the site and how to reach them, for search engines and AI assistants (schema.org JSON-LD). */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Overwatch",
      url: SITE_URL,
      logo: `${SITE_URL}/opengraph-image`,
      description: DESCRIPTION,
      sameAs: [REPO_URL],
      contactPoint: [
        { "@type": "ContactPoint", contactType: "customer support", url: `${REPO_URL}/issues` },
        { "@type": "ContactPoint", contactType: "security", url: `${REPO_URL}/security` },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Overwatch",
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-time="night" selects the red-and-black palette, which the site always uses.
    <html lang="en" data-time="night">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon-night.svg" />
        <script
          type="application/ld+json"
          // static, server-built JSON: no user input reaches it
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="is-loading">
        <Chrome />
        <main id="main">{children}</main>
        <Footer />
        <Experience />
        <Analytics />
      </body>
    </html>
  );
}
