import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export type DbCheck = () => Promise<"ok" | "error" | "not_configured">;

const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["ok", "error", "not_configured"]),
  uptimeSeconds: z.number().int().nonnegative(),
  time: z.string(),
});

/** GET /health — 200 when the database answers, 503 otherwise. Used by the uptime check. */
export function healthRoutes(checkDb: DbCheck): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/health",
      { schema: { response: { 200: HealthResponse, 503: HealthResponse } } },
      async (_request, reply) => {
        const db = await checkDb();
        const body = {
          status: db === "ok" ? ("ok" as const) : ("degraded" as const),
          db,
          uptimeSeconds: Math.floor(process.uptime()),
          time: new Date().toISOString(),
        };
        return reply.code(db === "ok" ? 200 : 503).send(body);
      },
    );
  };
}
