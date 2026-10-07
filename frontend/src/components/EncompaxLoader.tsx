import React from "react";

type EncompaxLoaderProps = {
  label?: string;
  detail?: string;
  fullScreen?: boolean;
};

const EncompaxLoader: React.FC<EncompaxLoaderProps> = ({
  label = "Preparing your workspace",
  detail,
  fullScreen = false,
}) => (
  <div className={`encompax-loader${fullScreen ? " encompax-loader-full" : ""}`} role="status" aria-live="polite">
    <div className="encompax-loader-stage" aria-hidden="true">
      <span className="encompax-loader-shape encompax-loader-orbit" />
      <span className="encompax-loader-shape encompax-loader-petals" />
      <span className="encompax-loader-shape encompax-loader-diamond" />
      <span className="encompax-loader-shape encompax-loader-rings" />
    </div>
    <strong>{label}</strong>
    {detail ? <span>{detail}</span> : null}
  </div>
);

export default EncompaxLoader;
