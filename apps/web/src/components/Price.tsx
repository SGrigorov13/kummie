import { formatBgn, formatMoney, SHOW_BGN, type Locale } from "@kummie/core";
import { t } from "@kummie/i18n";

/**
 * Consumer price incl. VAT — the same in every country (D-025), so it needs no client state and
 * renders identically on the server and in the browser.
 */
export function Price({
  cents,
  locale,
  qty = 1,
  large = false,
}: {
  cents: number;
  locale: Locale;
  qty?: number;
  large?: boolean;
}) {
  const amount = cents * qty;
  return (
    <p className={large ? "price price--large" : "price"}>
      <strong>{formatMoney(amount, locale)}</strong>
      <span>
        {SHOW_BGN ? `${formatBgn(amount, locale)} · ` : ""}
        {t(locale, "vat")}
      </span>
    </p>
  );
}
