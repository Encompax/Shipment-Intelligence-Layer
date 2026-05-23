import React from "react";

interface Props {
  size?: number;
  title?: string;
}

const cubePath = "M0 -14 L12 -7 L12 7 L0 14 L-12 7 L-12 -7 Z";

const CubeGlyph: React.FC<{ x: number; y: number; scale: number; opacity?: number }> = ({
  x,
  y,
  scale,
  opacity = 1,
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
    <path d={cubePath} fill="rgba(14, 165, 233, 0.13)" stroke="#38BDF8" strokeWidth="1.2" />
    <path d="M0 -14 L0 0 L12 -7" fill="none" stroke="#67E8F9" strokeWidth="1" strokeOpacity="0.9" />
    <path d="M0 0 L0 14" fill="none" stroke="#0EA5E9" strokeWidth="1" strokeOpacity="0.75" />
    <path d="M0 0 L-12 -7" fill="none" stroke="#14B8A6" strokeWidth="1" strokeOpacity="0.85" />
  </g>
);

const SeedOfLifeGuide: React.FC = () => {
  const points = [
    [0, 0],
    [11, 0],
    [5.5, 9.526],
    [-5.5, 9.526],
    [-11, 0],
    [-5.5, -9.526],
    [5.5, -9.526],
  ];

  return (
    <g fill="none" stroke="#67E8F9" strokeWidth="0.6" strokeOpacity="0.28">
      {points.map(([cx, cy], index) => (
        <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="11" />
      ))}
    </g>
  );
};

const SILLogo: React.FC<Props> = ({ size = 40, title = "Shipment Intelligence Layer" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="-32 -32 64 64"
    width={size}
    height={size}
    role="img"
    aria-label={title}
    style={{ flexShrink: 0, overflow: "visible" }}
  >
    <defs>
      <radialGradient id="sil-core-glow" cx="50%" cy="42%" r="70%">
        <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.32" />
        <stop offset="52%" stopColor="#0F766E" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#020617" stopOpacity="0.96" />
      </radialGradient>
      <linearGradient id="sil-ring" x1="-24" y1="-24" x2="24" y2="24">
        <stop offset="0%" stopColor="#67E8F9" />
        <stop offset="50%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#2563EB" />
      </linearGradient>
    </defs>

    <circle r="30" fill="#07111F" />
    <circle r="28" fill="url(#sil-core-glow)" stroke="url(#sil-ring)" strokeWidth="1.1" />

    <g transform="rotate(30)">
      <SeedOfLifeGuide />
    </g>

    <g>
      <CubeGlyph x="0" y="-8.8" scale={0.78} opacity={0.96} />
      <CubeGlyph x="-9.8" y="7" scale={0.58} opacity={0.84} />
      <CubeGlyph x="9.8" y="7" scale={0.58} opacity={0.84} />
      <CubeGlyph x="0" y="14.8" scale={0.42} opacity={0.72} />
    </g>

    <g fill="none" strokeLinecap="round">
      <path d="M0 -20 L0 -25" stroke="#67E8F9" strokeWidth="1.2" strokeOpacity="0.78" />
      <path d="M17.3 -10 L21.8 -12.6" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.72" />
      <path d="M17.3 10 L21.8 12.6" stroke="#14B8A6" strokeWidth="1.2" strokeOpacity="0.72" />
      <path d="M0 20 L0 25" stroke="#38BDF8" strokeWidth="1.2" strokeOpacity="0.78" />
      <path d="M-17.3 10 L-21.8 12.6" stroke="#14B8A6" strokeWidth="1.2" strokeOpacity="0.72" />
      <path d="M-17.3 -10 L-21.8 -12.6" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.72" />
    </g>

    <circle r="23.5" fill="none" stroke="#0F766E" strokeWidth="0.8" strokeOpacity="0.55" />
    <circle r="18.7" fill="none" stroke="#38BDF8" strokeWidth="0.45" strokeOpacity="0.32" />
  </svg>
);

export default SILLogo;
