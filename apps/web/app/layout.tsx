import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./site.css";

export const metadata: Metadata = {
  title: "Overwatch Editions — The Vigil Edition",
  description:
    "A smoke detector for Solana DeFi. Overwatch maps who can change the protocols holding your deposits, watches every key and signer, and warns you the moment those controls get weaker.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Overwatch Editions — The Vigil Edition",
    description: "Know who can move your money. Live control grades, real-time alerts and an onchain risk registry for Solana DeFi.",
  },
};

export const viewport: Viewport = { themeColor: "#030407", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="is-loading">{children}</body>
    </html>
  );
}
