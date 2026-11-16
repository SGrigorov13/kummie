import { resolve } from "node:path";
import { addDays, businessDay } from "@kummie/core";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailAdapter, EmailMessage } from "../adapters/email";
import { buildApp } from "../app";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { addresses, customers, jobs } from "../db/schema";
import { processDueJobs } from "../jobs/outbox";
import { accountJobHandlers } from "./erasure";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const PASSWORD = "a long test-only password";
const today = businessDay(new Date());
const yearsAgo = (years: number) => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;

describe.skipIf(!safe)("customer accounts on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  const outbox: EmailMessage[] = [];
  const email: EmailAdapter = {
    name: "memory",
    send: async (message) => {
      outbox.push(message);
      return { messageId: String(outbox.length), accepted: true };
    },
  };
  let ip = 0;

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    app = buildApp({
      logger: false,
      checkDb: async () => "ok",
      accounts: { db: handle.db, email, webUrl: WEB, allowedOrigins: [WEB], cookieSecure: false },
    });
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  /** Each call comes from its own IP, so the per-IP rate limits do not interfere between tests. */
  const call = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    payload?: unknown,
    cookie?: string,
  ) =>
    app.inject({
      method,
      url: path,
      remoteAddress: `10.0.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin: WEB, ...(cookie ? { cookie } : {}) },
    });
  const sessionOf = (response: Awaited<ReturnType<typeof call>>) => {
    const c = response.cookies.find((x) => x.name === "kummie_session");
    return c ? `kummie_session=${c.value}` : "";
  };
  const deliver = async () => {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  };
  const tokenIn = (message: EmailMessage | undefined) =>
    /#t=([A-Za-z0-9_-]+)/.exec(message?.text ?? "")?.[1] ?? "";

  async function newAccount(address: string, birthDate = yearsAgo(30)) {
    const signup = await call("POST", "/auth/signup", {
      email: address,
      password: PASSWORD,
      name: "Test Customer",
      birthDate,
      locale: "bg",
      acceptTerms: true,
    });
    expect(signup.statusCode).toBe(200);
    const [mail] = await deliver();
    const verified = await call("POST", "/auth/verify", { token: tokenIn(mail) });
    expect(verified.statusCode).toBe(200);
    return sessionOf(verified);
  }

  it("applies the age gate (default minimum 14) before anything else", async () => {
    const base = {
      email: "kid@kummie.test",
      password: PASSWORD,
      name: "Kid",
      locale: "bg",
      acceptTerms: true,
    };
    const young = await call("POST", "/auth/signup", { ...base, birthDate: addDays(yearsAgo(14), 1) });
    expect(young.statusCode).toBe(422);
    expect(young.json()).toMatchObject({ error: "too_young", minimumAge: 14 });
    const future = await call("POST", "/auth/signup", { ...base, birthDate: addDays(today, 3) });
    expect(future.json()).toMatchObject({ error: "invalid_birth_date" });
    expect(await handle.db.select().from(customers)).toHaveLength(0);
  });

  it("signs up, refuses sign-in until the e-mail is confirmed, then signs in by the link", async () => {
    const signup = await call("POST", "/auth/signup", {
      email: "Maria@Kummie.test",
      password: PASSWORD,
      name: "Мария",
      birthDate: yearsAgo(25),
      locale: "bg",
      acceptTerms: true,
    });
    expect(signup.json()).toEqual({ status: "check_email" });
    expect(sessionOf(signup)).toBe("");

    const early = await call("POST", "/auth/signin", { email: "maria@kummie.test", password: PASSWORD });
    expect(early.statusCode).toBe(403);
    expect(early.json().error).toBe("email_not_verified");

    const [mail] = await deliver();
    expect(mail?.to).toBe("maria@kummie.test");
    expect(mail?.subject).toBe("Потвърди имейла си в KUMMIE");
    expect(mail?.text).toContain(`${WEB}/bg/verify#t=`);

    const verified = await call("POST", "/auth/verify", { token: tokenIn(mail) });
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({ email: "maria@kummie.test", name: "Мария", minor: false });
    const again = await call("POST", "/auth/verify", { token: tokenIn(mail) });
    expect(again.statusCode).toBe(400);

    const me = await call("GET", "/account/me", undefined, sessionOf(verified));
    expect(me.statusCode).toBe(200);
  });

  it("never reveals an existing account at sign-up; the owner gets a note instead", async () => {
    const signup = await call("POST", "/auth/signup", {
      email: "maria@kummie.test",
      password: "someone else typing here",
      name: "Someone",
      birthDate: yearsAgo(40),
      locale: "en",
      acceptTerms: true,
    });
    expect(signup.json()).toEqual({ status: "check_email" });
    const [mail] = await deliver();
    expect(mail?.subject).toBe("Опит за регистрация с твоя имейл");
    const signin = await call("POST", "/auth/signin", { email: "maria@kummie.test", password: PASSWORD });
    expect(signin.statusCode).toBe(200);
  });

  it("rejects wrong passwords, foreign origins and non-JSON writes", async () => {
    const wrong = await call("POST", "/auth/signin", {
      email: "maria@kummie.test",
      password: "wrong password!",
    });
    expect(wrong.statusCode).toBe(401);
    const unknown = await call("POST", "/auth/signin", { email: "nobody@kummie.test", password: PASSWORD });
    expect(unknown.json()).toEqual(wrong.json());

    const foreign = await app.inject({
      method: "POST",
      url: "/auth/signin",
      payload: { email: "maria@kummie.test", password: PASSWORD },
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.statusCode).toBe(403);
    const form = await app.inject({
      method: "POST",
      url: "/auth/signin",
      payload: "email=maria@kummie.test",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: WEB },
    });
    expect(form.statusCode).toBe(415);
  });

  it("keeps exactly one default address and hides addresses from other customers", async () => {
    const cookie = await newAccount("addr@kummie.test");
    const other = await newAccount("other@kummie.test");
    const input = {
      name: "Иван Иванов",
      line1: "ул. Шипка 1",
      line2: null,
      city: "София",
      postcode: "1000",
      country: "BG",
      phone: "+359 888 123 456",
      isDefault: false,
    };
    const first = (await call("POST", "/account/addresses", input, cookie)).json();
    expect(first.isDefault).toBe(true);
    const second = (
      await call("POST", "/account/addresses", { ...input, city: "Пловдив", isDefault: true }, cookie)
    ).json();
    let list = (await call("GET", "/account/addresses", undefined, cookie)).json().items;
    expect(list.map((a: { id: string; isDefault: boolean }) => [a.id, a.isDefault])).toEqual([
      [second.id, true],
      [first.id, false],
    ]);

    expect((await call("DELETE", `/account/addresses/${second.id}`, undefined, other)).statusCode).toBe(404);
    expect((await call("DELETE", `/account/addresses/${second.id}`, undefined, cookie)).statusCode).toBe(200);
    list = (await call("GET", "/account/addresses", undefined, cookie)).json().items;
    expect(list).toEqual([expect.objectContaining({ id: first.id, isDefault: true })]);
  });

  it("stores the four opt-ins as consent history and keeps ads off for minors", async () => {
    const adult = await newAccount("prefs@kummie.test");
    const initial = (await call("GET", "/account/preferences", undefined, adult)).json();
    expect(initial).toEqual({
      notifications: { comebacks: false, restocks: false, orderStatus: false, clubDrops: false },
      personalisedAds: false,
    });
    const saved = await call(
      "PUT",
      "/account/preferences",
      {
        notifications: { comebacks: true, restocks: false, orderStatus: true, clubDrops: false },
        personalisedAds: true,
      },
      adult,
    );
    expect(saved.json()).toMatchObject({
      notifications: { comebacks: true, orderStatus: true },
      personalisedAds: true,
    });

    const minor = await newAccount("teen@kummie.test", yearsAgo(15));
    expect((await call("GET", "/account/me", undefined, minor)).json().minor).toBe(true);
    const ads = await call(
      "PUT",
      "/account/preferences",
      {
        notifications: { comebacks: true, restocks: true, orderStatus: true, clubDrops: true },
        personalisedAds: true,
      },
      minor,
    );
    expect(ads.statusCode).toBe(422);
    expect(ads.json().error).toBe("minor_restricted");
  });

  it("resets the password by a single-use link and signs out other devices", async () => {
    const oldSession = await newAccount("reset@kummie.test");
    expect((await call("POST", "/auth/forgot", { email: "nobody@kummie.test" })).json()).toEqual({
      ok: true,
    });
    expect(await deliver()).toHaveLength(0);

    await call("POST", "/auth/forgot", { email: "reset@kummie.test" });
    const [mail] = await deliver();
    expect(mail?.text).toContain(`${WEB}/bg/reset#t=`);
    const reset = await call("POST", "/auth/reset", {
      token: tokenIn(mail),
      password: "a brand new password",
    });
    expect(reset.statusCode).toBe(200);
    expect((await call("GET", "/account/me", undefined, oldSession)).statusCode).toBe(401);
    expect((await call("GET", "/account/me", undefined, sessionOf(reset))).statusCode).toBe(200);
    expect(
      (await call("POST", "/auth/reset", { token: tokenIn(mail), password: "another new password" }))
        .statusCode,
    ).toBe(400);
    const signin = await call("POST", "/auth/signin", {
      email: "reset@kummie.test",
      password: "a brand new password",
    });
    expect(signin.statusCode).toBe(200);
  });

  it("exports the data, then closes the account and erases it in the background", async () => {
    const cookie = await newAccount("gone@kummie.test");
    await call(
      "POST",
      "/account/addresses",
      {
        name: "Gone",
        line1: "Str 1",
        line2: null,
        city: "Athens",
        postcode: "10431",
        country: "GR",
        phone: "+30 210 1234567",
        isDefault: true,
      },
      cookie,
    );
    const exported = await call("GET", "/account/export", undefined, cookie);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.json()).toMatchObject({
      account: { email: "gone@kummie.test" },
      addresses: [{ city: "Athens" }],
    });
    expect(exported.json().consents).toEqual([expect.objectContaining({ kind: "terms", granted: true })]);

    expect((await call("POST", "/account/delete", { password: "not my password" }, cookie)).statusCode).toBe(
      401,
    );
    expect((await call("POST", "/account/delete", { password: PASSWORD }, cookie)).statusCode).toBe(200);
    expect((await call("GET", "/account/me", undefined, cookie)).statusCode).toBe(401);
    expect(
      (await call("POST", "/auth/signin", { email: "gone@kummie.test", password: PASSWORD })).statusCode,
    ).toBe(401);

    const sent = await deliver();
    expect(sent.map((m) => m.subject)).toContain("Профилът ти в KUMMIE е закрит");
    const [row] = await handle.db
      .select()
      .from(customers)
      .where(sql`${customers.erasedAt} is not null`);
    expect(row?.email).toMatch(/^erased-.+@invalid\.kummie$/);
    expect(row?.name).toBe("");
    expect(row?.birthDate).toBeNull();
    expect(
      await handle.db
        .select()
        .from(addresses)
        .where(eq(addresses.customerId, row?.id ?? "")),
    ).toHaveLength(0);
    // Finished jobs keep no personal data.
    const leftovers = await handle.db
      .select()
      .from(jobs)
      .where(sql`${jobs.payload}::text like '%gone@kummie.test%'`);
    expect(leftovers).toHaveLength(0);
  });
});
