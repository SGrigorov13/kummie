import {
  CompanySettings,
  DocumentSeries,
  EMPTY_COMPANY_SETTINGS,
  NumberingList,
  NumberingRangeInput,
} from "@kummie/contracts";
import { MAX_DOC_NUMBER } from "@kummie/core";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Database } from "../db/client";
import { documentSequences, salesDocuments, settings } from "../db/schema";
import { audit, requireStaff, type AdminDeps } from "./context";

const KEY = "company";

/** Company settings, merged over the defaults so new fields appear without a data migration. */
export async function loadCompanySettings(db: Database): Promise<CompanySettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const stored = (row?.value ?? {}) as Partial<CompanySettings>;
  return CompanySettings.parse({
    ...EMPTY_COMPANY_SETTINGS,
    ...stored,
    deliveryFeesCents: { ...EMPTY_COMPANY_SETTINGS.deliveryFeesCents, ...stored.deliveryFeesCents },
  });
}

/** Both numbering series with their range and how much of it is left (D-067). */
export async function loadNumbering(db: Database): Promise<NumberingList> {
  const rows = await db.select().from(documentSequences);
  const issued = await db
    .select({ series: salesDocuments.series, n: count() })
    .from(salesDocuments)
    .groupBy(salesDocuments.series);
  return {
    items: DocumentSeries.options.map((series) => {
      const row = rows.find((r) => r.series === series);
      const docs = issued.find((i) => i.series === series)?.n ?? 0;
      const first = row?.firstNumber ?? null;
      const end = row?.endNumber ?? null;
      const next = (row?.lastNumber ?? 0) + 1;
      return {
        series,
        firstNumber: first,
        endNumber: end,
        lastIssued: docs > 0 ? (row?.lastNumber ?? null) : null,
        remaining: Math.max(0, (end ?? MAX_DOC_NUMBER) - next + 1),
        locked: docs > 0,
      };
    }),
  };
}

const ApiError = z.object({ error: z.string(), message: z.string() });

export function settingsRoutes({ db }: AdminDeps): FastifyPluginAsyncZod {
  return async (app) => {
    const onlyAdmin = requireStaff(db, ["admin"]);

    app.get(
      "/admin-api/settings/company",
      { preHandler: onlyAdmin, schema: { response: { 200: CompanySettings } } },
      async () => loadCompanySettings(db),
    );

    app.get(
      "/admin-api/settings/numbering",
      { preHandler: onlyAdmin, schema: { response: { 200: NumberingList } } },
      async () => loadNumbering(db),
    );

    app.put(
      "/admin-api/settings/numbering/:series",
      {
        preHandler: onlyAdmin,
        schema: {
          params: z.object({ series: DocumentSeries }),
          body: NumberingRangeInput,
          response: { 200: NumberingList, 409: ApiError },
        },
      },
      async (request, reply) => {
        const { series } = request.params;
        const { firstNumber, endNumber } = request.body;
        const changed = await db.transaction(async (tx) => {
          // Lock the series row (or create it) so no document is numbered while the range changes.
          await tx.insert(documentSequences).values({ series, lastNumber: 0 }).onConflictDoNothing();
          await tx.select().from(documentSequences).where(eq(documentSequences.series, series)).for("update");
          const [issued] = await tx
            .select({ n: count() })
            .from(salesDocuments)
            .where(eq(salesDocuments.series, series));
          if ((issued?.n ?? 0) > 0) return false;
          await tx
            .update(documentSequences)
            .set({ firstNumber, endNumber, lastNumber: firstNumber - 1 })
            .where(eq(documentSequences.series, series));
          return true;
        });
        if (!changed) {
          return reply.code(409).send({
            error: "range_locked",
            message: "Documents of this series exist; the range can no longer change",
          });
        }
        await audit(db, request.staff?.id ?? null, "settings.numbering_set", "settings", series, {
          firstNumber,
          endNumber,
        });
        return loadNumbering(db);
      },
    );

    app.put(
      "/admin-api/settings/company",
      { preHandler: onlyAdmin, schema: { body: CompanySettings, response: { 200: CompanySettings } } },
      async (request) => {
        const before = await loadCompanySettings(db);
        const next = request.body;
        const now = new Date();
        await db
          .insert(settings)
          .values({ key: KEY, value: next, updatedAt: now, updatedBy: request.staff?.id ?? null })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: next, updatedAt: now, updatedBy: request.staff?.id ?? null },
          });
        const changed = (Object.keys(next) as (keyof CompanySettings)[]).filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]),
        );
        await audit(db, request.staff?.id ?? null, "settings.company_updated", "settings", KEY, { changed });
        return next;
      },
    );
  };
}
