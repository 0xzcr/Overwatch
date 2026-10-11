import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import { Frame } from "@/components/chrome/Frame";
import { StatusLine } from "@/components/chrome/StatusLine";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif-i", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Overwatch", template: "%s · Overwatch" },
  description: "A smoke detector for Solana DeFi: who can move your money, and alerts the moment those controls get weaker.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { themeColor: "#050505", width: "device-width", initialScale: 1 };

const themeBoot = `try{var t=localStorage.getItem("ow-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${archivo.variable} ${serif.variable} ${plex.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 bg-accent text-black px-3 py-1">Skip to content</a>
        <Frame />
        <main id="main" className="pb-14">{children}</main>
        <StatusLine />
      </body>
    </html>
  );
}
