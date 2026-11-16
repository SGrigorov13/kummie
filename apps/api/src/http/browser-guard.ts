import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * CSRF guard for cookie-authenticated browser APIs (accounts, cart, checkout): writes must be JSON
 * (other sites cannot send that without passing CORS) and, when the browser sends an Origin,
 * come from one of our shop origins. DELETE without a body is allowed.
 */
export function browserWriteGuard(allowedOrigins: readonly string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method === "GET" || request.method === "OPTIONS" || request.method === "HEAD") return;
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: "forbidden_origin", message: "Not allowed from this site" });
    }
    const hasBody =
      Number(request.headers["content-length"] ?? 0) > 0 || !!request.headers["transfer-encoding"];
    if (request.method === "DELETE" && !hasBody) return;
    if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
      return reply.code(415).send({ error: "unsupported_media_type", message: "Send JSON" });
    }
  };
}
