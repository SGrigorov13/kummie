/**
 * KUMMIE design tokens for React Native and other JS consumers.
 * Mirrors `tokens.css` (copied verbatim from docs/brand/tokens.css). `tokens.test.ts` fails if the
 * two drift — change the CSS in docs/brand first, then here.
 */

export const colors = {
  violet: "#5B14E5",
  ink: "#2D0075",
  glow: "#B4FF3A",
  pink: "#FF2E9A",
  spotlight: "#FFE44D",
  paper: "#F4F2EF",
  white: "#FFFFFF",
  label: "#6B5FA0",
  bodyMuted: "#55507A",
  hairline: "#E6E2DA",
} as const;

export type ColorToken = keyof typeof colors;

/** Light mode: Paper ground, Ink text. Dark mode: Ink ground, Paper text, Glow actions. */
export const surfaces = {
  light: { surface: colors.paper, onSurface: colors.ink },
  dark: { surface: colors.ink, onSurface: colors.paper },
} as const;

/** Family names as declared in fonts.css (and as loaded by the mobile app). */
export const fontFamilies = {
  display: "Archivo Black",
  text: "Space Grotesk",
  mono: "Space Mono",
} as const;

export type TypeStyle = {
  family: keyof typeof fontFamilies;
  weight: "400" | "500" | "700";
  size: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
};

export const typeScale = {
  display: { family: "display", weight: "700", size: 44, lineHeight: 1.05 },
  h2: { family: "display", weight: "400", size: 30, lineHeight: 1.1 },
  h3: { family: "text", weight: "700", size: 20, lineHeight: 1.25 },
  body: { family: "text", weight: "400", size: 16, lineHeight: 1.6 },
  small: { family: "text", weight: "400", size: 14, lineHeight: 1.5 },
  label: { family: "mono", weight: "700", size: 12, lineHeight: 1.2 },
} as const satisfies Record<string, TypeStyle>;

/** Letter spacing in em. */
export const tracking = {
  display: -0.02,
  label: 0.12,
  tagline: 0.26,
} as const;

/** Every spacing value is a multiple of this (px / pt / dp). */
export const space = 4;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const shadow = "0 18px 46px -24px rgba(45, 0, 117, .28)";

export const motion = {
  fastMs: 180,
  baseMs: 240,
  /** cubic-bezier control points. */
  ease: [0.2, 0.7, 0.3, 1] as const,
} as const;

export const star = {
  /** Fixed. Never change. */
  rotationDeg: -20,
  clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  /** The same polygon as an SVG path on a 100×100 viewBox (logo-geometry.md). */
  path: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
} as const;

/** Equaliser bar heights as a ratio of the block height (logo-geometry.md §2). */
export const equaliser = {
  bars: [0.33, 0.66, 1, 0.53, 0.79, 0.29],
  /** Bars 3 and 5 (1-based) are Glow, the rest Pink. */
  glowBars: [2, 4],
  compactBars: [0.35, 0.82, 0.53, 0.94],
  /** width = H / 10.3, gap = H / 14.4, radius = width / 1.6 */
  widthDivisor: 10.3,
  gapDivisor: 14.4,
  radiusDivisor: 1.6,
} as const;

/** Spacing helper: `sp(4)` → 16. */
export function sp(steps: number): number {
  return steps * space;
}

/** Absolute line height for React Native. */
export function lineHeightPx(style: TypeStyle): number {
  return Math.round(style.size * style.lineHeight);
}
