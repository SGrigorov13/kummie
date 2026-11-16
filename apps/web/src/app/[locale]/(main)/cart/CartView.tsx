"use client";

import type { Cart } from "@kummie/contracts";
import { formatMoney, KUMMIES_MIN_ORDER_CENTS, SHIPPING_COUNTRIES, type ShippingCountry } from "@kummie/core";
import Link from "next/link";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";
import { shopApi, useCart } from "@/lib/shop";

/**
 * Totals the customer sees before paying: goods, delivery, total and the VAT inside it, the
 * delivery-window note and Kummies (CLAUDE.md: transparent prices, no surprise customs).
 */
export function CartTotals({ cart, signedIn }: { cart: Cart; signedIn: boolean | null }) {
  const t = useT();
  const locale = useLocale();
  const q = cart.quote;
  const missingForFree = q.freeShippingFromCents - q.goodsCents;
  const missingForKummies = KUMMIES_MIN_ORDER_CENTS - q.kummiesBaseCents;
  return (
    <>
      <dl className="totals">
        <div>
          <dt>{t("subtotal")}</dt>
          <dd>{formatMoney(q.goodsCents, locale)}</dd>
        </div>
        <div>
          <dt>{t("shipping")}</dt>
          <dd>{q.shippingCents === 0 ? t("shippingFree") : formatMoney(q.shippingCents, locale)}</dd>
        </div>
        <div className="totals__grand">
          <dt>{t("total")}</dt>
          <dd>{formatMoney(q.totalCents, locale)}</dd>
        </div>
        {/* Same total in every country; only the VAT inside it follows the rules (D-025, A12). */}
        <div className="totals__vat">
          <dt>{t("vatLine", { rate: Math.round(q.vatRate * 100) })}</dt>
          <dd>{formatMoney(q.vatCents, locale)}</dd>
        </div>
      </dl>
      <p className="muted">
        {missingForFree > 0
          ? t("freeShipLeft", { amount: formatMoney(missingForFree, locale) })
          : t("freeShipReached")}
      </p>
      <p className="muted">{t("deliveryWindow")}</p>
      {missingForKummies > 0 ? (
        <p className="muted">{t("kummiesLeft", { amount: formatMoney(missingForKummies, locale) })}</p>
      ) : signedIn ? (
        <p>
          {t("points")}: <strong>{q.kummies}</strong>
        </p>
      ) : signedIn === false ? (
        <p className="muted">
          {t("shop.signInForKummies", { kummies: Math.floor(q.kummiesBaseCents / 100) })}
        </p>
      ) : null}
    </>
  );
}

export function CartView() {
  const t = useT();
  const locale = useLocale();
  const { cart, setCart } = useCart();

  if (!cart) return <p role="status">…</p>;
  if (cart.lines.length === 0) {
    return (
      <p>
        {t("empty")} <Link href={href(locale, "/shop")}>{t("shop")}</Link>
      </p>
    );
  }

  const update = (variantId: string, qty: number) =>
    shopApi.setLine({ variantId, qty, add: false }).then(setCart, () => undefined);
  const blocked = cart.lines.some((l) => !l.available);

  return (
    <div className="checkout">
      <ul className="lines">
        {cart.lines.map((line) => (
          <li key={line.variantId} className="line">
            <div>
              <Link href={href(locale, `/shop/${line.slug}`)}>
                <strong>{line.title}</strong>
              </Link>
              <p className="muted">
                {line.version} · {line.dispatchEstimate[locale]}
              </p>
              {line.available ? (
                <p>
                  {formatMoney(line.priceCents, locale)}
                  {line.qty > 1 ? ` × ${line.qty} = ${formatMoney(line.lineTotalCents, locale)}` : ""}
                </p>
              ) : (
                <p className="notice">{t("shop.unavailable")}</p>
              )}
            </div>
            <div className="line__qty">
              <label htmlFor={`qty-${line.variantId}`}>{t("qty")}</label>
              <input
                id={`qty-${line.variantId}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={line.qty}
                onChange={(event) =>
                  update(line.variantId, Math.max(0, Math.min(20, Number(event.target.value) || 0)))
                }
              />
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => update(line.variantId, 0)}
              >
                {t("remove")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="summary">
        <div className="field">
          <label htmlFor="cart-country">{t("country")}</label>
          <select
            id="cart-country"
            value={cart.country}
            onChange={(event) =>
              shopApi.setCountry(event.target.value as ShippingCountry).then(setCart, () => undefined)
            }
          >
            {SHIPPING_COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {t(`country.${country}`)}
              </option>
            ))}
          </select>
        </div>
        <CartTotals cart={cart} signedIn={null} />
        {blocked ? <p className="notice">{t("shop.cartChanged")}</p> : null}
        {blocked ? (
          <span className="btn btn--block" aria-disabled="true">
            {t("shop.toCheckout")}
          </span>
        ) : (
          <Link className="btn btn--block" href={href(locale, "/checkout")}>
            {t("shop.toCheckout")}
          </Link>
        )}
      </div>
    </div>
  );
}
