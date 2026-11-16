import { CompanySettings, EMPTY_COMPANY_SETTINGS } from "@kummie/contracts";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Database } from "../db/client";
import { settings } from "../db/schema";
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

export function settingsRoutes({ db }: AdminDeps): FastifyPluginAsyncZod {
  return async (app) => {
    const onlyAdmin = requireStaff(db, ["admin"]);

    app.get(
      "/admin-api/settings/company",
      { preHandler: onlyAdmin, schema: { response: { 200: CompanySettings } } },
      async () => loadCompanySettings(db),
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
