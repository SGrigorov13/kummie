import { groups, type Category, type Product } from "@kummie/catalog";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { t } from "./i18n.ts";
import { useKummie } from "./store.tsx";
import { Badge, Logo, Price, Shot, Star } from "./visuals.tsx";

export function Shell() {
  const { state, dismissPromo, acceptCookies, setLocale } = useKummie();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const tr = (key: Parameters<typeof t>[1]) => t(state.locale, key);
  const count = state.cart.reduce((sum, line) => sum + line.qty, 0);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    navigate(`/shop?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <>
      {state.promo ? (
        <div className="promo">
          <Star className="promo-star" />
          <p>{tr("promo")}</p>
          <button type="button" onClick={dismissPromo}>
            {tr("dismiss")}
          </button>
        </div>
      ) : null}
      <header className="top">
        <div className="wrap top-row">
          <Logo />
          <form className="search" onSubmit={onSearch} role="search">
            <label className="sr" htmlFor="q">
              {tr("search")}
            </label>
            <input id="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("searchPh")} />
          </form>
          <div className="tools">
            <button type="button" className="texty" onClick={() => setLocale(state.locale === "bg" ? "en" : "bg")}>
              {state.locale === "bg" ? "EN" : "BG"}
            </button>
            <Link to="/account">{tr("account")}</Link>
            <Link to="/cart" className="cart-link">
              {tr("cart")}
              <b>{count}</b>
            </Link>
          </div>
        </div>
        <nav className="nav wrap">
          <NavLink to="/shop">{tr("shop")}</NavLink>
          <NavLink to="/collect">{tr("collect")}</NavLink>
          <NavLink to="/magazine">{tr("magazine")}</NavLink>
          <NavLink to="/teen">{tr("teen")}</NavLink>
          <NavLink to="/club">{tr("club")}</NavLink>
          <NavLink to="/groups">{tr("groups")}</NavLink>
          <NavLink to="/calendar">{tr("calendar")}</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="foot">
        <div className="wrap foot-grid">
          <div>
            <strong>KUMMIE</strong>
            <p>{tr("rights")}</p>
          </div>
          <div className="foot-links">
            <Link to="/legal/withdrawal">{tr("withdrawal")}</Link>
            <Link to="/legal/returns">{tr("returns")}</Link>
            <Link to="/legal/guarantee">{tr("guarantee")}</Link>
            <Link to="/legal/privacy">{tr("privacy")}</Link>
            <Link to="/legal/terms">{tr("terms")}</Link>
            <Link to="/legal/complaints">{tr("complaints")}</Link>
          </div>
        </div>
      </footer>
      {state.cookies === "unknown" ? (
        <div className="cookie">
          <p>{tr("cookie")}</p>
          <button type="button" className="btn" onClick={acceptCookies}>
            {tr("cookieOk")}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { state } = useKummie();
  const stateBadge = product.isLimited ? "LIMITED" : product.state;
  return (
    <article className="card">
      <Link to={`/shop/${product.id}`}>
        <Shot product={product} />
      </Link>
      <div className="card-body">
        <div className="badges">
          <Badge id={product.sourcing} locale={state.locale} />
          {stateBadge ? <Badge id={stateBadge} locale={state.locale} /> : null}
        </div>
        <h3>
          <Link to={`/shop/${product.id}`}>{product.title}</Link>
        </h3>
        <Price exVat={product.priceExVat} country={state.country} locale={state.locale} />
      </div>
    </article>
  );
}

export function useCopy() {
  const { state } = useKummie();
  return {
    locale: state.locale,
    country: state.country,
    tr: (key: Parameters<typeof t>[1]) => t(state.locale, key),
  };
}

export function categoryLabel(category: Category, tr: ReturnType<typeof useCopy>["tr"]): string {
  if (category === "album") return tr("albums");
  if (category === "merch") return tr("merch");
  if (category === "collect") return tr("collectibles");
  return tr("originals");
}

export function groupName(id: string | undefined): string {
  return groups.find((group) => group.id === id)?.name ?? "";
}
