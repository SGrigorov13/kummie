"use client";

import { useDemoStore } from "@/lib/demo-store";
import { useT } from "@/lib/locale";

/**
 * Consent first: nothing non-essential runs in M0, so the only choice is "essential only".
 * When analytics arrive (M6) they load only after an explicit opt-in added here.
 */
export function CookieBanner() {
  const t = useT();
  const { state, hydrated, acceptEssentialCookies } = useDemoStore();
  if (!hydrated || state.cookies !== "unknown") return null;
  return (
    <section className="cookie" aria-labelledby="cookie-title">
      <h2 id="cookie-title" className="cookie__title">
        {t("cookieTitle")}
      </h2>
      <p>{t("cookie")}</p>
      <button type="button" className="btn" onClick={acceptEssentialCookies}>
        {t("cookieOk")}
      </button>
    </section>
  );
}
