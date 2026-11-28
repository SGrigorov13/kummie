import { ComplaintList, ComplaintResolution, IdParams, StaffComplaintInput } from "@kummie/contracts";
import { businessDay } from "@kummie/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  addStaffComplaint,
  ComplaintError,
  complaintsCsv,
  listComplaints,
  resolveComplaint,
} from "../complaints/service";
import type { ShopDeps } from "../shop/orders";
import { audit, requireStaff, type AdminDeps } from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });

/** Admin → Рекламации (D-069): the register, staff-entered complaints, outcomes. Role admin. */
export function complaintsRoutes(deps: AdminDeps & { shop: ShopDeps }): FastifyPluginAsyncZod {
  const { db, shop } = deps;
  const onlyAdmin = requireStaff(db, ["admin"]);
  const staffId = (request: { staff: { id: string } | null }) => request.staff?.id ?? null;

  return async (app) => {
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ComplaintError)
        return reply
          .code(error.code === "not_found" ? 404 : 409)
          .send({ error: error.code, message: error.message });
      throw error;
    });

    const list = async (all = false) => ({ items: await listComplaints(db, all) });

    app.get(
      "/admin-api/complaints",
      {
        preHandler: onlyAdmin,
        schema: {
          querystring: z.object({ status: z.enum(["open", "all"]).default("open") }),
          response: { 200: ComplaintList },
        },
      },
      async (request) => list(request.query.status === "all"),
    );

    app.post(
      "/admin-api/complaints",
      {
        preHandler: onlyAdmin,
        schema: { body: StaffComplaintInput, response: { 200: ComplaintList, 404: ApiError, 409: ApiError } },
      },
      async (request) => {
        const row = await addStaffComplaint(shop, request.body, staffId(request));
        await audit(db, staffId(request), "complaint.added", "complaint", row.id);
        return list();
      },
    );

    app.post(
      "/admin-api/complaints/:id/resolve",
      {
        preHandler: onlyAdmin,
        schema: {
          params: IdParams,
          body: ComplaintResolution,
          response: { 200: ComplaintList, 404: ApiError, 409: ApiError },
        },
      },
      async (request) => {
        await resolveComplaint(
          shop,
          request.params.id,
          request.body,
          `staff:${staffId(request) ?? "unknown"}`,
        );
        await audit(db, staffId(request), "complaint.closed", "complaint", request.params.id, {
          status: request.body.status,
        });
        return list();
      },
    );

    app.get("/admin-api/complaints.csv", { preHandler: onlyAdmin }, async (_request, reply) =>
      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("cache-control", "private, no-store")
        .header(
          "content-disposition",
          `attachment; filename="kummie-registar-reklamacii-${businessDay(new Date())}.csv"`,
        )
        .send(await complaintsCsv(db)),
    );
  };
}
