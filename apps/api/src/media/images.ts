import sharp, { type Metadata } from "sharp";
import { LARGEST_WIDTH, storedWidths } from "./urls";

/**
 * Product photos (D-061): every upload is turned into a few widths in AVIF and WebP, auto-rotated
 * and stripped of all metadata (EXIF, GPS, camera data). The original file is not kept.
 * Shared hosting has little memory, so one image is processed at a time without a cache.
 */
sharp.concurrency(1);
sharp.cache(false);

/** The smallest photo accepted (a product card is shown up to ~480 px wide). */
export const MIN_IMAGE_WIDTH = 480;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** About 50 megapixels; protects the server from "decompression bomb" files. */
const MAX_INPUT_PIXELS = 50_000_000;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export type ImageFormat = "avif" | "webp";
export const IMAGE_FORMATS: readonly ImageFormat[] = ["avif", "webp"];

export class ImageRejectedError extends Error {
  constructor(
    readonly reason: "unsupported" | "too_small" | "too_large",
    message: string,
  ) {
    super(message);
  }
}

/** Storage key of one variant: `<base>-<width>.<format>`. */
export function variantKey(base: string, width: number, format: ImageFormat): string {
  return `${base}-${width}.${format}`;
}

export type ProcessedImage = {
  /** Largest stored width and its height. */
  width: number;
  height: number;
  variants: { width: number; format: ImageFormat; body: Uint8Array }[];
};

let queue: Promise<unknown> = Promise.resolve();

/** Runs image work one job at a time (memory on shared hosting). */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

export function processProductImage(input: Uint8Array): Promise<ProcessedImage> {
  return serial(async () => {
    if (input.byteLength > MAX_UPLOAD_BYTES)
      throw new ImageRejectedError("too_large", "The file is larger than 20 MB");
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw new ImageRejectedError("unsupported", "Not a readable image");
    }
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format) || !meta.width || !meta.height)
      throw new ImageRejectedError("unsupported", "Use JPEG, PNG, WebP or AVIF");
    if ((meta.pages ?? 1) > 1)
      throw new ImageRejectedError("unsupported", "Animated images are not accepted");
    // EXIF orientation 5–8 swaps width and height.
    const rotated = (meta.orientation ?? 1) >= 5;
    const sourceWidth = rotated ? meta.height : meta.width;
    if (sourceWidth < MIN_IMAGE_WIDTH)
      throw new ImageRejectedError("too_small", `The photo must be at least ${MIN_IMAGE_WIDTH} px wide`);

    const maxWidth = Math.min(sourceWidth, LARGEST_WIDTH);
    const variants: ProcessedImage["variants"] = [];
    let height = 0;
    for (const width of storedWidths(maxWidth)) {
      // Decode once per width; .rotate() applies EXIF orientation, metadata is dropped by default.
      const resized = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      const raw = () =>
        sharp(resized.data, {
          raw: {
            width: resized.info.width,
            height: resized.info.height,
            channels: resized.info.channels,
          },
        });
      const [avif, webp] = await Promise.all([
        raw().avif({ quality: 55, effort: 3 }).toBuffer(),
        raw().webp({ quality: 80, effort: 4 }).toBuffer(),
      ]);
      variants.push(
        { width, format: "avif", body: new Uint8Array(avif) },
        { width, format: "webp", body: new Uint8Array(webp) },
      );
      if (width === maxWidth) height = resized.info.height;
    }
    return { width: maxWidth, height, variants };
  });
}
