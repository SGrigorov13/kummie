"use client";

import { formatBgn, formatMoney, SHOW_BGN, unitGrossCents } from "@kummie/core";
import { useDemoStore } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";

/** Gross price for the shopper's delivery country, always labelled "incl. VAT". */
export function Price({
  exVatCents,
  qty = 1,
  large = false,
}: {
  exVatCents: number;
  qty?: number;
  large?: boolean;
}) {
  const locale = useLocale();
  const t = useT();
  const { state } = useDemoStore();
  const gross = unitGrossCents(exVatCents, state.country) * qty;
  return (
    <p className={large ? "price price--large" : "price"}>
      <strong>{formatMoney(gross, locale)}</strong>
      <span>
        {SHOW_BGN ? `${formatBgn(gross, locale)} · ` : ""}
        {t("vat")}
      </span>
    </p>
  );
}
