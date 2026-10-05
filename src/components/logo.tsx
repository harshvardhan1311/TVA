/* ============================================================================
   TVA — BRAND MARK
   ----------------------------------------------------------------------------
   The TVA monogram: a "T" set in a rounded squircle with a cool-to-warm
   gradient. It replaces an earlier tree glyph, which read as generic.

   Kept as inline SVG rather than an <img> so it inherits the live theme
   through currentColor and CSS custom properties, and so the favicon and the
   header mark stay the same drawing.
   ========================================================================== */

export function TvaMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="brand__mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="TVA"
    >
      <defs>
        <linearGradient id="tva-mark-sq" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--mark-sq-a)" />
          <stop offset="0.55" stopColor="var(--mark-sq-b)" />
          <stop offset="1" stopColor="var(--mark-sq-c)" />
        </linearGradient>
        <linearGradient id="tva-mark-t" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--mark-t-a)" />
          <stop offset="0.5" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--violet)" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#tva-mark-sq)" />
      <rect
        x="2.9"
        y="2.9"
        width="58.2"
        height="58.2"
        rx="16.2"
        fill="none"
        stroke="var(--accent)"
        strokeOpacity="0.4"
        strokeWidth="1.8"
      />
      <path
        d="M18 19.5h28a3 3 0 0 1 3 3v3.2a3 3 0 0 1-3 3h-1.6v16.1a3 3 0 0 1-3 3H22.6a3 3 0 0 1-3-3V28.7H18a3 3 0 0 1-3-3v-3.2a3 3 0 0 1 3-3Z"
        fill="url(#tva-mark-t)"
      />
      <path
        d="M18 19.5h28a3 3 0 0 1 3 3v1.1H15v-1.1a3 3 0 0 1 3-3Z"
        fill="#fff"
        fillOpacity="0.24"
      />
    </svg>
  )
}