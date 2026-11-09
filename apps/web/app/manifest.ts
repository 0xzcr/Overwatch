import type { MetadataRoute } from "next"; // SEO component

/** Name, colours and icons for "add to home screen" and for search engines that show app details. */
export default function manifest(): MetadataRoute.Manifest {
  // SEO component
  return {
    // SEO component
    name: "Overwatch", // SEO component
    short_name: "Overwatch", // SEO component
    description: "Know who can move your money: control grades and alerts for Solana DeFi protocols.", // SEO component
    start_url: "/", // SEO component
    display: "standalone", // SEO component
    background_color: "#000000", // SEO component
    theme_color: "#000000", // SEO component
    icons: [
      // SEO component
      { src: "/favicon-night.svg", type: "image/svg+xml", sizes: "any" }, // SEO component
      { src: "/icon", type: "image/png", sizes: "512x512" }, // SEO component
      { src: "/apple-icon", type: "image/png", sizes: "180x180" }, // SEO component
    ], // SEO component
  }; // SEO component
} // SEO component
