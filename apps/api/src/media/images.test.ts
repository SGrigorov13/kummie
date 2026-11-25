import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DiskStorage, isStorageKey, MemoryStorage } from "../adapters/disk-storage";
import { ImageRejectedError, processProductImage } from "./images";
import { productImageView, storedWidths } from "./urls";

/** A plain test photo; `orientation` 6 = the camera was turned (EXIF says "rotate 90°"). */
function photo(width: number, height: number, format: "jpeg" | "png" = "jpeg", orientation?: number) {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 120, g: 60, b: 200 } } });
  const withMeta = orientation
    ? img.withExif({ IFD0: { Make: "TestCam", Model: "Secret 1" } }).withMetadata({ orientation })
    : img;
  return format === "png" ? withMeta.png().toBuffer() : withMeta.jpeg().toBuffer();
}

describe("processProductImage", () => {
  it("makes AVIF and WebP in every width up to 1600 px and keeps the aspect ratio", async () => {
    const result = await processProductImage(await photo(2400, 3200));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(2133);
    expect(result.variants.map((v) => `${v.width}.${v.format}`)).toEqual([
      "480.avif",
      "480.webp",
      "960.avif",
      "960.webp",
      "1600.avif",
      "1600.webp",
    ]);
    const meta = await sharp(result.variants[3]?.body).metadata();
    expect([meta.format, meta.width]).toEqual(["webp", 960]);
  });

  it("stops at the photo's own width", async () => {
    const result = await processProductImage(await photo(700, 900, "png"));
    expect(result.width).toBe(700);
    expect(result.variants.map((v) => v.width)).toEqual([480, 480, 700, 700]);
  });

  it("turns the photo upright and removes EXIF data", async () => {
    // Stored 1200×900 with "rotate 90°": the real photo is 900 wide, 1200 high.
    const result = await processProductImage(await photo(1200, 900, "jpeg", 6));
    expect([result.width, result.height]).toEqual([900, 1200]);
    for (const v of result.variants) {
      const meta = await sharp(v.body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
    }
  });

  it("refuses small photos and files that are not images", async () => {
    await expect(processProductImage(await photo(300, 400))).rejects.toMatchObject({ reason: "too_small" });
    await expect(processProductImage(new TextEncoder().encode("<svg/>"))).rejects.toBeInstanceOf(
      ImageRejectedError,
    );
    const gif = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#fff" } })
      .gif()
      .toBuffer();
    await expect(processProductImage(gif)).rejects.toMatchObject({ reason: "unsupported" });
  });
});

describe("photo URLs", () => {
  it("lists AVIF then WebP sources and a WebP fallback of at most 960 px", () => {
    const view = productImageView(
      "https://api.kummie.eu/media",
      { path: "products/p/i", width: 1600, height: 2133, altBg: "", altEn: "Pouch" },
      "Калъф",
    );
    expect(storedWidths(1600)).toEqual([480, 960, 1600]);
    expect(view.url).toBe("https://api.kummie.eu/media/products/p/i-960.webp");
    expect(view.sources[0]).toEqual({
      type: "image/avif",
      srcset:
        "https://api.kummie.eu/media/products/p/i-480.avif 480w, https://api.kummie.eu/media/products/p/i-960.avif 960w, https://api.kummie.eu/media/products/p/i-1600.avif 1600w",
    });
    expect(view.alt).toEqual({ bg: "Калъф", en: "Pouch" });
  });
});

describe("storage keys", () => {
  it("accept only our photo names", () => {
    expect(isStorageKey("products/0b6c/0b6c-480.webp")).toBe(true);
    for (const bad of [
      "../.env",
      "products/../../x.webp",
      "products/a.svg",
      "/etc/x.webp",
      "Products/A.webp",
    ])
      expect(isStorageKey(bad)).toBe(false);
  });

  it("write, read and delete through the adapters", async () => {
    const memory = new MemoryStorage();
    const stored = await memory.put("products/a/b-480.webp", new Uint8Array([1, 2]), "image/webp");
    expect(stored.publicUrl).toBe("http://media.test/products/a/b-480.webp");
    expect(await memory.get("products/a/b-480.webp")).toEqual(new Uint8Array([1, 2]));
    const disk = new DiskStorage("media-test-unused", "/media");
    await expect(disk.put("../escape.webp", new Uint8Array([1]), "image/webp")).rejects.toThrow();
  });
});
