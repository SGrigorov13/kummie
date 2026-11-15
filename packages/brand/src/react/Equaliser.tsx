import type { CSSProperties } from "react";
import { equaliser } from "../tokens";

export type EqualiserProps = {
  /** Four one-colour bars for icon sizes; six brand bars otherwise. */
  compact?: boolean;
  /** Block height, e.g. 24 or "1.5rem". Defaults to `--kum-eq-h` (24px). */
  height?: number | string;
  /** Force the animation on (loading, live drop). Paused by default; hover/active also start it. */
  animate?: boolean;
  className?: string;
};

/**
 * Six-bar equaliser (logo-geometry.md §2). Paused by default, animates on hover/active or with
 * `animate`, and stops entirely under `prefers-reduced-motion` (brand.css).
 */
export function Equaliser({ compact = false, height, animate = false, className }: EqualiserProps) {
  const bars = compact ? equaliser.compactBars : equaliser.bars;
  const style: CSSProperties | undefined =
    height === undefined
      ? undefined
      : ({ "--kum-eq-h": typeof height === "number" ? `${height}px` : height } as CSSProperties);
  const classes = ["kum-eq", compact ? "kum-eq--compact" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={classes} style={style} data-animate={animate ? "true" : undefined} aria-hidden="true">
      {bars.map((ratio, index) => (
        <i
          key={index}
          className={!compact && (equaliser.glowBars as readonly number[]).includes(index) ? "kum-eq__glow" : undefined}
          style={{ height: `${ratio * 100}%`, animationDelay: `${index * -140}ms` }}
        />
      ))}
    </span>
  );
}
