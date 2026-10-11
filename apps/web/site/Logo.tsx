/**
 * Overwatch mark: a shield with a radar inside. On hover the outline redraws,
 * the sweep turns and a contact pings, like a watch post picking something up.
 */
export function Logo({ className = "logo", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id="owLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2BFFB0" />
          <stop offset="1" stopColor="#7CF3FF" />
        </linearGradient>
        <radialGradient id="owLogoSweep" cx="0" cy="1" r="1">
          <stop offset="0" stopColor="#2BFFB0" stopOpacity=".55" />
          <stop offset="1" stopColor="#2BFFB0" stopOpacity="0" />
        </radialGradient>
        <clipPath id="owLogoClip">
          <path d="M24 4.5 L40 10.5 V23 C40 33 33 40.5 24 43.5 C15 40.5 8 33 8 23 V10.5 Z" />
        </clipPath>
      </defs>
      <path className="logo__shield" d="M24 4.5 L40 10.5 V23 C40 33 33 40.5 24 43.5 C15 40.5 8 33 8 23 V10.5 Z" pathLength="100" />
      <g clipPath="url(#owLogoClip)">
        <circle className="logo__ring" cx="24" cy="24.5" r="9" />
        <circle className="logo__ring logo__ring--outer" cx="24" cy="24.5" r="15" />
        <g className="logo__sweep">
          <path d="M24 24.5 L24 6 A18.5 18.5 0 0 1 37.1 11.4 Z" fill="url(#owLogoSweep)" />
          <path d="M24 24.5 L24 6" className="logo__beam" />
        </g>
      </g>
      <circle className="logo__ping" cx="30.5" cy="17.5" r="1.8" />
      <circle className="logo__core" cx="24" cy="24.5" r="2.4" />
    </svg>
  );
}
