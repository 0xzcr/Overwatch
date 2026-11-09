import { ImageResponse } from "next/og"; // SEO component
import { readFile } from "node:fs/promises"; // SEO component
import { join } from "node:path"; // SEO component

// The home-screen icon iOS uses; it needs a PNG at 180x180.
export const size = { width: 180, height: 180 }; // SEO component
export const contentType = "image/png"; // SEO component

export default async function AppleIcon() {
  // SEO component
  const svg = await readFile(join(process.cwd(), "public/favicon-night.svg")); // SEO component
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`; // SEO component
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, size); // SEO component
} // SEO component
