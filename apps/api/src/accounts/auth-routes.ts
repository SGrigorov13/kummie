import {
  Account,
  EmailRequest,
  OkResponse,
  ResetPasswordRequest,
  SignInRequest,
  SignUpRequest,
  SignUpResponse,
  TokenRequest,
} from "@kummie/contracts";
import { businessDay, checkAge } from "@kummie/core";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hashPassword, randomToken, sha256, verifyPassword } from "../auth/crypto";
import type { Database } from "../db/client";
import { consents, customers, customerSessions, customerTokens } from "../db/schema";
import { accountEmail, type AccountEmailKind } from "../email/account-emails";
import { enqueue } from "../jobs/outbox";
import { mergeGuestCart } from "../shop/cart-store";
import {
  CUSTOMER_COOKIE,
  loadAccountSettings,
  RESET_MINUTES,
  SESSION_DAYS,
  TERMS_VERSION,
  toAccount,
  VERIFY_HOURS,
  type AccountDeps,
  type CustomerRow,
} from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });
const AgeError = ApiError.extend({ minimumAge: z.number() });

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Used when the e-mail is unknown, so a wrong e-mail takes as long as a wrong password. */
let dummyHash: Promise<string> | null = null;
const equaliseTiming = async (password: string) => {
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
  await verifyPassword(await dummyHash, password);
};

