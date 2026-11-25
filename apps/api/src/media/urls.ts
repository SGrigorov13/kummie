import type { ProductImage } from "@kummie/contracts";
import { mediaUrl } from "../catalogue/repository";

/** Widths stored for every photo; smaller photos stop at their own width (here, not in ./images,
 * so reading the catalogue never loads sharp). */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;
export const LARGEST_WIDTH = 1600;

/** Widths stored for a photo whose largest stored width is `maxWidth`. */
export function storedWidths(maxWidth: number): number[] {
  return [...IMAGE_WIDTHS.filter((w) => w < maxWidth), maxWidth];
}

export type ImageRow = {
  path: string;
  width: number;
  height: number;
  altBg: string;
  altEn: string;
};

/** Public view of a stored photo: `<picture>` sources (AVIF, then WebP) and a WebP fallback. */
export function productImageView(mediaBaseUrl: string, row: ImageRow, fallbackAlt = ""): ProductImage {
  const widths = storedWidths(row.width);
  const url = (width: number, format: "avif" | "webp") =>
    mediaUrl(mediaBaseUrl, `${row.path}-${width}.${format}`);
  const srcset = (format: "avif" | "webp") => widths.map((w) => `${url(w, format)} ${w}w`).join(", ");
  const fallbackWidth = widths.filter((w) => w <= 960).at(-1) ?? widths[0] ?? row.width;
  return {
    url: url(fallbackWidth, "webp"),
    width: row.width,
    height: row.height,
    alt: { bg: row.altBg || fallbackAlt, en: row.altEn || fallbackAlt },
    sources: [
      { type: "image/avif", srcset: srcset("avif") },
      { type: "image/webp", srcset: srcset("webp") },
    ],
  };
}
