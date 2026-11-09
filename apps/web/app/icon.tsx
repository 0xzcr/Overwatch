import { ImageResponse } from "next/og"; // SEO component
import { readFile } from "node:fs/promises"; // SEO component
import { join } from "node:path"; // SEO component

// A PNG of the SVG favicon, for browsers, search results and app installs that do not take SVG icons.
export const size = { width: 512, height: 512 }; // SEO component
export const contentType = "image/png"; // SEO component

export default async function Icon() {
  // SEO component
  const svg = await readFile(join(process.cwd(), "public/favicon-night.svg")); // SEO component
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`; // SEO component
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, size); // SEO component
} // SEO component
