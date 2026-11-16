import { LoginRequest, LoginResponse, OkResponse, Staff, TotpRequest } from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hashPassword, randomToken, sha256, verifyPassword } from "../auth/crypto";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../auth/totp";
import { staffSessions, staffUsers } from "../db/schema";
import { audit, SESSION_HOURS, STAFF_COOKIE, staffFromRequest, type AdminDeps } from "./context";

const CHALLENGE_MINUTES = 5;
const ApiError = z.object({ error: z.string(), message: z.string() });

type Challenge = { sid: string; kind: "totp" | "enroll"; secret?: string; exp: number };

/** Used when the e-mail is unknown, so a wrong e-mail takes as long as a wrong password. */
let dummyHash: Promise<string> | null = null;

export function authRoutes({ db, secretBox, cookieSecure }: AdminDeps): FastifyPluginAsyncZod {
  const seal = (c: Challenge) => secretBox.seal(JSON.stringify(c));
  const open = (token: string, kind: Challenge["kind"]): Challenge | null => {
    try {
      const c = JSON.parse(secretBox.open(token)) as Challenge;
      return c.kind === kind && c.exp > Date.now() ? c : null;
    } catch {
      return null;
    }
  };

  async function startSession(reply: FastifyReply, staffId: string, userAgent: string | undefined) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
    await db
      .insert(staffSessions)
      .values({ tokenHash: sha256(token), staffId, expiresAt, userAgent: userAgent ?? null });
    reply.setCookie(STAFF_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      path: "/",
      expires: expiresAt,
    });
  }

  const loginLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  return async (app) => {
    app.post(
      "/admin-api/auth/login",
      { config: loginLimit, schema: { body: LoginRequest, response: { 200: LoginResponse, 401: ApiError } } },
      async (request, reply) => {
        const { email, password } = request.body;
        const [staff] = await db
          .select()
          .from(staffUsers)
          .where(sql`lower(${staffUsers.email}) = ${email}`);
        if (!staff || !staff.active) {
          dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
          await verifyPassword(await dummyHash, password);
          return reply.code(401).send({ error: "invalid_credentials", message: "Wrong e-mail or password" });
        }
        if (!(await verifyPassword(staff.passwordHash, password))) {
          await audit(db, staff.id, "staff.login_failed", "staff", staff.id);
          return reply.code(401).send({ error: "invalid_credentials", message: "Wrong e-mail or password" });
        }
        const exp = Date.now() + CHALLENGE_MINUTES * 60_000;
        if (staff.totpEnabled && staff.totpSecretEnc) {
          return { step: "totp" as const, challenge: seal({ sid: staff.id, kind: "totp", exp }) };
        }
        // First login: 2FA is mandatory, so the account must enrol before any session exists.
        const secret = generateTotpSecret();
        return {
          step: "enroll" as const,
          challenge: seal({ sid: staff.id, kind: "enroll", secret, exp }),
          secret,
          otpauthUrl: otpauthUrl(secret, staff.email),
        };
      },
    );

    app.post(
      "/admin-api/auth/totp",
      { config: loginLimit, schema: { body: TotpRequest, response: { 200: Staff, 401: ApiError } } },
      async (request, reply) => {
        const challenge = open(request.body.challenge, "totp");
        const [staff] = challenge
          ? await db.select().from(staffUsers).where(eq(staffUsers.id, challenge.sid))
          : [];
        if (!challenge || !staff?.active || !staff.totpSecretEnc) {
          return reply.code(401).send({ error: "invalid_challenge", message: "Please sign in again" });
        }
        const step = verifyTotp(
          secretBox.open(staff.totpSecretEnc),
          request.body.code,
          new Date(),
          staff.totpLastStep,
        );
        if (step === null) {
          await audit(db, staff.id, "staff.totp_failed", "staff", staff.id);
          return reply.code(401).send({ error: "invalid_code", message: "Wrong or expired code" });
        }
        await db
          .update(staffUsers)
          .set({ totpLastStep: step, lastLoginAt: new Date() })
          .where(eq(staffUsers.id, staff.id));
        await startSession(reply, staff.id, request.headers["user-agent"]);
        await audit(db, staff.id, "staff.login", "staff", staff.id);
        return { id: staff.id, email: staff.email, name: staff.name, role: staff.role };
      },
    );

    app.post(
      "/admin-api/auth/enroll",
      { config: loginLimit, schema: { body: TotpRequest, response: { 200: Staff, 401: ApiError } } },
      async (request, reply) => {
        const challenge = open(request.body.challenge, "enroll");
        const [staff] = challenge
          ? await db.select().from(staffUsers).where(eq(staffUsers.id, challenge.sid))
          : [];
        if (!challenge?.secret || !staff?.active || staff.totpEnabled) {
          return reply.code(401).send({ error: "invalid_challenge", message: "Please sign in again" });
        }
        const step = verifyTotp(challenge.secret, request.body.code);
        if (step === null) {
          return reply.code(401).send({ error: "invalid_code", message: "Wrong or expired code" });
        }
        await db
          .update(staffUsers)
          .set({
            totpSecretEnc: secretBox.seal(challenge.secret),
            totpEnabled: true,
            totpLastStep: step,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(staffUsers.id, staff.id));
        await startSession(reply, staff.id, request.headers["user-agent"]);
        await audit(db, staff.id, "staff.totp_enrolled", "staff", staff.id);
        return { id: staff.id, email: staff.email, name: staff.name, role: staff.role };
      },
    );

    app.post(
      "/admin-api/auth/logout",
      { schema: { response: { 200: OkResponse } } },
      async (request, reply) => {
        const token = request.cookies[STAFF_COOKIE];
        if (token) await db.delete(staffSessions).where(eq(staffSessions.tokenHash, sha256(token)));
        reply.clearCookie(STAFF_COOKIE, { path: "/" });
        return { ok: true as const };
      },
    );

    app.get(
      "/admin-api/me",
      { schema: { response: { 200: Staff, 401: ApiError } } },
      async (request, reply) => {
        const staff = await staffFromRequest(db, request);
        if (!staff) return reply.code(401).send({ error: "unauthorized", message: "Please sign in" });
        return staff;
      },
    );
  };
}
