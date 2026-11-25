"use client";

import type { Account, Address, DeliveryAddress, InvoiceRequest, ShippingCountry } from "@kummie/contracts";
import { formatMoney, SHIPPING_COUNTRIES } from "@kummie/core";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Field } from "@/components/Field";
import { accountApi, codeOf, commonErrorKey, statusOf } from "@/lib/account";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";
import { catalogueApi, shopApi, useCart } from "@/lib/shop";
import { CartTotals } from "../cart/CartView";

const EMPTY: DeliveryAddress = {
  name: "",
  line1: "",
  line2: null,
  city: "",
  postcode: "",
  country: "BG",
  phone: "",
};

type InvoiceKind = "none" | "person" | "company";

/**
 * Checkout: contact, delivery address, optional invoice (A14), the withdrawal information and terms
 * before payment, all totals visible; then the provider's payment page (card data never touches us).
 */
export function CheckoutView() {
  const t = useT();
  const locale = useLocale();
  const { cart, setCart, refresh } = useCart();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  // Go-live gate: test payments before launch, real ones after, nothing while closed.
  const [salesMode, setSalesMode] = useState<"test" | "live" | "closed">("test");
  const [saved, setSaved] = useState<Address[]>([]);
  const [choice, setChoice] = useState<string>("new");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY);
  const [saveAddress, setSaveAddress] = useState(true);
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>("none");
  const [invoice, setInvoice] = useState({ name: "", address: "", eik: "", vatNumber: "" });
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    catalogueApi.traderInfo().then(
      (info) => setSalesMode(info.salesMode),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    accountApi.me().then(
      (me) => {
        setAccount(me);
        accountApi.addresses().then(
          ({ items }) => {
            setSaved(items);
            const preferred = items.find((a) => a.isDefault) ?? items[0];
            if (preferred) {
              setChoice(preferred.id);
              const { id: _id, isDefault: _d, ...rest } = preferred;
              setAddress(rest);
            }
          },
          () => undefined,
        );
      },
      () => setAccount(null),
    );
  }, []);

  // The quote follows the delivery country (VAT and delivery fee).
  useEffect(() => {
    if (cart && cart.country !== address.country) {
      shopApi.setCountry(address.country).then(setCart, () => undefined);
    }
  }, [address.country, cart, setCart]);

  if (!cart || account === undefined) return <p role="status">…</p>;
  if (cart.lines.length === 0) {
    return (
      <p>
        {t("shop.emptyCartCheckout")} <Link href={href(locale, "/shop")}>{t("shop")}</Link>
      </p>
    );
  }

  const set = (key: keyof DeliveryAddress, value: string) =>
    setAddress({ ...address, [key]: key === "line2" ? value || null : value });

  function pickSaved(id: string) {
    setChoice(id);
    const found = saved.find((a) => a.id === id);
    if (found) {
      const { id: _id, isDefault: _d, ...rest } = found;
      setAddress(rest);
    } else {
      setAddress({ ...EMPTY, country: address.country });
    }
  }

  function invoiceRequest(): InvoiceRequest | null {
    if (invoiceKind === "person") return { kind: "person", name: invoice.name, address: invoice.address };
    if (invoiceKind === "company") {
      return {
        kind: "company",
        name: invoice.name,
        address: invoice.address,
        eik: invoice.eik.trim(),
        vatNumber: invoice.vatNumber.trim() ? invoice.vatNumber.trim().toUpperCase() : null,
      };
    }
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accept) return;
    setBusy(true);
    setError(null);
    try {
      const result = await shopApi.checkout({
        ...(account ? {} : { email }),
        locale,
        address,
        invoice: invoiceRequest(),
        acceptTerms: true,
        saveAddress: !!account && choice === "new" && saveAddress,
      });
      window.location.assign(result.redirectUrl);
    } catch (e) {
      const code = codeOf(e);
      if (code === "cart_changed" || code === "empty_cart") {
        setError(t("shop.cartChanged"));
        await refresh();
      } else if (statusOf(e) === 503) setError(t("shop.salesClosed"));
      else if (statusOf(e) === 502) setError(t("shop.paymentUnavailable"));
      else if (statusOf(e) === 400) setError(t("required"));
      else setError(t(commonErrorKey(e)));
      setBusy(false);
    }
  }

  return (
    <form className="checkout" onSubmit={submit}>
      <div>
        {account ? (
          <p className="muted">
            {account.email} · {account.name}
          </p>
        ) : (
          <>
            <Field
              id="co-email"
              label={t("shop.contact")}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="muted">
              {t("shop.contactNote")} <Link href={href(locale, "/signin")}>{t("auth.signIn")}</Link>
            </p>
          </>
        )}

        <fieldset className="fieldset">
          <legend className="h3">{t("shop.deliverTo")}</legend>
          {saved.length > 0 ? (
            <div className="field">
              <label htmlFor="co-saved">{t("shop.savedAddress")}</label>
              <select id="co-saved" value={choice} onChange={(e) => pickSaved(e.target.value)}>
                {saved.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}, {a.line1}, {a.city}
                  </option>
                ))}
                <option value="new">{t("shop.newAddress")}</option>
              </select>
            </div>
          ) : null}
          <Field
            id="co-name"
            label={t("acct.recipient")}
            autoComplete="name"
            required
            value={address.name}
            onChange={(e) => set("name", e.target.value)}
          />
          <Field
            id="co-line1"
            label={t("acct.line1")}
            autoComplete="address-line1"
            required
            value={address.line1}
            onChange={(e) => set("line1", e.target.value)}
          />
          <Field
            id="co-line2"
            label={t("acct.line2")}
            autoComplete="address-line2"
            value={address.line2 ?? ""}
            onChange={(e) => set("line2", e.target.value)}
          />
          <Field
            id="co-city"
            label={t("city")}
            autoComplete="address-level2"
            required
            value={address.city}
            onChange={(e) => set("city", e.target.value)}
          />
          <Field
            id="co-postcode"
            label={t("acct.postcode")}
            autoComplete="postal-code"
            required
            minLength={3}
            maxLength={12}
            value={address.postcode}
            onChange={(e) => set("postcode", e.target.value)}
          />
          <div className="field">
            <label htmlFor="co-country">{t("country")}</label>
            <select
              id="co-country"
              value={address.country}
              onChange={(e) => setAddress({ ...address, country: e.target.value as ShippingCountry })}
            >
              {SHIPPING_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {t(`country.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="co-phone"
            label={t("acct.phone")}
            type="tel"
            autoComplete="tel"
            required
            value={address.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
          {account && choice === "new" ? (
            <label className="check">
              <input
                type="checkbox"
                checked={saveAddress}
                onChange={(e) => setSaveAddress(e.target.checked)}
              />
              {t("shop.saveAddress")}
            </label>
          ) : null}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="h3">{t("shop.invoice")}</legend>
          {(["none", "person", "company"] as const).map((kind) => (
            <label key={kind} className="check">
              <input
                type="radio"
                name="invoice"
                checked={invoiceKind === kind}
                onChange={() => setInvoiceKind(kind)}
              />
              {t(
                kind === "none"
                  ? "shop.noInvoice"
                  : kind === "person"
                    ? "shop.invoicePerson"
                    : "shop.invoiceCompany",
              )}
            </label>
          ))}
          {invoiceKind !== "none" ? (
            <>
              <Field
                id="inv-name"
                label={t("shop.invoiceName")}
                required
                value={invoice.name}
                onChange={(e) => setInvoice({ ...invoice, name: e.target.value })}
              />
              <Field
                id="inv-address"
                label={t("shop.invoiceAddress")}
                required
                minLength={3}
                value={invoice.address}
                onChange={(e) => setInvoice({ ...invoice, address: e.target.value })}
              />
            </>
          ) : null}
          {invoiceKind === "company" ? (
            <>
              <Field
                id="inv-eik"
                label={t("shop.eik")}
                required
                inputMode="numeric"
                pattern="\d{9}|\d{13}"
                value={invoice.eik}
                onChange={(e) => setInvoice({ ...invoice, eik: e.target.value })}
              />
              <Field
                id="inv-vat"
                label={t("shop.vatNumber")}
                pattern="BG\d{9,10}"
                value={invoice.vatNumber}
                onChange={(e) => setInvoice({ ...invoice, vatNumber: e.target.value })}
              />
            </>
          ) : null}
        </fieldset>
      </div>

      <div className="summary">
        <h2 className="h3">{t("shop.checkoutTitle")}</h2>
        <ul className="plain">
          {cart.lines.map((l) => (
            <li key={l.variantId}>
              {l.qty} × {l.title} ({l.version}) — {formatMoney(l.lineTotalCents, locale)}
            </li>
          ))}
        </ul>
        <CartTotals cart={cart} signedIn={!!account} />
        <p className="notice">{t("shop.withdrawalInfo")}</p>
        <label className="check">
          <input type="checkbox" required checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>
            {t("auth.acceptTerms")} <Link href={href(locale, "/legal/terms")}>{t("terms")}</Link> ·{" "}
            <Link href={href(locale, "/legal/withdrawal")}>{t("withdrawal")}</Link>
          </span>
        </label>
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
        {salesMode === "closed" ? <p className="notice">{t("shop.salesClosed")}</p> : null}
        <button className="btn btn--block" type="submit" disabled={busy || salesMode === "closed"}>
          {t("shop.pay", { total: formatMoney(cart.quote.totalCents, locale) })}
        </button>
        <p className="muted">{t("shop.payNote")}</p>
        {salesMode === "test" ? <p className="muted">{t("shop.testMode")}</p> : null}
      </div>
    </form>
  );
}
