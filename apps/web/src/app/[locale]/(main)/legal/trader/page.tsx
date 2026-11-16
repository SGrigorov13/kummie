import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { catalogue, tryCatalogue } from "@/lib/catalogue-server";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

// Refreshed every minute (ISR): must be a literal number for Next.js.
export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "trader") };
}

/**
 * "Данни за търговеца" (ЗЗП чл. 4, ЗЕТ чл. 4): who sells, how to reach them, the supervisory
 * authority. All data comes from Admin → Фирма — nothing is written in code (A4).
 */
export default async function TraderPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  const info = await tryCatalogue(() => catalogue.traderInfo());
  const rows: [string, string | null | undefined][] = [
    [t(locale, "trader.name"), info?.legalName],
    [t(locale, "trader.eik"), info?.eik],
    [t(locale, "trader.vat"), info?.vatNumber],
    [t(locale, "trader.address"), info?.address],
    [t(locale, "trader.email"), info?.email],
    [t(locale, "trader.phone"), info?.phone],
    [t(locale, "trader.eShop"), info?.eShopNumber],
  ];
  const complete = Boolean(info?.legalName && info.eik && info.address && info.email);

  return (
    <div className="wrap section prose">
      <h1>{t(locale, "trader")}</h1>
      {complete ? null : <p className="notice">{t(locale, "trader.pending")}</p>}
      <dl className="facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <h2 className="h3">{t(locale, "trader.authority")}</h2>
      <p>{t(locale, "trader.authorityText")}</p>
    </div>
  );
}
