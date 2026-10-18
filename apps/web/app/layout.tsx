import type { Metadata, Viewport } from "next";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./site.css";
import "./pages.css";
import { Chrome, Footer } from "@/site/Chrome";
import { Experience } from "@/site/Experience";

export const metadata: Metadata = {
  title: { default: "Overwatch — Know who can move your money", template: "%s · Overwatch" },
  description:
    "Overwatch reads who can change the Solana protocols holding your deposits: upgrade keys, multisig thresholds, timelocks, signers and durable nonces. It alerts you after those controls weaken onchain.",
  openGraph: {
    title: "Overwatch — Know who can move your money",
    description: "Control grades, alerts and an onchain risk registry for Solana DeFi depositors.",
  },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-time="night" selects the red-and-black palette, which the site always uses.
    <html lang="en" data-time="night">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon-night.svg" />
      </head>
      <body className="is-loading">
        <Chrome />
        <main id="main">{children}</main>
        <Footer />
        <Experience />
      </body>
    </html>
  );
}
