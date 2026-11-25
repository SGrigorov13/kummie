import { AdminImageList, IdParams, ImageAltInput, ImageOrderInput } from "@kummie/contracts";
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { StorageAdapter } from "../adapters/storage";
import type { Database } from "../db/client";
import { productImages, products } from "../db/schema";
import {
  ACCEPTED_TYPES,
  IMAGE_FORMATS,
  ImageRejectedError,
  MAX_UPLOAD_BYTES,
  processProductImage,
  variantKey,
} from "../media/images";
import { storedWidths } from "../media/urls";
import { audit, requireStaff, type AdminDeps } from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });
const ImageParams = z.object({ id: z.string().uuid(), imageId: z.string().uuid() });
/** At most this many photos per product. */
export const MAX_IMAGES = 12;

export type MediaDeps = { storage: StorageAdapter };

/** Every stored file of one photo (all widths, both formats). */
function keysOf(path: string, width: number): string[] {
  return storedWidths(width).flatMap((w) => IMAGE_FORMATS.map((f) => variantKey(path, w, f)));
}

async function listImages(db: Database, storage: StorageAdapter, productId: string): Promise<AdminImageList> {
  const rows = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position), asc(productImages.id));
  return {
    items: rows.map((row) => {
      const widths = storedWidths(row.width);
      const middle = widths.filter((w) => w <= 960).at(-1) ?? row.width;
      return {
        id: row.id,
        url: storage.publicUrl(variantKey(row.path, middle, "webp")),
        thumbUrl: storage.publicUrl(variantKey(row.path, widths[0] ?? row.width, "webp")),
        width: row.width,
        height: row.height,
        alt: { bg: row.altBg, en: row.altEn },
        position: row.position,
      };
    }),
  };
}

/**
 * Admin → product editor → Снимки (D-061). Upload sends the photo's own bytes with its image type;
 * the server makes AVIF and WebP in up to three widths, drops EXIF/GPS and never keeps the original.
 * Roles admin and content; every change is audited.
 */
