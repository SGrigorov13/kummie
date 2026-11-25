import { LegalApproval, NapUpdateInput, SalesReadiness, SalesSwitch } from "@kummie/contracts";
import { businessDay } from "@kummie/core";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { audit, requireStaff, type AdminDeps } from "./context";
import {
  loadSalesReadiness,
  readLegalApproved,
  readNapUpdates,
  writeLegalApproved,
  writeNapUpdates,
  writeSalesState,
  type RuntimeInfo,
} from "./golive";

const ApiError = z.object({ error: z.string(), message: z.string() });

/**
 * Admin → Готовност за продажби (admin only): the conditions, the sales switch (on only when all are
 * green, off at any time), lawyer approval of the legal pages and the Приложение № 33 reminders.
 */
export function salesRoutes(deps: AdminDeps & { runtime: RuntimeInfo }): FastifyPluginAsyncZod {
  const { db, runtime } = deps;
  const onlyAdmin = requireStaff(db, ["admin"]);
  const current = () => loadSalesReadiness(db, runtime);

  return async (app) => {
    app.get(
      "/admin-api/sales",
      { preHandler: onlyAdmin, schema: { response: { 200: SalesReadiness } } },
      current,
    );

    app.put(
      "/admin-api/sales",
      {
        preHandler: onlyAdmin,
        schema: { body: SalesSwitch, response: { 200: SalesReadiness, 409: ApiError } },
      },
      async (request, reply) => {
        const before = await current();
        if (request.body.enabled && !before.canEnable) {
          return reply
            .code(409)
            .send({ error: "not_ready", message: "Not every go-live condition is green" });
        }
        const staffId = request.staff?.id ?? null;
        await writeSalesState(
          db,
          { enabled: request.body.enabled, changedAt: new Date().toISOString(), changedBy: staffId },
          staffId,
        );
        await audit(
          db,
          staffId,
          request.body.enabled ? "sales.enabled" : "sales.disabled",
          "settings",
          "sales",
        );
        return current();
      },
    );

    app.put(
      "/admin-api/sales/legal",
      { preHandler: onlyAdmin, schema: { body: LegalApproval, response: { 200: SalesReadiness } } },
      async (request) => {
        const staffId = request.staff?.id ?? null;
        const legal = await readLegalApproved(db);
        legal[request.body.page] = request.body.approved ? businessDay(new Date()) : null;
        await writeLegalApproved(db, legal, staffId);
        await audit(db, staffId, "legal.approval", "settings", request.body.page, {
          approved: request.body.approved,
        });
        return current();
      },
    );

    app.post(
      "/admin-api/sales/nap-updates",
      { preHandler: onlyAdmin, schema: { body: NapUpdateInput, response: { 200: SalesReadiness } } },
      async (request) => {
        const staffId = request.staff?.id ?? null;
        const list = await readNapUpdates(db);
        list.push({ id: randomUUID(), ...request.body, submittedOn: null });
        await writeNapUpdates(db, list, staffId);
        await audit(db, staffId, "nap_update.recorded", "settings", "nap_updates", {
          kind: request.body.kind,
        });
        return current();
      },
    );

    app.post(
      "/admin-api/sales/nap-updates/:id/submitted",
      {
        preHandler: onlyAdmin,
        schema: {
          params: z.object({ id: z.string().min(1).max(100) }),
          response: { 200: SalesReadiness, 404: ApiError },
        },
      },
      async (request, reply) => {
        const staffId = request.staff?.id ?? null;
        const list = await readNapUpdates(db);
        const item = list.find((u) => u.id === request.params.id);
        if (!item) return reply.code(404).send({ error: "not_found", message: "No such reminder" });
        item.submittedOn = businessDay(new Date());
        await writeNapUpdates(db, list, staffId);
        await audit(db, staffId, "nap_update.submitted", "settings", item.id);
        return current();
      },
    );
  };
}
