import React from "react";

interface Props {
  size?: number;
}

/**
 * Ethos logo icon — precise SVG recreation of the DNA helix mark.
 *
 * Structure (traced from official brand asset):
 *  • Circular navy barrel (the helix viewed obliquely)
 *  • 4 teal horizontal bars clipped to the interior (the DNA rungs)
 *  • NE pole: two navy arms forking upper-right, teal tick marks crossing each
 *  • SW pole: mirror of NE
 *
 * Brand colors:  Navy #1B4F8C  |  Teal #47BDBD
 *
 * The SVG renders cleanly at all sizes with no white background — ideal for
 * placement on the dark sidebar. If the official asset file becomes available,
 * drop it at /public/ethos-logo.png and replace the <svg> with:
 *   <img src="/ethos-logo.png" alt="Ethos Shipment Intelligence" height={size} style={{ filter: "brightness(0) invert(1)" }} />
 */
const EthosLogo: React.FC<Props> = ({ size = 34 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 60 60"
    width={size}
    height={size}
    aria-label="Ethos Shipment Intelligence"
    style={{ flexShrink: 0, overflow: "visible" }}
  >
    <defs>
      {/* Clip teal bars to circle interior only */}
      <clipPath id="ethos-inner">
        <circle cx="30" cy="30" r="13.5" />
      </clipPath>
    </defs>

    {/* ── Teal interior bars (DNA rungs) — drawn first, ring covers edges ── */}
    <g clipPath="url(#ethos-inner)">
      <line x1="12" y1="22" x2="48" y2="22" stroke="#47BDBD" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="12" y1="27" x2="48" y2="27" stroke="#47BDBD" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="12" y1="32" x2="48" y2="32" stroke="#47BDBD" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="12" y1="37" x2="48" y2="37" stroke="#47BDBD" strokeWidth="3.2" strokeLinecap="round" />
    </g>

    {/* ── Helix barrel — navy ring drawn over teal bars ─────────────────── */}
    <circle cx="30" cy="30" r="13.5" fill="none" stroke="#1B4F8C" strokeWidth="4.5" />

    {/* ── NE pole: two navy arms forking upper-right ────────────────────── */}
    {/* Arm A — upper (outer strand end) */}
    <line x1="39.5" y1="20.5" x2="45.5" y2="13.5" stroke="#1B4F8C" strokeWidth="3.8" strokeLinecap="round" />
    {/* Arm B — lower (inner strand end), offset ~3px from A */}
    <line x1="36.5" y1="17.5" x2="42"   y2="10.5" stroke="#1B4F8C" strokeWidth="3.8" strokeLinecap="round" />
    {/* Teal tick on arm A */}
    <line x1="43"   y1="16"   x2="48"   y2="12"   stroke="#47BDBD" strokeWidth="2.8" strokeLinecap="round" />
    {/* Teal tick on arm B */}
    <line x1="40"   y1="13"   x2="45"   y2="9"    stroke="#47BDBD" strokeWidth="2.8" strokeLinecap="round" />

    {/* ── SW pole: mirror of NE ─────────────────────────────────────────── */}
    {/* Arm A — lower (outer strand end) */}
    <line x1="20.5" y1="39.5" x2="14.5" y2="46.5" stroke="#1B4F8C" strokeWidth="3.8" strokeLinecap="round" />
    {/* Arm B — upper (inner strand end) */}
    <line x1="23.5" y1="42.5" x2="18"   y2="49.5" stroke="#1B4F8C" strokeWidth="3.8" strokeLinecap="round" />
    {/* Teal tick on arm A */}
    <line x1="17"   y1="44"   x2="12"   y2="48"   stroke="#47BDBD" strokeWidth="2.8" strokeLinecap="round" />
    {/* Teal tick on arm B */}
    <line x1="20"   y1="47"   x2="15"   y2="51"   stroke="#47BDBD" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

export default EthosLogo;
