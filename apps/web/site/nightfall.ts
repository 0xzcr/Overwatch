/**
 * Nightfall: from 18:00 to 06:00 in the visitor's local time the site's accent turns red and black.
 * CSS keys off `html[data-time="night"]`; WebGL colours go through `tone()`.
 * `?time=night` or `?time=day` forces either palette for the tab (handy for demos and screenshots); `?time=auto` goes back to the clock.
 */

export const NIGHT_START = 18;
export const NIGHT_END = 6;

export const nightAt = (d: Date) => d.getHours() >= NIGHT_START || d.getHours() < NIGHT_END;

/** Day colour → night colour. Status colours that carry meaning (amber warn, red-orange bad) stay as they are. */
export const NIGHT_TONES: Record<string, string> = {
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

/** A `?time=` override, remembered for the tab so it survives navigation. `?time=auto` clears it. */
const forced = () => {
  try {
    const q = new URLSearchParams(location.search).get("time");
    if (q === "auto") sessionStorage.removeItem("ow-time");
    else if (q === "night" || q === "day") sessionStorage.setItem("ow-time", q);
    const v = sessionStorage.getItem("ow-time");
    return v === "night" || v === "day" ? v : null;
  } catch {
    return null;
  }
};

export const isNight = () => typeof document !== "undefined" && document.documentElement.dataset.time === "night";

/** The colour to use right now for a day-palette hex. */
export const tone = (hex: string) => (isNight() ? (NIGHT_TONES[hex.toLowerCase()] ?? hex) : hex);

/** Runs in <head> before first paint so night visitors never see a flash of the day palette. Keep in sync with nightAt(). */
export const NIGHTFALL_SCRIPT = `(function(){var d=document.documentElement,h=new Date().getHours(),q=null;d.dataset.time=h>=${NIGHT_START}||h<${NIGHT_END}?"night":"day";try{q=new URLSearchParams(location.search).get("time");if(q==="auto")sessionStorage.removeItem("ow-time");else if(q==="night"||q==="day")sessionStorage.setItem("ow-time",q);q=sessionStorage.getItem("ow-time");}catch(e){}if(q==="night"||q==="day")d.dataset.time=q;if(d.dataset.time==="night"){var i=document.createElement("link");i.id="ow-icon-night";i.rel="icon";i.type="image/svg+xml";i.href="/favicon-night.svg";document.head.appendChild(i);}})();`;

/**
 * The night icon is an extra <link> after React's day icon (the later one wins). React 19 tracks icon links by href,
 * so changing the day link's href would make it insert a second one.
 */
const favicon = () => {
  const night = document.getElementById("ow-icon-night");
  if (!isNight()) return night?.remove();
  if (night) return;
  const link = Object.assign(document.createElement("link"), { id: "ow-icon-night", rel: "icon", type: "image/svg+xml", href: "/favicon-night.svg" });
  document.head.appendChild(link);
};

/** Re-checks the clock every minute and calls `onChange` when the palette flips (e.g. at 18:00 with the page open). */
export function watchNightfall(onChange: () => void): () => void {
  favicon();
  const check = () => {
    const f = forced();
    const want = f ? f === "night" : nightAt(new Date());
    if (want === isNight()) return;
    document.documentElement.dataset.time = want ? "night" : "day";
    favicon();
    onChange();
  };
  const id = window.setInterval(check, 60_000);
  return () => window.clearInterval(id);
}
