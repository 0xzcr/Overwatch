import type { CSSProperties } from "react";

/**
 * Overwatch mark: the watchdog. A faceted doberman head (low-poly, lit from the top left) with glowing slit eyes.
 * Idle: the eyes breathe and blink, and a sheen crosses the facets. Hover: ears pin back, eyes flare white, a reticle
 * locks on. Boot screen: the facets assemble, the outline draws itself, then the eyes ignite. Styles: pages.css (.dog__*).
 */

type P = [number, number];
const V: Record<string, P> = {
  // doberman: tall cropped ears, a broad skull at the eyes, then a long tapering muzzle
  top: [24, 10.5],
  earIn: [28.6, 12.6],
  earTip: [35.2, 0.4],
  earOut: [37.8, 14.6],
  earBase: [32.4, 13.6],
  cheek: [37, 21.6],
  brow: [29.6, 19.8],
  bridge: [24, 20.4],
  jaw: [32, 30.5],
  under: [27.6, 27],
  muzzle: [28.2, 38.4],
  snout: [24, 31.6],
  noseTop: [24, 39.2],
  chinSide: [26, 44.4],
  chin: [24, 46.4],
};
/** Right-half facets as [a, b, c, shade], shade 1 brightest. The left half mirrors them one step brighter (lit from the left). */
const FACETS: [string, string, string, number][] = [
  ["top", "earIn", "brow", 2],
  ["top", "brow", "bridge", 3],
  ["earIn", "earBase", "brow", 3],
  ["earBase", "earOut", "cheek", 4],
  ["earBase", "cheek", "brow", 3],
  ["brow", "cheek", "under", 4],
  ["cheek", "jaw", "under", 5],
  ["bridge", "brow", "under", 3],
  ["bridge", "under", "snout", 4],
  ["under", "jaw", "muzzle", 5],
  ["snout", "under", "muzzle", 4],
  ["snout", "muzzle", "noseTop", 3],
  ["noseTop", "muzzle", "chinSide", 4],
  ["noseTop", "chinSide", "chin", 5],
];
const EAR_OUTER = ["earTip", "earOut", "earBase"];
const EAR_INNER = ["earTip", "earBase", "earIn"];

const mirror = ([x, y]: P): P => [48 - x, y];
const pts = (ps: P[]) => ps.map(([x, y]) => `${x},${y}`).join(" ");
const tri = (names: string[], left: boolean) => pts(names.map((n) => (left ? mirror(V[n]!) : V[n]!)));
const OUTLINE = (() => {
  const right = ["top", "earIn", "earTip", "earOut", "cheek", "jaw", "muzzle", "chinSide", "chin"].map((n) => V[n]!);
  return `M${pts([...right, ...right.slice(1, -1).map(mirror).reverse()])}Z`;
})();
// angled, slightly larger slits under a dark scowling brow ridge
const EYES = ["25.4,22.5 32.4,20.6 29.8,25", "22.6,22.5 15.6,20.6 18.2,25"];
const BROWS = ["24.6,21.2 33.2,18.6 32.8,20 25.2,22.4", "23.4,21.2 14.8,18.6 15.2,20 22.8,22.4"];
const NOSE = "21.6,38.4 26.4,38.4 24,41.4";
const MOUTH = "21.6,42.6 24,43.7 26.4,42.6";

/** Every facet once, ears first (they move as groups on hover). shade 0 = the inside of an ear. */
function facets() {
  const ear = (left: boolean) => [
    { pts: tri(EAR_OUTER, left), shade: left ? 2 : 3 },
    { pts: tri(EAR_INNER, left), shade: 0 },
  ];
  const face = FACETS.flatMap(([a, b, c, s]) => [
    { pts: tri([a, b, c], false), shade: s },
    { pts: tri([a, b, c], true), shade: Math.max(1, s - 1) },
  ]);
  return { earR: ear(false), earL: ear(true), face };
}
// Each facet flies in from its own direction on the boot screen (deterministic, so server and client agree).
const scatter = (i: number) =>
  ({
    "--i": i,
    "--dx": `${((i * 37) % 23) - 11}px`,
    "--dy": `${((i * 53) % 19) - 12}px`,
    "--r": `${((i * 71) % 90) - 45}deg`,
  }) as CSSProperties;

/** `id` keeps each instance's clip path and gradient unique, because several logos share one page. */
export function Logo({ className = "logo", title, id = "logo" }: { className?: string; title?: string; id?: string }) {
  const { earR, earL, face } = facets();
  let i = 0;
  const poly = (f: { pts: string; shade: number }) => (
    <polygon
      key={i}
      className={`dog__facet ${f.shade ? `f${f.shade}` : "dog__inner"}`}
      style={scatter(i++)}
      points={f.pts}
    />
  );
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={OUTLINE} />
        </clipPath>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* targeting reticle: locks on when hovered and on the boot screen */}
      <g className="dog__reticle">
        <circle cx="24" cy="24" r="22.5" />
        <path d="M24 0.5v3.4M24 44.1v3.4M0.5 24h3.4M44.1 24h3.4" />
      </g>

      <g className="dog__head">
        <g className="dog__ear dog__ear--r">{earR.map(poly)}</g>
        <g className="dog__ear dog__ear--l">{earL.map(poly)}</g>
        {face.map(poly)}
        <g clipPath={`url(#${id}-clip)`}>
          <rect className="dog__sheen" x="-14" y="-6" width="10" height="60" fill={`url(#${id}-sheen)`} />
        </g>
        <path className="dog__outline" d={OUTLINE} pathLength={1} />
        <polygon className="dog__nose" points={NOSE} />
        <polyline className="dog__mouth" points={MOUTH} />
        {BROWS.map((p) => (
          <polygon key={p} className="dog__brow" points={p} />
        ))}
        <g className="dog__eyes">
          {EYES.map((p) => (
            <polygon key={p} className="dog__eye" points={p} />
          ))}
          <circle className="dog__core" cx="29.2" cy="22.6" r="0.6" />
          <circle className="dog__core" cx="18.8" cy="22.6" r="0.6" />
        </g>
      </g>
    </svg>
  );
}

const STATIC_FILL = ["#4a0710", "#6b0d1a", "#560a15", "#430811", "#33060d", "#25040a"];

/** The mark with fixed colours and no animation, for `<symbol>`/`<use>` copies and the favicon. Render inside a 48×48 viewBox. */
export function LogoMark() {
  const { earR, earL, face } = facets();
  return (
    <>
      {[...earR, ...earL, ...face].map((f, i) => (
        <polygon
          key={i}
          points={f.pts}
          fill={STATIC_FILL[f.shade]}
          stroke="#ff4d5e"
          strokeOpacity="0.28"
          strokeWidth="0.3"
        />
      ))}
      <path d={OUTLINE} fill="none" stroke="#ff1f3d" strokeWidth="1.3" strokeLinejoin="round" />
      <polygon points={NOSE} fill="#050102" />
      <polyline
        points={MOUTH}
        fill="none"
        stroke="#ff1f3d"
        strokeOpacity="0.7"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      {BROWS.map((p) => (
        <polygon key={p} points={p} fill="#050102" />
      ))}
      {EYES.map((p) => (
        <polygon key={p} points={p} fill="#ff1f3d" />
      ))}
      <circle cx="29.2" cy="22.6" r="0.6" fill="#fff" />
      <circle cx="18.8" cy="22.6" r="0.6" fill="#fff" />
    </>
  );
}
