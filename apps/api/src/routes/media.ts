import type { FastifyPluginAsync } from "fastify";
import type { StorageAdapter } from "../adapters/storage";
import { isStorageKey } from "../adapters/disk-storage";

const TYPES: Record<string, string> = { avif: "image/avif", webp: "image/webp" };

/**
 * Serves product photos from storage under /media/<key>. Every key holds a new random id, so a file
 * never changes and may be cached for a year. In production LiteSpeed may serve the same folder
 * directly instead (MEDIA_BASE_URL then points there).
 */
export function mediaRoutes(storage: StorageAdapter): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { "*": string } }>("/media/*", async (request, reply) => {
      const key = request.params["*"];
      const body = isStorageKey(key) ? await storage.get(key) : null;
      if (!body) return reply.code(404).send({ error: "not_found", message: "No such file" });
      const ext = key.slice(key.lastIndexOf(".") + 1);
      return reply
        .header("content-type", TYPES[ext] ?? "application/octet-stream")
        .header("cache-control", "public, max-age=31536000, immutable")
        .header("x-content-type-options", "nosniff")
        .header("cross-origin-resource-policy", "cross-origin")
        .send(Buffer.from(body));
    });
  };
}