export function customerAuthRoutes(deps: AccountDeps): FastifyPluginAsyncZod {
  const { db, cookieSecure } = deps;

  async function startSession(reply: FastifyReply, tx: Tx | Database, customerId: string, ua?: string) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await tx
      .insert(customerSessions)
      .values({ tokenHash: sha256(token), customerId, expiresAt, userAgent: ua?.slice(0, 300) ?? null });
    reply.setCookie(CUSTOMER_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      // Lax: the cookie survives arriving from an e-mail link; writes are JSON-only + origin-checked.
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  }

  /** Issues a single-use link token; earlier unused links of the same kind stop working. */
  async function issueToken(tx: Tx, customerId: string, purpose: "verify_email" | "reset_password") {
    const token = randomToken();
    const ms = purpose === "verify_email" ? VERIFY_HOURS * 3_600_000 : RESET_MINUTES * 60_000;
    await tx
      .update(customerTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(customerTokens.customerId, customerId),
          eq(customerTokens.purpose, purpose),
          isNull(customerTokens.usedAt),
        ),
      );
    await tx
      .insert(customerTokens)
      .values({ tokenHash: sha256(token), customerId, purpose, expiresAt: new Date(Date.now() + ms) });
    return token;
  }

  async function queueEmail(tx: Tx, kind: AccountEmailKind, row: CustomerRow, key: string, token?: string) {
    const message = accountEmail(kind, {
      to: row.email,
      name: row.name,
      locale: row.locale,
      webUrl: deps.webUrl,
      key,
      ...(token ? { token } : {}),
    });
    await enqueue(tx, "email", message as unknown as Record<string, unknown>, key);
  }

  /** Consumes a valid link token and returns its open customer, or null. */
  async function consume(tx: Tx, token: string, purpose: "verify_email" | "reset_password") {
    const [row] = await tx
      .update(customerTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(customerTokens.tokenHash, sha256(token)),
          eq(customerTokens.purpose, purpose),
          isNull(customerTokens.usedAt),
          gt(customerTokens.expiresAt, new Date()),
        ),
      )
      .returning({ customerId: customerTokens.customerId });
    if (!row) return null;
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, row.customerId), isNull(customers.deletedAt)));
    return customer ?? null;
  }

  const byEmail = async (email: string) =>
    (
      await db
        .select()
        .from(customers)
        .where(sql`lower(${customers.email}) = ${email}`)
    )[0];

  const limit = (max: number) => ({ rateLimit: { max, timeWindow: "1 minute" } });
  const invalidToken = { error: "invalid_token", message: "This link is no longer valid" } as const;

  return async (app) => {
    app.post(
      "/auth/signup",
      {
        config: limit(5),
        schema: { body: SignUpRequest, response: { 200: SignUpResponse, 422: AgeError } },
      },
      async (request, reply) => {
        const input = request.body;
        const { minimumAge } = await loadAccountSettings(db);
        const age = checkAge(input.birthDate, businessDay(new Date()), minimumAge);
        if (!age.ok) {
          return reply.code(422).send({
            error: age.reason === "too_young" ? "too_young" : "invalid_birth_date",
            message:
              age.reason === "too_young" ? `Accounts start at ${minimumAge}` : "Check the date of birth",
            minimumAge,
          });
        }
        // Hash in every branch, so the answer time does not reveal whether the e-mail exists.
        const passwordHash = await hashPassword(input.password);
        const existing = await byEmail(input.email);
        await db.transaction(async (tx) => {
          if (existing && existing.deletedAt) return;
          if (existing && existing.emailVerifiedAt) {
            // Tell the owner instead of the visitor; at most one such e-mail per hour.
            const hour = new Date().toISOString().slice(0, 13);
            await queueEmail(tx, "existing", existing, `existing:${existing.id}:${hour}`);
            return;
          }
          let row = existing;
          if (row) {
            // Not yet verified: the latest sign-up wins; only its link will work.
            [row] = await tx
              .update(customers)
              .set({
                passwordHash,
                name: input.name,
                birthDate: input.birthDate,
                locale: input.locale,
                updatedAt: new Date(),
              })
              .where(eq(customers.id, row.id))
              .returning();
          } else {
            [row] = await tx
              .insert(customers)
              .values({
                email: input.email,
                passwordHash,
                name: input.name,
                birthDate: input.birthDate,
                locale: input.locale,
              })
              .returning();
          }
          if (!row) throw new Error("customer not saved");
          await tx.insert(consents).values({
            customerId: row.id,
            kind: "terms",
            granted: true,
            source: "signup",
            version: TERMS_VERSION,
          });
          const token = await issueToken(tx, row.id, "verify_email");
          await queueEmail(tx, "verify", row, `verify:${sha256(token).slice(0, 16)}`, token);
        });
        deps.kick?.();
        return { status: "check_email" as const };
      },
    );

    app.post(
      "/auth/verify",
      { config: limit(10), schema: { body: TokenRequest, response: { 200: Account, 400: ApiError } } },
      async (request, reply) => {
        const customer = await db.transaction(async (tx) => {
          const row = await consume(tx, request.body.token, "verify_email");
          if (!row) return null;
          const [updated] = await tx
            .update(customers)
            .set({ emailVerifiedAt: row.emailVerifiedAt ?? new Date(), lastLoginAt: new Date() })
            .where(eq(customers.id, row.id))
            .returning();
          await startSession(reply, tx, row.id, request.headers["user-agent"]);
          // A guest cart started before signing in moves into the account.
          await mergeGuestCart(tx, request, reply, row.id);
          return updated ?? null;
        });
        if (!customer) return reply.code(400).send(invalidToken);
        return toAccount(customer);
      },
    );

    app.post(
      "/auth/resend",
      { config: limit(3), schema: { body: EmailRequest, response: { 200: OkResponse } } },
      async (request) => {
        const row = await byEmail(request.body.email);
        if (row && !row.deletedAt && !row.emailVerifiedAt) {
          await db.transaction(async (tx) => {
            const token = await issueToken(tx, row.id, "verify_email");
            await queueEmail(tx, "verify", row, `verify:${sha256(token).slice(0, 16)}`, token);
          });
          deps.kick?.();
        }
        return { ok: true as const };
      },
    );

    app.post(
      "/auth/signin",
      {
        config: limit(10),
        schema: { body: SignInRequest, response: { 200: Account, 401: ApiError, 403: ApiError } },
      },
      async (request, reply) => {
        const { email, password } = request.body;
        const row = await byEmail(email);
        if (!row || row.deletedAt) {
          await equaliseTiming(password);
          return reply.code(401).send({ error: "invalid_credentials", message: "Wrong e-mail or password" });
        }
        if (!(await verifyPassword(row.passwordHash, password))) {
          return reply.code(401).send({ error: "invalid_credentials", message: "Wrong e-mail or password" });
        }
        if (!row.emailVerifiedAt) {
          return reply
            .code(403)
            .send({ error: "email_not_verified", message: "Please confirm your e-mail first" });
        }
        await db.update(customers).set({ lastLoginAt: new Date() }).where(eq(customers.id, row.id));
        await startSession(reply, db, row.id, request.headers["user-agent"]);
        // A guest cart started before signing in moves into the account.
        await mergeGuestCart(db, request, reply, row.id);
        return toAccount(row);
      },
    );

    app.post("/auth/signout", { schema: { response: { 200: OkResponse } } }, async (request, reply) => {
      const token = request.cookies[CUSTOMER_COOKIE];
      if (token) await db.delete(customerSessions).where(eq(customerSessions.tokenHash, sha256(token)));
      reply.clearCookie(CUSTOMER_COOKIE, { path: "/" });
      return { ok: true as const };
    });

    app.post(
      "/auth/forgot",
      { config: limit(5), schema: { body: EmailRequest, response: { 200: OkResponse } } },
      async (request) => {
        const row = await byEmail(request.body.email);
        if (row && !row.deletedAt) {
          await db.transaction(async (tx) => {
            const token = await issueToken(tx, row.id, "reset_password");
            await queueEmail(tx, "reset", row, `reset:${sha256(token).slice(0, 16)}`, token);
          });
          deps.kick?.();
        }
        // Same answer either way: the form never reveals who has an account.
        return { ok: true as const };
      },
    );

    app.post(
      "/auth/reset",
      {
        config: limit(10),
        schema: { body: ResetPasswordRequest, response: { 200: Account, 400: ApiError } },
      },
      async (request, reply) => {
        const passwordHash = await hashPassword(request.body.password);
        const customer = await db.transaction(async (tx) => {
          const row = await consume(tx, request.body.token, "reset_password");
          if (!row) return null;
          // A new password signs out every other device.
          await tx.delete(customerSessions).where(eq(customerSessions.customerId, row.id));
          const [updated] = await tx
            .update(customers)
            .set({
              passwordHash,
              // The link arrived by e-mail, so the address is proven as well.
              emailVerifiedAt: row.emailVerifiedAt ?? new Date(),
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(customers.id, row.id))
            .returning();
          await startSession(reply, tx, row.id, request.headers["user-agent"]);
          // A guest cart started before signing in moves into the account.
          await mergeGuestCart(tx, request, reply, row.id);
          return updated ?? null;
        });
        if (!customer) return reply.code(400).send(invalidToken);
        return toAccount(customer);
      },
    );
  };
}
