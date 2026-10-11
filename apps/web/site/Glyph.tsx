/** Line-art chapter glyphs for the tiles: a 2D echo of each chapter's particle shape. */
export function Glyph({ shape }: { shape: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" as const };
  let body: React.ReactNode = null;
  if (shape === "graph")
    body = (
      <>
        <circle cx="10" cy="32" r="4" fill="currentColor" />
        {[18, 32, 46].map((y) => (
          <path key={`a${y}`} {...common} d={`M14 32 C 22 32, 22 ${y}, 30 ${y}`} />
        ))}
        {[18, 32, 46].map((y) => (
          <circle key={`b${y}`} {...common} cx="33" cy={y} r="3" />
        ))}
        {[10, 22, 34, 46, 56].map((y, i) => (
          <path key={`c${y}`} {...common} className={i < 2 ? "g-hot" : ""} d={`M36 ${[18, 18, 32, 46, 46][i]} C 44 ${[18, 18, 32, 46, 46][i]}, 44 ${y}, 52 ${y}`} />
        ))}
        {[10, 22, 34, 46, 56].map((y, i) => (
          <circle key={`d${y}`} {...common} className={i < 2 ? "g-hot" : ""} cx="55" cy={y} r="2.5" />
        ))}
      </>
    );
  if (shape === "radar")
    body = (
      <>
        {[8, 16, 24].map((r) => (
          <circle key={r} {...common} cx="32" cy="32" r={r} opacity={0.5 + r / 60} />
        ))}
        <path {...common} d="M32 6 V58 M6 32 H58" opacity=".4" />
        <g className="g-spin">
          <path d="M32 32 L32 8 A24 24 0 0 1 49 15 Z" fill="currentColor" opacity=".25" />
          <path {...common} d="M32 32 L32 8" />
        </g>
        <circle cx="44" cy="22" r="2" className="g-hot g-blink" fill="currentColor" />
        <circle cx="22" cy="40" r="1.6" fill="currentColor" className="g-blink" />
      </>
    );
  if (shape === "shield")
    body = (
      <>
        <path {...common} d="M32 6 L54 13 V30 C54 44 44 53 32 58 C20 53 10 44 10 30 V13 Z" />
        <path {...common} d="M32 12 L48 17 V30 C48 41 41 48 32 52 C23 48 16 41 16 30 V17 Z" opacity=".45" />
        <path {...common} className="g-draw" d="M22 31 L29 38 L43 24" strokeWidth={2} />
      </>
    );
  if (shape === "burst")
    body = (
      <>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const r1 = 9, r2 = i % 2 ? 20 : 27;
          return <path key={i} {...common} className="g-pulse" style={{ animationDelay: `${i * 0.05}s` }} d={`M${32 + Math.cos(a) * r1} ${32 + Math.sin(a) * r1} L${32 + Math.cos(a) * r2} ${32 + Math.sin(a) * r2}`} />;
        })}
        <circle cx="32" cy="32" r="5" fill="currentColor" />
      </>
    );
  if (shape === "lock")
    body = (
      <>
        <path {...common} d="M21 28 V20 C21 13 26 9 32 9 C38 9 43 13 43 20 V28" className="g-shackle" />
        <rect {...common} x="14" y="28" width="36" height="27" rx="4" />
        <circle cx="32" cy="39" r="3.2" fill="currentColor" />
        <path {...common} d="M32 41 V47" strokeWidth={2} />
      </>
    );
  if (shape === "terrain")
    body = (
      <>
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} {...common} opacity={0.35 + i * 0.1} d={`M4 ${18 + i * 6} Q 18 ${10 + i * 6 + (i % 2) * 6}, 32 ${16 + i * 6} T 60 ${14 + i * 6}`} />
        ))}
        <path {...common} d="M20 46 L26 40 L20 34 M30 46 H40" strokeWidth={2} className="g-blink" />
      </>
    );
  return (
    <svg className={`glyph glyph--${shape}`} viewBox="0 0 64 64" aria-hidden="true">
      {body}
    </svg>
  );
}
