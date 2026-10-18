/**
 * The site always wears the red-and-black palette. CSS keys off `html[data-time="night"]` (set statically in the
 * root layout); WebGL colours go through `tone()`, which maps the original palette hexes to their red versions.
 */

/** Original colour → red palette colour. Status colours that carry meaning (amber warn, red-orange bad) stay as they are. */
const NIGHT_TONES: Record<string, string> = {
  "#2bffb0": "#ff1f3d", // mint accent → blood red
  "#7cf3ff": "#ff7a45", // cyan → ember
  "#5aa8ff": "#c2183a", // blue → crimson
  "#8b7cff": "#ff4d6d", // violet → rose
  "#d27dff": "#e0245e", // purple → raspberry
  "#b6ff3b": "#ff9a3d", // lime → orange
  "#3a5cff": "#7a0c1c", // deep blues → wine
  "#1d6bff": "#8f0f22",
  "#3b4dff": "#7a0c1c",
  "#1b2340": "#2a080c", // navy → near-black red
  "#2a2f5a": "#3a0c12",
};

/** The red-palette colour for an original-palette hex. */
export const tone = (hex: string) => NIGHT_TONES[hex.toLowerCase()] ?? hex;