export function imagesRoutes(deps: AdminDeps & MediaDeps): FastifyPluginAsyncZod {
  const { db, storage } = deps;
  const canEdit = requireStaff(db, ["admin", "content"]);

  return async (app) => {
    // Photos arrive as raw bytes (image/jpeg, image/png, …), parsed only in this plugin.
    app.addContentTypeParser(
      [...ACCEPTED_TYPES],
      { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES },
      (_request, body, done) => done(null, body),
    );

    const productExists = async (id: string) =>
      (await db.select({ id: products.id }).from(products).where(eq(products.id, id))).length > 0;

    app.get(
      "/admin-api/products/:id/images",
      {
        preHandler: canEdit,
        schema: { params: IdParams, response: { 200: AdminImageList, 404: ApiError } },
      },
      async (request, reply) => {
        if (!(await productExists(request.params.id)))
          return reply.code(404).send({ error: "not_found", message: "No such product" });
        return listImages(db, storage, request.params.id);
      },
    );

    app.post(
      "/admin-api/products/:id/images",
      {
        preHandler: canEdit,
        bodyLimit: MAX_UPLOAD_BYTES,
        schema: {
          params: IdParams,
          response: { 200: AdminImageList, 404: ApiError, 409: ApiError, 415: ApiError, 422: ApiError },
        },
      },
      async (request, reply) => {
        const productId = request.params.id;
        const [product] = await db
          .select({ id: products.id, title: products.title })
          .from(products)
          .where(eq(products.id, productId));
        if (!product) return reply.code(404).send({ error: "not_found", message: "No such product" });
        if (!Buffer.isBuffer(request.body))
          return reply
            .code(415)
            .send({ error: "unsupported_media_type", message: "Send a JPEG, PNG, WebP or AVIF file" });
        const [{ count } = { count: 0 }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(productImages)
          .where(eq(productImages.productId, productId));
        if (count >= MAX_IMAGES)
          return reply
            .code(409)
            .send({ error: "too_many_images", message: `At most ${MAX_IMAGES} photos per product` });

        let processed;
        try {
          processed = await processProductImage(new Uint8Array(request.body));
        } catch (error) {
          if (error instanceof ImageRejectedError)
            return reply.code(422).send({ error: `image_${error.reason}`, message: error.message });
          throw error;
        }

        const imageId = randomUUID();
        const path = `products/${productId}/${imageId}`;
        const written: string[] = [];
        try {
          for (const v of processed.variants) {
            const key = variantKey(path, v.width, v.format);
            await storage.put(key, v.body, `image/${v.format}`);
            written.push(key);
          }
          const [{ next } = { next: 0 }] = await db
            .select({ next: sql<number>`coalesce(max(${productImages.position}) + 1, 0)::int` })
            .from(productImages)
            .where(eq(productImages.productId, productId));
          await db.insert(productImages).values({
            id: imageId,
            productId,
            path,
            width: processed.width,
            height: processed.height,
            // Alt text starts as the product title; staff can describe the photo better.
            altBg: product.title,
            altEn: product.title,
            position: next,
          });
        } catch (error) {
          await Promise.all(written.map((key) => storage.delete(key).catch(() => undefined)));
          throw error;
        }
        await audit(db, request.staff?.id ?? null, "product.image_added", "product", productId, {
          imageId,
          width: processed.width,
          height: processed.height,
        });
        return listImages(db, storage, productId);
      },
    );

    app.put(
      "/admin-api/products/:id/images/:imageId",
      {
        preHandler: canEdit,
        schema: {
          params: ImageParams,
          body: ImageAltInput,
          response: { 200: AdminImageList, 404: ApiError },
        },
      },
      async (request, reply) => {
        const { id, imageId } = request.params;
        const updated = await db
          .update(productImages)
          .set({ altBg: request.body.alt.bg, altEn: request.body.alt.en })
          .where(and(eq(productImages.id, imageId), eq(productImages.productId, id)))
          .returning({ id: productImages.id });
        if (updated.length === 0)
          return reply.code(404).send({ error: "not_found", message: "No such photo" });
        await audit(db, request.staff?.id ?? null, "product.image_alt", "product", id, { imageId });
        return listImages(db, storage, id);
      },
    );

    app.put(
      "/admin-api/products/:id/images-order",
      {
        preHandler: canEdit,
        schema: {
          params: IdParams,
          body: ImageOrderInput,
          response: { 200: AdminImageList, 422: ApiError },
        },
      },
      async (request, reply) => {
        const productId = request.params.id;
        const ids = request.body.ids;
        const rows = await db
          .select({ id: productImages.id })
          .from(productImages)
          .where(eq(productImages.productId, productId));
        const current = new Set(rows.map((r) => r.id));
        if (
          ids.length !== current.size ||
          new Set(ids).size !== ids.length ||
          ids.some((x) => !current.has(x))
        )
          return reply
            .code(422)
            .send({ error: "invalid_order", message: "Send every photo of the product exactly once" });
        await db.transaction(async (tx) => {
          for (const [position, imageId] of ids.entries())
            await tx.update(productImages).set({ position }).where(eq(productImages.id, imageId));
        });
        await audit(db, request.staff?.id ?? null, "product.images_ordered", "product", productId);
        return listImages(db, storage, productId);
      },
    );

    app.delete(
      "/admin-api/products/:id/images/:imageId",
      {
        preHandler: canEdit,
        schema: { params: ImageParams, response: { 200: AdminImageList, 404: ApiError } },
      },
      async (request, reply) => {
        const { id, imageId } = request.params;
        const [removed] = await db
          .delete(productImages)
          .where(and(eq(productImages.id, imageId), eq(productImages.productId, id)))
          .returning();
        if (!removed) return reply.code(404).send({ error: "not_found", message: "No such photo" });
        // Files go after the row: a failed delete leaves an orphan file, never a broken photo.
        await Promise.all(
          keysOf(removed.path, removed.width).map((key) =>
            storage
              .delete(key)
              .catch((error: unknown) =>
                request.log.warn({ err: error, key }, "could not delete photo file"),
              ),
          ),
        );
        await audit(db, request.staff?.id ?? null, "product.image_removed", "product", id, { imageId });
        return listImages(db, storage, id);
      },
    );
  };
}
