import React from "react";

interface Props {
  size?: number;
  opacity?: number;
  title?: string;
}

const EncompaxMark: React.FC<Props> = ({
  size = 20,
  opacity = 1,
  title = "Encompax",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    role="img"
    aria-label={title}
    style={{ opacity, flexShrink: 0 }}
  >
    <circle cx="512" cy="512" r="250" fill="none" stroke="#0A0A0A" strokeWidth="18" />

    <g fill="none" stroke="#8B0000" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="512" cy="512" r="108" />
      <circle cx="512" cy="404" r="108" />
      <circle cx="605.53" cy="458" r="108" />
      <circle cx="605.53" cy="566" r="108" />
      <circle cx="512" cy="620" r="108" />
      <circle cx="418.47" cy="566" r="108" />
      <circle cx="418.47" cy="458" r="108" />
    </g>

    <g fill="#14B8A6">
      <circle cx="512" cy="296" r="10" />
      <circle cx="699.06" cy="404" r="10" />
      <circle cx="699.06" cy="620" r="10" />
      <circle cx="512" cy="728" r="10" />
      <circle cx="324.94" cy="620" r="10" />
      <circle cx="324.94" cy="404" r="10" />
    </g>
  </svg>
);

export default EncompaxMark;
