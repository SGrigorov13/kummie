import { formatMoney } from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { catalogue, tryCatalogue } from "@/lib/catalogue-server";
import { href, localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

// Refreshed every minute (ISR): must be a literal number for Next.js.
export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "deliveryPage") };
}

/**
 * "Плащане и доставка": payment methods, delivery countries and fees (from Admin → Фирма, A5),
 * free delivery threshold (D-026), delivery times and the "no customs" promise — before any purchase.
 */
export default async function DeliveryPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  const info = await tryCatalogue(() => catalogue.traderInfo());

  return (
    <div className="wrap section prose">
      <h1>{t(locale, "deliveryPage")}</h1>

      <h2 className="h3">{t(locale, "delivery.payTitle")}</h2>
      <p>{t(locale, "delivery.payText")}</p>

      <h2 className="h3">{t(locale, "delivery.whereTitle")}</h2>
      {info ? (
        <table className="table">
          <thead>
            <tr>
              <th>{t(locale, "country")}</th>
              <th>{t(locale, "shipping")}</th>
            </tr>
          </thead>
          <tbody>
            {info.delivery.fees.map((fee) => (
              <tr key={fee.country}>
                <td>{t(locale, `country.${fee.country}`)}</td>
                <td>{formatMoney(fee.feeCents, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{t(locale, "deliveryFrom")}</p>
      )}
      <p>
        {t(locale, "delivery.free", {
          amount: formatMoney(info?.delivery.freeFromCents ?? 8000, locale),
        })}
      </p>

      <h2 className="h3">{t(locale, "delivery.whenTitle")}</h2>
      <p>{t(locale, "delivery.whenText")}</p>

      <h2 className="h3">{t(locale, "delivery.pricesTitle")}</h2>
      <p>{t(locale, "delivery.pricesText")}</p>

      <p>
        <Link href={href(locale, "/legal/withdrawal")}>{t(locale, "withdrawal")}</Link> ·{" "}
        <Link href={href(locale, "/legal/returns")}>{t(locale, "returns")}</Link>
      </p>
    </div>
  );
}
