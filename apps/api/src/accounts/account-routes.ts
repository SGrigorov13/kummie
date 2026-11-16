import {
  Account,
  Address,
  AddressInput,
  AddressList,
  DeleteAccountRequest,
  IdParams,
  OkResponse,
  Preferences,
  ProfileUpdate,
} from "@kummie/contracts";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { verifyPassword } from "../auth/crypto";
import type { Database } from "../db/client";
import { addresses, consents, customers, customerSessions, customerTokens } from "../db/schema";
import { accountEmail } from "../email/account-emails";
import { enqueue } from "../jobs/outbox";
import { CUSTOMER_COOKIE, requireCustomer, toAccount, type AccountDeps, type CustomerRow } from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });
const MAX_ADDRESSES = 10;

type ConsentKind = typeof consents.$inferInsert.kind;
const PREF_KINDS = {
  comebacks: "notify_comebacks",
  restocks: "notify_restocks",
  orderStatus: "notify_order_status",
  clubDrops: "notify_club_drops",
} as const satisfies Record<keyof Preferences["notifications"], ConsentKind>;

/** Current choices = the latest consent row per kind; anything never given is "off". */
export async function loadPreferences(db: Database, customer: CustomerRow): Promise<Preferences> {
  const rows = await db
    .selectDistinctOn([consents.kind], { kind: consents.kind, granted: consents.granted })
    .from(consents)
    .where(eq(consents.customerId, customer.id))
    .orderBy(consents.kind, desc(consents.at));
  const granted = (kind: ConsentKind) => rows.find((r) => r.kind === kind)?.granted ?? false;
  return {
    notifications: {
      comebacks: granted("notify_comebacks"),
      restocks: granted("notify_restocks"),
      orderStatus: granted("notify_order_status"),
      clubDrops: granted("notify_club_drops"),
    },
    personalisedAds: !toAccount(customer).minor && granted("personalised_ads"),
  };
}

const toAddress = (row: typeof addresses.$inferSelect): Address => ({
  id: row.id,
  name: row.name,
  line1: row.line1,
  line2: row.line2,
  city: row.city,
  postcode: row.postcode,
  country: row.country,
  phone: row.phone,
  isDefault: row.isDefault,
});

