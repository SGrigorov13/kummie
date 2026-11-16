"use client";

import {
  FREE_SHIPPING_GROSS_CENTS,
  formatMoney,
  productById,
  SHIPPING_COUNTRIES,
  type ShippingCountry,
} from "@kummie/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/Field";
import { Price } from "@/components/Price";
import { useDemoStore } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";

type FormKey = "name" | "city" | "address";

/**
 * Cart + demo checkout. Total, VAT, shipping and the delivery window are all visible before the
 * order button (CLAUDE.md: transparent prices, no surprise customs).
 */
export function CartView() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { state, hydrated, quote, setQty, setCountry, placeOrder } = useDemoStore();
  const [form, setForm] = useState<Record<FormKey, string>>({ name: "", city: "", address: "" });
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});

  if (!hydrated) return null;

  if (state.cart.length === 0) {
    return (
      <p>
        {t("empty")} <Link href={href(locale, "/shop")}>{t("shop")}</Link>
      </p>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const values = { ...form, name: form.name || state.name };
    const nextErrors: Partial<Record<FormKey, string>> = {};
    for (const key of ["name", "city", "address"] as const) {
      if (!values[key].trim()) nextErrors[key] = t("required");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const first = Object.keys(nextErrors)[0];
      document.getElementById(`checkout-${first}`)?.focus();
      return;
    }
    const id = placeOrder(values);
    if (id) router.push(href(locale, `/orders/${id}`));
  }

  const missingForFree = FREE_SHIPPING_GROSS_CENTS - quote.grossCents;

  return (
    <form className="checkout" onSubmit={submit} noValidate>
      <ul className="lines">
        {state.cart.map((line) => {
          const product = productById(line.productId);
          if (!product) return null;
          return (
            <li key={line.productId} className="line">
              <div>
                <Link href={href(locale, `/shop/${product.id}`)}>
                  <strong>{product.title}</strong>
                </Link>
                <p className="muted">{product.dispatchEstimate[locale]}</p>
                <Price exVatCents={product.priceExVatCents} qty={line.qty} />
              </div>
              <div className="line__qty">
                <label htmlFor={`qty-${line.productId}`}>{t("qty")}</label>
                <input
                  id={`qty-${line.productId}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={line.qty}
                  onChange={(event) => setQty(line.productId, Number(event.target.value))}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setQty(line.productId, 0)}
                >
                  {t("remove")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="summary">
        <h2 className="h3">{t("checkout")}</h2>
        <p className="notice">{t("demoNotice")}</p>
        <div className="field">
          <label htmlFor="checkout-country">{t("country")}</label>
          <select
            id="checkout-country"
            value={state.country}
            onChange={(event) => setCountry(event.target.value as ShippingCountry)}
          >
            {SHIPPING_COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {t(`country.${country}`)}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="checkout-name"
          label={t("name")}
          autoComplete="name"
          value={form.name || state.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          error={errors.name}
          required
        />
        <Field
          id="checkout-city"
          label={t("city")}
          autoComplete="address-level2"
          value={form.city}
          onChange={(event) => setForm({ ...form, city: event.target.value })}
          error={errors.city}
          required
        />
        <Field
          id="checkout-address"
          label={t("address")}
          autoComplete="street-address"
          value={form.address}
          onChange={(event) => setForm({ ...form, address: event.target.value })}
          error={errors.address}
          required
        />

        <dl className="totals">
          <div>
            <dt>{t("subtotal")}</dt>
            <dd>{formatMoney(quote.exVatCents, locale)}</dd>
          </div>
          <div>
            <dt>{t("vatLine", { rate: Math.round(quote.vatRate * 100) })}</dt>
            <dd>{formatMoney(quote.vatCents, locale)}</dd>
          </div>
          <div>
            <dt>{t("shipping")}</dt>
            <dd>
              {quote.shippingCents === 0 ? t("shippingFree") : formatMoney(quote.shippingCents, locale)}
            </dd>
          </div>
          {quote.creditCents > 0 ? (
            <div>
              <dt>{t("credit")}</dt>
              <dd>−{formatMoney(quote.creditCents, locale)}</dd>
            </div>
          ) : null}
          <div className="totals__grand">
            <dt>{t("total")}</dt>
            <dd>{formatMoney(quote.totalCents, locale)}</dd>
          </div>
        </dl>
        <p className="muted">
          {missingForFree > 0
            ? t("freeShipLeft", { amount: formatMoney(missingForFree, locale) })
            : t("freeShip")}
        </p>
        <p className="muted">{t("deliveryWindow")}</p>
        <p>
          {t("points")}: <strong>{quote.kummies}</strong>
        </p>
        <button className="btn btn--block" type="submit">
          {t("place")}
        </button>
      </div>
    </form>
  );
}
