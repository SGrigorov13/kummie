import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  colors,
  fontFamilies,
  motion,
  radius,
  shadow,
  space,
  star,
  surfaces,
  tracking,
  typeScale,
} from "./tokens";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const packageCss = read("../tokens.css");
const docsCss = read("../../../docs/brand/tokens.css");

/** Custom properties of the first `:root { … }` block. */
function rootVars(css: string): Map<string, string> {
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const vars = new Map<string, string>();
  for (const match of block.matchAll(/--kum-([a-z0-9-]+):\s*([^;]+);/g)) {
    vars.set(match[1] as string, (match[2] as string).trim());
  }
  return vars;
}

const vars = rootVars(packageCss);
const v = (name: string) => {
  const value = vars.get(name);
  if (value === undefined) throw new Error(`--kum-${name} missing from tokens.css`);
  return value;
};

const camelToKebab = (key: string) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
const byName = (name: string) => Object.entries(colors).find(([key]) => camelToKebab(key) === name)?.[1];

describe("tokens.css", () => {
  it("is a verbatim copy of docs/brand/tokens.css (single source)", () => {
    expect(packageCss.replace(/\r\n/g, "\n")).toBe(docsCss.replace(/\r\n/g, "\n"));
  });
});

describe("tokens.ts mirrors tokens.css", () => {
  it("colours", () => {
    const cssColours = [...vars.entries()].filter(([, value]) => value.startsWith("#"));
    expect(cssColours).toHaveLength(Object.keys(colors).length);
    for (const [key, hex] of Object.entries(colors)) {
      expect(v(camelToKebab(key)).toUpperCase(), key).toBe(hex);
    }
  });

  it("font families", () => {
    for (const [role, family] of Object.entries(fontFamilies)) {
      expect(v(`font-${role}`).startsWith(`"${family}"`), role).toBe(true);
    }
  });

  it("type scale", () => {
    const cssName: Record<keyof typeof typeScale, string> = {
      display: "display",
      h2: "h2",
      h3: "h3",
      body: "body",
      small: "small",
      label: "label-ty",
    };
    for (const [key, style] of Object.entries(typeScale)) {
      const parsed = v(cssName[key as keyof typeof typeScale]).match(
        /^(\d+)\s+(\d+)px\/([\d.]+)\s+var\(--kum-font-([a-z]+)\)$/,
      );
      expect(parsed, key).not.toBeNull();
      const [, weight, size, lineHeight, family] = parsed as RegExpMatchArray;
      expect({ weight, size: Number(size), lineHeight: Number(lineHeight), family }, key).toEqual({
        weight: style.weight,
        size: style.size,
        lineHeight: style.lineHeight,
        family: style.family,
      });
    }
  });

  it("tracking, spacing, radii, shadow", () => {
    expect(v("track-display")).toBe(`${tracking.display}em`);
    expect(v("track-label")).toBe(`${tracking.label}em`);
    expect(Number.parseFloat(v("track-tagline"))).toBe(tracking.tagline);
    expect(v("space")).toBe(`${space}px`);
    expect(v("radius-sm")).toBe(`${radius.sm}px`);
    expect(v("radius-md")).toBe(`${radius.md}px`);
    expect(v("radius-lg")).toBe(`${radius.lg}px`);
    expect(v("radius-pill")).toBe(`${radius.pill}px`);
    expect(v("shadow")).toBe(shadow);
  });

  it("motion and star", () => {
    expect(v("motion-fast")).toBe(`${motion.fastMs}ms`);
    expect(v("motion-base")).toBe(`${motion.baseMs}ms`);
    expect(v("ease").replace(/\s/g, "")).toBe(`cubic-bezier(${motion.ease.join(",")})`.replace(/0\./g, "."));
    expect(v("star-rotation")).toBe(`${star.rotationDeg}deg`);
    expect(v("star-clip")).toBe(star.clipPath);
  });

  it("light and dark surfaces", () => {
    const dark = packageCss.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const light =
      packageCss.match(/prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const resolve = (block: string, prop: string) =>
      byName(block.match(new RegExp(`--kum-${prop}:\\s*var\\(--kum-([a-z-]+)\\)`))?.[1] ?? "");
    expect(resolve(dark, "surface")).toBe(surfaces.dark.surface);
    expect(resolve(dark, "on-surface")).toBe(surfaces.dark.onSurface);
    expect(resolve(light, "surface")).toBe(surfaces.light.surface);
    expect(resolve(light, "on-surface")).toBe(surfaces.light.onSurface);
  });
});
