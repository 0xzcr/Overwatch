/**
 * Overwatch mark: the watchdog. An angular doberman head with a scar over one eye
 * and a spiked collar.
 * On hover it growls: ears pin back, brows drop, the jaw opens to bare the fangs,
 * and the eyes go red and fire laser beams.
 */
export function Logo({ className = "logo", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id="owDogGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2BFFB0" />
          <stop offset="1" stopColor="#7CF3FF" />
        </linearGradient>
        <linearGradient id="owLaser" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff2a2a" />
          <stop offset="0.6" stopColor="#ff5a3d" stopOpacity=".7" />
          <stop offset="1" stopColor="#ff5a3d" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* laser eyes (hidden until hover) */}
      <g className="dog__lasers">
        <path className="dog__laser dog__laser--l" d="M18.6 22.9 L-26 4" />
        <path className="dog__laser dog__laser--r" d="M29.4 22.9 L74 4" />
      </g>

      <g className="dog__head">
        {/* cropped ears */}
        <path className="dog__ear dog__ear--l" d="M15.6 15 L12 1.5 L20.6 12 Z" />
        <path className="dog__ear dog__ear--r" d="M32.4 15 L36 1.5 L27.4 12 Z" />
        {/* skull: wide cheeks tapering into a long doberman muzzle */}
        <path className="dog__skull" d="M16 11.5 L32 11.5 L37.5 19.5 L31.5 30 L28.5 40 L19.5 40 L16.5 30 L10.5 19.5 Z" />
        {/* tan muzzle + blaze */}
        <path className="dog__tan" d="M19.8 29 L28.2 29 L27.2 38.6 L20.8 38.6 Z" />
        <path className="dog__blaze" d="M24 13 L25.6 20 L24 28 L22.4 20 Z" />
        {/* tan brow spots, then angry brows */}
        <circle className="dog__spot" cx="17.6" cy="17" r="1" />
        <circle className="dog__spot" cx="30.4" cy="17" r="1" />
        <path className="dog__brow dog__brow--l" d="M14.6 18.6 L21.6 21.4" />
        <path className="dog__brow dog__brow--r" d="M33.4 18.6 L26.4 21.4" />
        {/* slit eyes */}
        <path className="dog__eye dog__eye--l" d="M16.4 21.8 L21.4 22.9 L17.4 24.2 Z" />
        <path className="dog__eye dog__eye--r" d="M31.6 21.8 L26.6 22.9 L30.6 24.2 Z" />
        {/* scar across the left eye */}
        <path className="dog__scar" d="M15.4 19.4 L19.8 26.6 M16.3 21.2 L18 20.6 M17.6 23.6 L19.3 23" />
        {/* nose */}
        <path className="dog__nose" d="M21.4 30.2 L26.6 30.2 L24 33.1 Z" />
        {/* jaw: fang tips always show; on hover it drops open */}
        <g className="dog__jaw">
          <path className="dog__mouth" d="M20.6 35.4 L24 36.9 L27.4 35.4" />
          <path className="dog__fang" d="M21.3 35.7 L22 39 L22.7 36 Z" />
          <path className="dog__fang" d="M26.7 35.7 L26 39 L25.3 36 Z" />
        </g>
        {/* spiked collar */}
        <path className="dog__collar" d="M18.6 41.4 L29.4 41.4" />
        <path className="dog__spike" d="M19.8 41.6 L20.6 44.2 L21.4 41.6 Z M23.2 41.6 L24 44.6 L24.8 41.6 Z M26.6 41.6 L27.4 44.2 L28.2 41.6 Z" />
      </g>
    </svg>
  );
}
