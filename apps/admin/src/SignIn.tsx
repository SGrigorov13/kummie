import { ApiRequestError, type LoginResponse, type Staff } from "@kummie/contracts";
import type { Translate } from "@kummie/i18n";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./context";

type Step = { kind: "password" } | { kind: "code"; login: LoginResponse };

/** Password, then the TOTP code — or, on the very first sign-in, 2FA enrolment with a QR code. */
export function SignIn({ t, onSignedIn }: { t: Translate; onSignedIn: (staff: Staff) => void }) {
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (step.kind === "code" && step.login.step === "enroll") {
      QRCode.toDataURL(step.login.otpauthUrl, { margin: 1, width: 220 }).then(setQr, () => setQr(""));
    }
  }, [step]);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const login = await api.login(email, password);
      setPassword("");
      setStep({ kind: "code", login });
    } catch {
      setError(t("admin.wrongCredentials"));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError("");
    try {
      const staff =
        step.login.step === "enroll"
          ? await api.enrollTotp(step.login.challenge, code)
          : await api.verifyTotp(step.login.challenge, code);
      onSignedIn(staff);
    } catch (e) {
      const expired = e instanceof ApiRequestError && e.body?.error === "invalid_challenge";
      setError(expired ? t("admin.sessionExpired") : t("admin.wrongCode"));
      if (expired) setStep({ kind: "password" });
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin__card">
      {step.kind === "password" ? (
        <form onSubmit={submitPassword} className="stack">
          <h1>{t("admin.signInTitle")}</h1>
          <label htmlFor="email">{t("admin.email")}</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">{t("admin.password")}</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn" disabled={busy}>
            {t("admin.signIn")}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="stack">
          <h1>{step.login.step === "enroll" ? t("admin.enrollTitle") : t("admin.totpTitle")}</h1>
          <p className="note">{step.login.step === "enroll" ? t("admin.enrollHint") : t("admin.totpHint")}</p>
          {step.login.step === "enroll" ? (
            <>
              {qr ? <img src={qr} width={220} height={220} alt="" className="qr" /> : null}
              <p className="note">{t("admin.enrollManual")}</p>
              <code className="secret">{step.login.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            </>
          ) : null}
          <label htmlFor="code">{t("admin.code")}</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn" disabled={busy || code.length !== 6}>
            {t("admin.confirm")}
          </button>
          <button type="button" className="link-button" onClick={() => setStep({ kind: "password" })}>
            {t("admin.back")}
          </button>
        </form>
      )}
    </div>
  );
}
