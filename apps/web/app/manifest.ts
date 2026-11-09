import type { MetadataRoute } from "next";

/** Name, colours and icons for "add to home screen" and for search engines that show app details. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Overwatch",
    short_name: "Overwatch",
    description: "Know who can move your money: control grades and alerts for Solana DeFi protocols.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/favicon-night.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon", type: "image/png", sizes: "512x512" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}
