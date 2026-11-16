"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { accountApi, codeOf, commonErrorKey, detailOf, statusOf, tokenFromHash } from "@/lib/account";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";
import { Field } from "./Field";

/** Status line under a form; announced to screen readers. */
function Status({ text, kind = "info" }: { text: string | null; kind?: "info" | "error" }) {
  if (!text) return null;
  return (
    <p className="notice" role={kind === "error" ? "alert" : "status"}>
      {text}
    </p>
  );
}

function ResendLink({ email }: { email: string }) {
  const t = useT();
  const locale = useLocale();
  const [done, setDone] = useState(false);
  return done ? (
    <p className="muted" role="status">
      {t("auth.resent")}
    </p>
  ) : (
    <button
      type="button"
      className="btn btn--secondary btn--small"
      onClick={() => {
        accountApi.resendVerification(email, locale).finally(() => setDone(true));
      }}
    >
      {t("auth.resend")}
    </button>
  );
}

export function SignInView() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await accountApi.signIn(email, password);
      router.push(href(locale, "/account"));
    } catch (e) {
      const status = statusOf(e);
      if (status === 403) setUnverified(true);
      setError(
        t(status === 401 ? "auth.wrongCredentials" : status === 403 ? "auth.notVerified" : commonErrorKey(e)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate={false}>
      <Field
        id="signin-email"
        label={t("auth.email")}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        id="signin-password"
        label={t("auth.password")}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Status text={error} kind="error" />
      {unverified ? <ResendLink email={email} /> : null}
      <div className="row">
        <button type="submit" className="btn" disabled={busy}>
          {t("auth.signIn")}
        </button>
        <Link href={href(locale, "/forgot")}>{t("auth.forgot")}</Link>
      </div>
      <p>
        {t("auth.noAccount")} <Link href={href(locale, "/signup")}>{t("auth.signUp")}</Link>
      </p>
    </form>
  );
}

export function SignUpView({ today }: { today: string }) {
  const t = useT();
  const locale = useLocale();
  const [form, setForm] = useState({ name: "", email: "", password: "", birthDate: "", acceptTerms: false });
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string | boolean) => setForm({ ...form, [key]: value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.acceptTerms) return;
    setBusy(true);
    setError(null);
    try {
      await accountApi.signUp({ ...form, acceptTerms: true, locale });
      setSentTo(form.email);
    } catch (e) {
      const code = codeOf(e);
      if (code === "too_young")
        setError(t("auth.tooYoung", { age: Number(detailOf(e, "minimumAge") ?? 14) }));
      else if (code === "invalid_birth_date") setError(t("auth.invalidBirthDate"));
      else setError(t(commonErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="panel">
        <h2 className="h3">{t("auth.checkEmailTitle")}</h2>
        <p>{t("auth.checkEmail", { email: sentTo })}</p>
        <ResendLink email={sentTo} />
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <Field
        id="signup-name"
        label={t("name")}
        autoComplete="given-name"
        required
        maxLength={80}
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <Field
        id="signup-email"
        label={t("auth.email")}
        type="email"
        autoComplete="email"
        required
        value={form.email}
        onChange={(e) => set("email", e.target.value)}
      />
      <Field
        id="signup-password"
        label={t("auth.password")}
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={200}
        aria-describedby="signup-password-hint"
        value={form.password}
        onChange={(e) => set("password", e.target.value)}
      />
      <p className="muted" id="signup-password-hint">
        {t("auth.passwordHint")}
      </p>
      <Field
        id="signup-birth"
        label={t("auth.birthDate")}
        type="date"
        required
        max={today}
        aria-describedby="signup-birth-hint"
        value={form.birthDate}
        onChange={(e) => set("birthDate", e.target.value)}
      />
      <p className="muted" id="signup-birth-hint">
        {t("auth.birthDateHint")}
      </p>
      <label className="check">
        <input
          type="checkbox"
          required
          checked={form.acceptTerms}
          onChange={(e) => set("acceptTerms", e.target.checked)}
        />
        <span>
          {t("auth.acceptTerms")} <Link href={href(locale, "/legal/terms")}>{t("terms")}</Link> ·{" "}
          <Link href={href(locale, "/legal/withdrawal")}>{t("withdrawal")}</Link>
        </span>
      </label>
      <Status text={error} kind="error" />
      <div className="row">
        <button type="submit" className="btn" disabled={busy}>
          {t("auth.signUp")}
        </button>
      </div>
      <p>
        {t("auth.haveAccount")} <Link href={href(locale, "/signin")}>{t("auth.signIn")}</Link>
      </p>
    </form>
  );
}

/** Opened from the e-mail link: confirms the address and signs in. */
export function VerifyView() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = tokenFromHash();
    (token ? accountApi.verifyEmail(token) : Promise.reject(new Error("no token"))).then(
      () => {
        window.history.replaceState(null, "", window.location.pathname);
        router.replace(href(locale, "/account"));
      },
      () => setFailed(true),
    );
  }, [locale, router]);

  return failed ? (
    <>
      <Status text={t("auth.linkInvalid")} kind="error" />
      <p>
        <Link href={href(locale, "/signin")}>{t("auth.signIn")}</Link>
      </p>
    </>
  ) : (
    <p role="status">{t("auth.verifying")}</p>
  );
}

export function ForgotView() {
  const t = useT();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await accountApi.forgotPassword(email, locale);
      setSent(true);
    } catch (e) {
      setError(t(commonErrorKey(e)));
    }
  }

  if (sent) return <Status text={t("auth.forgotSent")} />;
  return (
    <form onSubmit={submit}>
      <p>{t("auth.forgotLead")}</p>
      <Field
        id="forgot-email"
        label={t("auth.email")}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Status text={error} kind="error" />
      <button type="submit" className="btn">
        {t("auth.send")}
      </button>
    </form>
  );
}

export function ResetView() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await accountApi.resetPassword(tokenFromHash(), password);
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(href(locale, "/account"));
    } catch (e) {
      const status = statusOf(e);
      if (status === 400) setInvalid(true);
      else setError(t(commonErrorKey(e)));
    }
  }

  if (invalid) {
    return (
      <>
        <Status text={t("auth.linkInvalid")} kind="error" />
        <p>
          <Link href={href(locale, "/forgot")}>{t("auth.forgot")}</Link>
        </p>
      </>
    );
  }
  return (
    <form onSubmit={submit}>
      <Field
        id="reset-password"
        label={t("auth.newPassword")}
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={200}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="muted">{t("auth.passwordHint")}</p>
      <Status text={error} kind="error" />
      <button type="submit" className="btn">
        {t("auth.resetSave")}
      </button>
    </form>
  );
}