export function accountRoutes(deps: AccountDeps): FastifyPluginAsyncZod {
  const { db } = deps;
  const me = (request: { customer: CustomerRow | null }) => request.customer as CustomerRow;

  return async (app) => {
    app.addHook("preHandler", requireCustomer(db));

    app.get("/account/me", { schema: { response: { 200: Account } } }, async (request) =>
      toAccount(me(request)),
    );

    app.put(
      "/account/profile",
      { schema: { body: ProfileUpdate, response: { 200: Account } } },
      async (request) => {
        const [row] = await db
          .update(customers)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(customers.id, me(request).id))
          .returning();
        return toAccount(row as CustomerRow);
      },
    );

    // ---- Addresses ----

    const listAddresses = async (customerId: string) =>
      (
        await db
          .select()
          .from(addresses)
          .where(eq(addresses.customerId, customerId))
          .orderBy(desc(addresses.isDefault), asc(addresses.createdAt))
      ).map(toAddress);

    app.get("/account/addresses", { schema: { response: { 200: AddressList } } }, async (request) => ({
      items: await listAddresses(me(request).id),
    }));

    app.post(
      "/account/addresses",
      { schema: { body: AddressInput, response: { 200: Address, 409: ApiError } } },
      async (request, reply) => {
        const customerId = me(request).id;
        const existing = await listAddresses(customerId);
        if (existing.length >= MAX_ADDRESSES) {
          return reply.code(409).send({ error: "too_many_addresses", message: `At most ${MAX_ADDRESSES}` });
        }
        const isDefault = request.body.isDefault || existing.length === 0;
        const row = await db.transaction(async (tx) => {
          if (isDefault)
            await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customerId));
          const [inserted] = await tx
            .insert(addresses)
            .values({ ...request.body, isDefault, customerId })
            .returning();
          return inserted;
        });
        return toAddress(row as typeof addresses.$inferSelect);
      },
    );

    app.put(
      "/account/addresses/:id",
      { schema: { params: IdParams, body: AddressInput, response: { 200: Address, 404: ApiError } } },
      async (request, reply) => {
        const customerId = me(request).id;
        const row = await db.transaction(async (tx) => {
          if (request.body.isDefault) {
            await tx
              .update(addresses)
              .set({ isDefault: false })
              .where(and(eq(addresses.customerId, customerId), ne(addresses.id, request.params.id)));
          }
          const [updated] = await tx
            .update(addresses)
            .set({ ...request.body, updatedAt: new Date() })
            .where(and(eq(addresses.id, request.params.id), eq(addresses.customerId, customerId)))
            .returning();
          return updated;
        });
        if (!row) return reply.code(404).send({ error: "not_found", message: "No such address" });
        return toAddress(row);
      },
    );

    app.delete(
      "/account/addresses/:id",
      { schema: { params: IdParams, response: { 200: OkResponse, 404: ApiError } } },
      async (request, reply) => {
        const customerId = me(request).id;
        const [removed] = await db
          .delete(addresses)
          .where(and(eq(addresses.id, request.params.id), eq(addresses.customerId, customerId)))
          .returning();
        if (!removed) return reply.code(404).send({ error: "not_found", message: "No such address" });
        if (removed.isDefault) {
          // Keep one default when others remain.
          const [next] = await db
            .select({ id: addresses.id })
            .from(addresses)
            .where(eq(addresses.customerId, customerId))
            .orderBy(asc(addresses.createdAt))
            .limit(1);
          if (next) await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
        }
        return { ok: true as const };
      },
    );

    // ---- Notification opt-ins and advertising consent ----

    app.get("/account/preferences", { schema: { response: { 200: Preferences } } }, async (request) =>
      loadPreferences(db, me(request)),
    );

    app.put(
      "/account/preferences",
      { schema: { body: Preferences, response: { 200: Preferences, 422: ApiError } } },
      async (request, reply) => {
        const customer = me(request);
        if (request.body.personalisedAds && toAccount(customer).minor) {
          return reply
            .code(422)
            .send({ error: "minor_restricted", message: "Not available for accounts under 18" });
        }
        const current = await loadPreferences(db, customer);
        const changes: { kind: ConsentKind; granted: boolean }[] = [];
        for (const [key, kind] of Object.entries(PREF_KINDS) as [keyof typeof PREF_KINDS, ConsentKind][]) {
          if (current.notifications[key] !== request.body.notifications[key]) {
            changes.push({ kind, granted: request.body.notifications[key] });
          }
        }
        if (current.personalisedAds !== request.body.personalisedAds) {
          changes.push({ kind: "personalised_ads", granted: request.body.personalisedAds });
        }
        if (changes.length > 0) {
          await db
            .insert(consents)
            .values(changes.map((c) => ({ ...c, customerId: customer.id, source: "account" })));
        }
        return loadPreferences(db, customer);
      },
    );

    // ---- GDPR: export and deletion ----

    app.get("/account/export", async (request, reply) => {
      const customer = me(request);
      const [addressRows, consentRows, sessionRows] = await Promise.all([
        listAddresses(customer.id),
        db
          .select({
            kind: consents.kind,
            granted: consents.granted,
            source: consents.source,
            version: consents.version,
            at: consents.at,
          })
          .from(consents)
          .where(eq(consents.customerId, customer.id))
          .orderBy(asc(consents.at)),
        db
          .select({
            createdAt: customerSessions.createdAt,
            expiresAt: customerSessions.expiresAt,
            userAgent: customerSessions.userAgent,
          })
          .from(customerSessions)
          .where(eq(customerSessions.customerId, customer.id)),
      ]);
      reply.header("content-disposition", 'attachment; filename="kummie-my-data.json"');
      return {
        exportedAt: new Date().toISOString(),
        account: {
          ...toAccount(customer),
          emailVerifiedAt: customer.emailVerifiedAt?.toISOString() ?? null,
          lastLoginAt: customer.lastLoginAt?.toISOString() ?? null,
        },
        addresses: addressRows,
        consents: consentRows,
        sessions: sessionRows,
        orders: [],
        kummies: [],
      };
    });

    app.post(
      "/account/delete",
      {
        config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
        schema: { body: DeleteAccountRequest, response: { 200: OkResponse, 401: ApiError } },
      },
      async (request, reply) => {
        const customer = me(request);
        if (!(await verifyPassword(customer.passwordHash, request.body.password))) {
          return reply.code(401).send({ error: "invalid_credentials", message: "Wrong password" });
        }
        await db.transaction(async (tx) => {
          await tx.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, customer.id));
          await tx.delete(customerSessions).where(eq(customerSessions.customerId, customer.id));
          await tx.delete(customerTokens).where(eq(customerTokens.customerId, customer.id));
          const key = `deleted:${customer.id}`;
          const message = accountEmail("deleted", {
            to: customer.email,
            name: customer.name,
            locale: customer.locale,
            webUrl: deps.webUrl,
            key,
          });
          await enqueue(tx, "email", message as unknown as Record<string, unknown>, key);
          await enqueue(tx, "account_erasure", { customerId: customer.id }, `erase:${customer.id}`);
        });
        reply.clearCookie(CUSTOMER_COOKIE, { path: "/" });
        deps.kick?.();
        return { ok: true as const };
      },
    );
  };
}
