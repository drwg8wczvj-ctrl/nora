import React from "react";
import "./BrandStar.css";

const IMAGE_TONES = {
  black: "/star-black.png",
  white: "/star-white.png",
};

/**
 * The single Nora/Atlas signature mark.
 *
 * Use black or white when the mark needs an exact supplied artwork asset.
 * Purple, gold, and current inherit the same artwork silhouette through its
 * alpha mask, so no substitute sparkle glyph is introduced.
 */
export default function BrandStar({
  size = 24,
  tone = "current",
  label,
  className = "",
  style,
  ...props
}) {
  const imageSource = IMAGE_TONES[tone];
  const accessibilityProps = imageSource
    ? (!label ? { "aria-hidden": true } : {})
    : (label ? { role: "img", "aria-label": label } : { "aria-hidden": true });

  return (
    <span
      className={`brand-star brand-star--${tone}${className ? ` ${className}` : ""}`}
      style={{ ...style, "--brand-star-size": `${size}px` }}
      {...accessibilityProps}
      {...props}
    >
      {imageSource ? (
        <img src={imageSource} alt={label || ""} draggable="false" />
      ) : (
        <span className="brand-star__mask" />
      )}
    </span>
  );
}

export function BrandLockup({
  label = "NORA",
  size = 28,
  tone = "white",
  className = "",
  markOnly = false,
}) {
  return (
    <span
      className={`brand-lockup${markOnly ? " brand-lockup--mark-only" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
    >
      <BrandStar size={size} tone={tone} />
      {!markOnly && <span className="brand-lockup__wordmark" aria-hidden="true">{label}</span>}
    </span>
  );
}
