import { businessDay, DEFAULT_MINIMUM_AGE, isMinor } from "@kummie/core";
import type { Account } from "@kummie/contracts";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { EmailAdapter } from "../adapters/email";
import { sha256 } from "../auth/crypto";
import type { Database } from "../db/client";
import { customers, customerSessions, settings } from "../db/schema";

export const CUSTOMER_COOKIE = "kummie_session";
export const SESSION_DAYS = 30;
export const VERIFY_HOURS = 24;
export const RESET_MINUTES = 60;
/** Version of the terms accepted at sign-up; the final legal texts arrive in M6. */
export const TERMS_VERSION = "draft-m1";

export type AccountDeps = {
  db: Database;
  email: EmailAdapter;
  /** Public shop address for links in e-mails, e.g. https://kummie.eu. */
  webUrl: string;
  /** Shop origins allowed to call the account API with cookies. */
  allowedOrigins: string[];
  cookieSecure: boolean;
  /** Runs queued jobs right away (best effort); the tick cron retries whatever is left. */
  kick?: () => void;
};

export type CustomerRow = typeof customers.$inferSelect;

declare module "fastify" {
  interface FastifyRequest {
    customer: CustomerRow | null;
  }
}

export function toAccount(row: CustomerRow, now = new Date()): Account {
  const birthDate = row.birthDate ?? "1900-01-01";
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    birthDate,
    minor: isMinor(birthDate, businessDay(now)),
    createdAt: row.createdAt.toISOString(),
  };
}

/** The customer behind the session cookie (open, verified accounts only), or null. */
export async function customerFromRequest(
  db: Database,
  request: FastifyRequest,
): Promise<CustomerRow | null> {
  const token = request.cookies[CUSTOMER_COOKIE];
  if (!token) return null;
  const [row] = await db
    .select({ customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(
      and(
        eq(customerSessions.tokenHash, sha256(token)),
        gt(customerSessions.expiresAt, new Date()),
        isNull(customers.deletedAt),
      ),
    );
  return row?.customer ?? null;
}

/** preHandler for /account/*: 401 without a valid session. */
export function requireCustomer(db: Database) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const customer = await customerFromRequest(db, request);
    if (!customer) return reply.code(401).send({ error: "unauthorized", message: "Please sign in" });
    request.customer = customer;
  };
}

/** Account rules the owner can change without a release (A2: minimum age pending a lawyer). */
export async function loadAccountSettings(db: Database): Promise<{ minimumAge: number }> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "accounts"));
  const value = (row?.value ?? {}) as { minimumAge?: unknown };
  const minimumAge =
    typeof value.minimumAge === "number" && value.minimumAge >= 13 && value.minimumAge <= 18
      ? value.minimumAge
      : DEFAULT_MINIMUM_AGE;
  return { minimumAge };
}
