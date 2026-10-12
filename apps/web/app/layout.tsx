import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./site.css";
import "./pages.css";
import { Chrome, Footer } from "@/site/Chrome";
import { Experience } from "@/site/Experience";

export const metadata: Metadata = {
  title: { default: "Overwatch — Know who can move your money", template: "%s · Overwatch" },
  description:
    "A smoke detector for Solana DeFi. Overwatch maps who can change the protocols holding your deposits, watches every key and signer, and warns you the moment those controls get weaker.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Overwatch — Know who can move your money",
    description: "Control grades, real-time alerts and an onchain risk registry for Solana DeFi depositors.",
  },
};

export const viewport: Viewport = { themeColor: "#030407", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="is-loading">
        <Chrome />
        <main id="main">{children}</main>
        <Footer />
        <Experience />
      </body>
    </html>
  );
}
