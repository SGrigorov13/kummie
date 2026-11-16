import { star } from "../tokens";

export type StarProps = {
  className?: string;
  /** Accessible name. Omit for a decorative star (the default). */
  title?: string;
  size?: number | string;
};

/**
 * The KUMMIE star: 10-point polygon rotated −20°, filled with `currentColor` so the parent decides
 * pink / glow / white. Never outlined, never a gradient.
 */
export function Star({ className, title, size }: StarProps) {
  const decorative = !title;
  return (
    <svg
      className={className ? `kum-star ${className}` : "kum-star"}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      focusable="false"
    >
      <g transform={`rotate(${star.rotationDeg} 50 50)`}>
        <path fill="currentColor" d={star.path} />
      </g>
    </svg>
  );
}
