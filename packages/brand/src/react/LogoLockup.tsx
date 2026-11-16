import type { CSSProperties } from "react";
import { Equaliser } from "./Equaliser";
import { Star } from "./Star";

export type LogoLockupProps = {
  /** Wordmark size in px. The star, equaliser and margins scale from it. Minimum width 140px. */
  size?: number;
  /** Show "YOUR K-POP CHINGU" under the wordmark. */
  tagline?: boolean;
  className?: string;
};

/**
 * Horizontal lockup: equaliser · gap · wordmark column, with the pink star behind the K.
 * Geometry from logo-geometry.md: for a 52px wordmark the star is 115px at left −39px and the
 * column margin is 48px, so the star never covers a bar. Everything scales from `size`.
 * The wordmark is Archivo Black for now; swap for the redrawn SVG later without layout change.
 */
export function LogoLockup({ size = 28, tagline = true, className }: LogoLockupProps) {
  const style = { "--kum-logo-size": `${size}px` } as CSSProperties;
  return (
    <span className={className ? `kum-logo ${className}` : "kum-logo"} style={style}>
      <Equaliser />
      <span className="kum-logo__col">
        <Star className="kum-logo__star" />
        <span className="kum-logo__word">KUMMIE</span>
        {tagline ? <span className="kum-logo__tag">Your K-pop Chingu</span> : null}
      </span>
    </span>
  );
}
