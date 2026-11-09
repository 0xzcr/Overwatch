import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// A PNG of the SVG favicon, for browsers, search results and app installs that do not take SVG icons.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const svg = await readFile(join(process.cwd(), "public/favicon-night.svg"));
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, size);
}
