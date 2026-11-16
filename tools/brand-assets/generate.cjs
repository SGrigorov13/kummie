// Generates the KUMMIE app icon, Android adaptive icon layers, splash lockup and favicon from the
// brand geometry (docs/brand/logo-geometry.md). Text is converted to outlines from the OFL TTFs.
// Usage: node generate.cjs <deps-dir> <repo-root> <out-dir>
const path = require("path");
const [depsDir, repo, outDir] = process.argv.slice(2);
const opentype = require(path.join(depsDir, "node_modules", "opentype.js"));
const sharp = require(path.join(depsDir, "node_modules", "sharp"));

const C = { violet: "#5B14E5", ink: "#2D0075", glow: "#B4FF3A", pink: "#FF2E9A", white: "#FFFFFF" };
const fontsDir = path.join(repo, "apps", "mobile", "node_modules", "@expo-google-fonts");
const archivo = opentype.loadSync(path.join(fontsDir, "archivo-black", "400Regular", "ArchivoBlack_400Regular.ttf"));
const grotesk = opentype.loadSync(path.join(fontsDir, "space-grotesk", "500Medium", "SpaceGrotesk_500Medium.ttf"));

const STAR = "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z";

/** Star of `size` px, centred on (cx, cy), rotated −20° (never changes). */
function star(cx, cy, size, fill) {
  const s = size / 100;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${s})"><g transform="rotate(-20 50 50)"><path fill="${fill}" d="${STAR}"/></g></g>`;
}

/** Text as outlines with tracking (em). Returns { d, width }. */
function text(font, str, x, baseline, size, trackingEm = 0) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const parts = [];
  const glyphs = font.stringToGlyphs(str);
  glyphs.forEach((glyph, i) => {
    parts.push(glyph.getPath(cursor, baseline, size).toPathData(2));
    cursor += glyph.advanceWidth * scale;
    if (i < glyphs.length - 1) cursor += trackingEm * size;
  });
  return { d: parts.join(""), width: cursor - x };
}

function measure(font, str, size, trackingEm = 0) {
  return text(font, str, 0, 0, size, trackingEm).width;
}

function capHeight(font, size) {
  return ((font.tables.os2 && font.tables.os2.sCapHeight) || font.unitsPerEm * 0.7) / font.unitsPerEm * size;
}

function svg(w, h, body, background) {
  const bg = background ? `<rect width="${w}" height="${h}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${body}</svg>`;
}

/** Monogram: violet ground, pink star at ~77 % of the tile, white K centred on the star. */
function monogram(size, { withK = true, radius = 0 } = {}) {
  const ground = radius
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${C.violet}"/>`
    : `<rect width="${size}" height="${size}" fill="${C.violet}"/>`;
  let body = ground + star(size / 2, size / 2, size * 0.77, C.pink);
  if (withK) {
    const fs = size * 0.346; // K at 36px on a 104px tile in the brand reference
    const w = measure(archivo, "K", fs);
    const k = text(archivo, "K", size / 2 - w / 2, size / 2 + capHeight(archivo, fs) / 2, fs);
    body += `<path fill="${C.white}" d="${k.d}"/>`;
  }
  return svg(size, size, body);
}

/** Stacked lockup for the splash: four-bar equaliser, wordmark with the star behind the K, tagline. */
function splash(size) {
  const word = "KUMMIE";
  const tagline = "YOUR K-POP CHINGU";
  const fs = (size * 0.66) / (measure(archivo, word, 1, -0.02) || 1);
  const wordWidth = measure(archivo, word, fs, -0.02);
  const cap = capHeight(archivo, fs);
  const starSize = (fs * 115) / 52;
  const x0 = (size - wordWidth) / 2 + fs * 0.12;
  const eqH = fs * 0.62;
  const gap = fs * 0.12;
  const tagFs = fs * 0.27;
  const tagGap = fs * 0.2;
  // Vertical stack: equaliser · star block (wordmark centred in it) · tagline.
  const blockTop = (size - (eqH + gap + starSize * 0.82 + tagGap + tagFs)) / 2;
  const eqTop = blockTop;
  const starCy = eqTop + eqH + gap + starSize * 0.41;
  const baseline = starCy + cap / 2;
  const starCx = x0 + (-39 / 52) * fs + starSize / 2;

  // Four equaliser bars, one colour (icon-size rule), centred above the wordmark.
  const bars = [0.35, 0.82, 0.53, 0.94];
  const barW = eqH / 10.3 * 1.6;
  const barGap = eqH / 14.4 * 1.6;
  const eqWidth = bars.length * barW + (bars.length - 1) * barGap;
  let eq = "";
  bars.forEach((r, i) => {
    const h = eqH * r;
    const x = size / 2 - eqWidth / 2 + i * (barW + barGap);
    const y = eqTop + (eqH - h) / 2;
    eq += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${(barW / 1.6).toFixed(1)}" fill="${C.glow}"/>`;
  });

  const wm = text(archivo, word, x0, baseline, fs, -0.02);
  const tagWidth = measure(grotesk, tagline, tagFs, 0.26);
  const tg = text(grotesk, tagline, size / 2 - tagWidth / 2, baseline + tagGap + tagFs, tagFs, 0.26);
  const body =
    eq +
    star(starCx, starCy, starSize, C.pink) +
    `<path fill="${C.white}" d="${wm.d}"/>` +
    `<path fill="${C.glow}" d="${tg.d}"/>`;
  return svg(size, size, body);
}

async function png(svgString, file, { flatten } = {}) {
  let img = sharp(Buffer.from(svgString));
  if (flatten) img = img.flatten({ background: flatten });
  await img.png().toFile(path.join(outDir, file));
  console.log("wrote", file);
}

(async () => {
  // iOS / store icon: full square, no transparency.
  await png(monogram(1024), "icon.png", { flatten: C.violet });
  // Android adaptive icon: violet background colour in app.json; star inside the 66 % safe circle;
  // K dropped because launchers commonly use round masks.
  await png(svg(1024, 1024, star(512, 512, 1024 * 0.6, C.pink)), "android-icon-foreground.png");
  await png(svg(1024, 1024, star(512, 512, 1024 * 0.6, C.white)), "android-icon-monochrome.png");
  // Splash: stacked lockup on transparent, shown on the violet splash background.
  await png(splash(1024), "splash-icon.png");
  // Web favicon for the Expo web build: 48 px monogram with rounded corners (K kept ≥ 32 px).
  await png(monogram(48, { radius: 10 }), "favicon.png");
  // Preview sheet for review only.
  await png(monogram(512, { radius: 112 }), "preview-monogram.png");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
