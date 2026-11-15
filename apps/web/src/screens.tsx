import {
  articleBySlug,
  articles,
  askKummie,
  calendar,
  formatMoney,
  groupById,
  groups,
  orderSteps,
  productById,
  products,
} from "@kummie/catalog";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { categoryLabel, groupName, ProductCard, useCopy } from "./shell.tsx";
import { useKummie } from "./store.tsx";
import { Badge, Equaliser, Price, Shot, Star } from "./visuals.tsx";

export function Home() {
  const { tr, locale } = useCopy();
  const picks = ["kum-binder", "kum-sleeves", "kum-toploader", "demo-album-skz"]
    .map((id) => productById(id))
    .filter((item) => item !== undefined);
  const reads = articles.filter((article) => article.section === "magazine").slice(0, 3);
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="kicker">{tr("heroKicker")}</p>
            <h1>{tr("heroTitle")}</h1>
            <p className="lede">{tr("heroBody")}</p>
            <div className="row">
              <Link className="btn" to="/shop">
                {tr("heroCta")}
              </Link>
              <Link className="btn btn-ghost" to="/magazine/what-is-a-photocard">
                {tr("heroAlt")}
              </Link>
            </div>
          </div>
          <div className="hero-mark" aria-hidden="true">
            <Star className="hero-star" />
            <Equaliser />
          </div>
        </div>
      </section>
      <section className="wrap section">
        <div className="tiles">
          <Link to="/shop?cat=album" className="tile tile-violet">
            <Star className="tile-glyph" />
            {tr("albums")}
          </Link>
          <Link to="/shop?cat=collect" className="tile tile-ink">
            <Equaliser compact />
            {tr("collectibles")}
          </Link>
          <Link to="/shop?cat=original" className="tile tile-spot">
            <Star className="tile-glyph" />
            {tr("originals")}
          </Link>
          <Link to="/teen" className="tile tile-paper">
            <Star className="tile-glyph" />
            {tr("teen")}
          </Link>
        </div>
      </section>
      <section className="wrap section">
        <h2>{tr("picks")}</h2>
        <p className="muted">{tr("bundleHint")}</p>
        <div className="grid">{picks.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      </section>
      <section className="wrap section">
        <h2>{tr("magazine")}</h2>
        <p className="muted">{tr("magazineLead")}</p>
        <div className="list">
          {reads.map((article) => (
            <Link key={article.slug} to={`/magazine/${article.slug}`} className="list-row">
              <span className="kicker ink">{tr("guide")}</span>
              <strong>{article.title[locale]}</strong>
              <span>{article.dek[locale]}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="band">
        <div className="wrap">
          <h2>{tr("club")}</h2>
          <p>{tr("clubLead")}</p>
          <Link className="btn" to="/club">
            {tr("clubCta")}
          </Link>
        </div>
      </section>
    </>
  );
}

export function Shop() {
  const { tr, locale } = useCopy();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const cat = params.get("cat") ?? "all";
  const gen = params.get("gen") ?? "all";

  const list = useMemo(() => {
    return products.filter((product) => {
      if (cat !== "all" && product.category !== cat) return false;
      const group = groupById(product.groupId);
      if (gen !== "all" && String(group?.generation ?? "") !== gen) return false;
      if (!q) return true;
      const hay = `${product.title} ${product.summary[locale]} ${group?.name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [cat, gen, locale, q]);

  function setCat(next: string) {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("cat");
    else copy.set("cat", next);
    setParams(copy);
  }

  return (
    <div className="wrap section">
      <h1>{tr("shop")}</h1>
      <div className="filters">
        {(["all", "album", "merch", "collect", "original"] as const).map((item) => (
          <button key={item} type="button" className={cat === item ? "chip on" : "chip"} onClick={() => setCat(item)}>
            {item === "all" ? tr("all") : categoryLabel(item, tr)}
          </button>
        ))}
        <label className="chip">
          {tr("gen")}
          <select
            value={gen}
            onChange={(event) => {
              const copy = new URLSearchParams(params);
              if (event.target.value === "all") copy.delete("gen");
              else copy.set("gen", event.target.value);
              setParams(copy);
            }}
          >
            <option value="all">{tr("all")}</option>
            {[5, 4, 3, 2, 1].map((generation) => (
              <option key={generation} value={generation}>
                {generation}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.length === 0 ? <p>{tr("none")}</p> : <div className="grid">{list.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
    </div>
  );
}

export function ProductPage() {
  const { id = "" } = useParams();
  const product = productById(id);
  const { tr, locale, country } = useCopy();
  const { add, toggleOwned, toggleWishlist, state } = useKummie();
  if (!product) return <div className="wrap section"><p>{tr("none")}</p></div>;
  const stateBadge = product.isLimited ? "LIMITED" : product.state;
  const text = (value: { bg: string; en: string }) => value[locale];
  return (
    <div className="wrap section product">
      <Shot product={product} />
      <div>
        <p className="kicker ink">{groupName(product.groupId) || "KUMMIE"}</p>
        <h1>{product.title}</h1>
        <div className="badges">
          <Badge id={product.sourcing} locale={locale} />
          {stateBadge ? <Badge id={stateBadge} locale={locale} /> : null}
        </div>
        <p className="demo-line">{tr("demo")}</p>
        <Price exVat={product.priceExVat} country={country} locale={locale} />
        <p>{text(product.summary)}</p>
        <dl className="facts">
          {product.version ? (
            <>
              <dt>{tr("version")}</dt>
              <dd>{product.version}</dd>
            </>
          ) : null}
          <dt>{tr("dispatch")}</dt>
          <dd>{text(product.dispatchEstimate)}</dd>
          <dt>{tr("regions")}</dt>
          <dd>{product.deliveryRegions.join(", ")}</dd>
          <dt>{tr("maker")}</dt>
          <dd>{product.compliance.manufacturer}</dd>
          <dt>{tr("responsible")}</dt>
          <dd>{product.compliance.responsiblePerson}</dd>
          {product.compliance.safetyInfo ? (
            <>
              <dt>{tr("safety")}</dt>
              <dd>{text(product.compliance.safetyInfo)}</dd>
            </>
          ) : null}
          {product.compliance.warnings?.map((warning) => (
            <span key={warning.en} className="fact-span">
              <dt>{tr("safety")}</dt>
              <dd>{text(warning)}</dd>
            </span>
          ))}
          {product.returnExceptions?.map((note) => (
            <span key={note.en} className="fact-span">
              <dt>{tr("returnsNote")}</dt>
              <dd>{text(note)}</dd>
            </span>
          ))}
        </dl>
        <div className="row">
          <button type="button" className="btn" onClick={() => add(product.id)}>
            {tr("add")}
          </button>
          <button type="button" className="btn btn-line" onClick={() => toggleWishlist(product.id)}>
            {tr("wishlist")}
            {state.wishlist.includes(product.id) ? " · ✓" : ""}
          </button>
          <button type="button" className="btn btn-line" onClick={() => toggleOwned(product.id)}>
            {tr("owned")}
            {state.owned.includes(product.id) ? " · ✓" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartPage() {
  const { tr, locale, country } = useCopy();
  const { state, quote, setQty, setCountry, placeOrder } = useKummie();
  const navigate = useNavigate();
  const [name, setName] = useState(state.name);
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = placeOrder({ name, city, address });
    if (id) navigate(`/orders/${id}`);
  }

  return (
    <div className="wrap section">
      <h1>{tr("cart")}</h1>
      {state.cart.length === 0 ? (
        <p>
          {tr("empty")} <Link to="/shop">{tr("shop")}</Link>
        </p>
      ) : (
        <form className="checkout" onSubmit={submit}>
          <div>
            {state.cart.map((line) => {
              const product = productById(line.productId);
              if (!product) return null;
              return (
                <div key={line.productId} className="line">
                  <div>
                    <strong>{product.title}</strong>
                    <Price exVat={product.priceExVat * line.qty} country={country} locale={locale} />
                  </div>
                  <label>
                    {tr("qty")}
                    <input
                      type="number"
                      min={0}
                      value={line.qty}
                      onChange={(event) => setQty(line.productId, Number(event.target.value))}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <div className="summary">
            <h2>{tr("checkout")}</h2>
            <label>
              {tr("country")}
              <select value={state.country} onChange={(event) => setCountry(event.target.value as typeof state.country)}>
                <option value="BG">Bulgaria</option>
                <option value="RO">Romania</option>
                <option value="GR">Greece</option>
              </select>
            </label>
            <label>
              {tr("name")}
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              {tr("city")}
              <input value={city} onChange={(event) => setCity(event.target.value)} required />
            </label>
            <label>
              {tr("address")}
              <input value={address} onChange={(event) => setAddress(event.target.value)} required />
            </label>
            <ul className="totals">
              <li>
                <span>{tr("subtotal")}</span>
                <span>{formatMoney(quote.exVat, "EUR", locale)}</span>
              </li>
              <li>
                <span>
                  {tr("vatLine")} {Math.round(quote.vatRate * 100)}%
                </span>
                <span>{formatMoney(quote.vat, "EUR", locale)}</span>
              </li>
              <li>
                <span>{tr("shipping")}</span>
                <span>{formatMoney(quote.shipping, "EUR", locale)}</span>
              </li>
              {quote.credit > 0 ? (
                <li>
                  <span>{tr("credit")}</span>
                  <span>−{formatMoney(quote.credit, "EUR", locale)}</span>
                </li>
              ) : null}
              <li className="grand">
                <span>{tr("total")}</span>
                <span>{formatMoney(quote.total, "EUR", locale)}</span>
              </li>
            </ul>
            <p className="muted">{tr("freeShip")}</p>
            <p>
              {tr("points")}: <strong>{quote.points}</strong>
            </p>
            <button className="btn" type="submit">
              {tr("place")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function OrderPage() {
  const { id = "" } = useParams();
  const { tr, locale } = useCopy();
  const { state, advance } = useKummie();
  const order = state.orders.find((item) => item.id === id);
  if (!order) return <div className="wrap section"><p>{tr("noOrders")}</p></div>;
  return (
    <div className="wrap section">
      <p className="kicker ink">{tr("order")}</p>
      <h1>{order.id}</h1>
      <p className="muted">{tr("localNote")}</p>
      <ol className="steps">
        {orderSteps.map((step, index) => (
          <li key={step.en} className={index <= order.step ? "done" : ""}>
            <span>{index + 1}</span>
            {step[locale]}
          </li>
        ))}
      </ol>
      {order.step < 6 ? (
        <button type="button" className="btn" onClick={() => advance(order.id)}>
          {tr("advance")}
        </button>
      ) : null}
      <p>
        {order.name}, {order.city}, {order.country} · {formatMoney(order.total, "EUR", locale)}
      </p>
    </div>
  );
}

export function CollectPage() {
  const { tr } = useCopy();
  const { state } = useKummie();
  const owned = products.filter((product) => state.owned.includes(product.id));
  const wished = products.filter((product) => state.wishlist.includes(product.id));
  return (
    <div className="wrap section">
      <h1>{tr("collect")}</h1>
      <p className="muted">{tr("saved")}</p>
      <h2>{tr("owned")}</h2>
      {owned.length === 0 ? <p>{tr("emptyCollect")}</p> : <div className="grid">{owned.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
      <h2>{tr("wishlist")}</h2>
      {wished.length === 0 ? <p>{tr("emptyCollect")}</p> : <div className="grid">{wished.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
    </div>
  );
}

export function Magazine() {
  const { tr, locale } = useCopy();
  const list = articles.filter((article) => article.section === "magazine");
  return (
    <div className="wrap section">
      <h1>{tr("magazine")}</h1>
      <p className="muted">{tr("magazineLead")}</p>
      <div className="list">
        {list.map((article) => (
          <Link key={article.slug} to={`/magazine/${article.slug}`} className="list-row">
            <strong>{article.title[locale]}</strong>
            <span>{article.dek[locale]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Teen() {
  const { tr, locale } = useCopy();
  const list = articles.filter((article) => article.section === "teen");
  return (
    <div className="wrap section">
      <h1>{tr("teen")}</h1>
      <p>{tr("teenNote")}</p>
      <div className="list">
        {list.map((article) => (
          <Link key={article.slug} to={`/teen/${article.slug}`} className="list-row">
            <strong>{article.title[locale]}</strong>
            <span>{article.dek[locale]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ArticlePage() {
  const { slug = "" } = useParams();
  const article = articleBySlug(slug);
  const { locale, tr } = useCopy();
  if (!article) return <div className="wrap section"><p>{tr("none")}</p></div>;
  return (
    <article className="wrap section prose">
      <p className="kicker ink">{article.section === "teen" ? tr("teen") : tr("magazine")}</p>
      <h1>{article.title[locale]}</h1>
      <p className="lede">{article.dek[locale]}</p>
      {article.paragraphs.map((paragraph) => (
        <p key={paragraph.en}>{paragraph[locale]}</p>
      ))}
    </article>
  );
}

export function Club() {
  const { tr, locale } = useCopy();
  const { state, setAge, redeem } = useKummie();
  return (
    <div className="wrap section">
      <h1>{tr("club")}</h1>
      <p>{tr("clubLead")}</p>
      <p className="kicker ink">
        {tr("kummies")}: {state.kummies}
      </p>
      {state.age === "unknown" ? (
        <div className="panel">
          <h2>{tr("ageTitle")}</h2>
          <p>{tr("ageNote")}</p>
          <div className="row">
            <button type="button" className="btn btn-line" onClick={() => setAge("under18")}>
              {tr("ageUnder")}
            </button>
            <button type="button" className="btn" onClick={() => setAge("18plus")}>
              {tr("ageOver")}
            </button>
          </div>
        </div>
      ) : (
        <p>{state.age === "under18" ? tr("ageNote") : tr("saved")}</p>
      )}
      <button type="button" className="btn" disabled={state.kummies < 500} onClick={redeem}>
        {tr("redeem")}
      </button>
      <h2>{tr("tombola")}</h2>
      <p>{tr("tombolaBody")}</p>
      <ul className="history">
        {state.history.map((item) => (
          <li key={item.id}>
            <b>{item.delta > 0 ? `+${item.delta}` : item.delta}</b> {locale === "bg" ? item.noteBg : item.noteEn}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Account() {
  const { tr } = useCopy();
  const { state, setName, toggleAlert, reset } = useKummie();
  return (
    <div className="wrap section">
      <h1>{tr("account")}</h1>
      <p className="muted">{tr("saved")}</p>
      <label>
        {tr("name")}
        <input value={state.name} onChange={(event) => setName(event.target.value)} />
      </label>
      <h2>{tr("alerts")}</h2>
      <p className="muted">{tr("quiet")}</p>
      <label className="check">
        <input type="checkbox" checked={state.alerts.comebacks} onChange={() => toggleAlert("comebacks")} /> {tr("comebacks")}
      </label>
      <label className="check">
        <input type="checkbox" checked={state.alerts.restocks} onChange={() => toggleAlert("restocks")} /> {tr("restocks")}
      </label>
      <label className="check">
        <input type="checkbox" checked={state.alerts.orders} onChange={() => toggleAlert("orders")} /> {tr("orderAlerts")}
      </label>
      <label className="check">
        <input type="checkbox" checked={state.alerts.drops} onChange={() => toggleAlert("drops")} /> {tr("drops")}
      </label>
      <h2>{tr("order")}</h2>
      {state.orders.length === 0 ? <p>{tr("noOrders")}</p> : (
        <ul className="history">
          {state.orders.map((order) => (
            <li key={order.id}>
              <Link to={`/orders/${order.id}`}>{order.id}</Link> · {order.step + 1}/7
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-line" onClick={reset}>
        {tr("reset")}
      </button>
    </div>
  );
}

export function GroupsPage() {
  const { tr } = useCopy();
  const { state, toggleFollow } = useKummie();
  const [gen, setGen] = useState("all");
  const list = groups.filter((group) => gen === "all" || String(group.generation) === gen);
  return (
    <div className="wrap section">
      <h1>{tr("groups")}</h1>
      <div className="filters">
        {["all", "5", "4", "3", "2", "1"].map((item) => (
          <button key={item} type="button" className={gen === item ? "chip on" : "chip"} onClick={() => setGen(item)}>
            {item === "all" ? tr("all") : item}
          </button>
        ))}
      </div>
      <ul className="groups">
        {list.map((group) => (
          <li key={group.id}>
            <div>
              <strong>{group.name}</strong>
              <span>{tr("gen")} {group.generation}</span>
            </div>
            <button type="button" className="btn btn-line" onClick={() => toggleFollow(group.id)}>
              {state.follows.includes(group.id) ? tr("following") : tr("follow")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CalendarPage() {
  const { tr, locale } = useCopy();
  return (
    <div className="wrap section">
      <h1>{tr("calendar")}</h1>
      <p>{tr("calendarNote")}</p>
      <ul className="groups">
        {calendar.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{groupById(entry.groupId)?.name}</strong>
              <span>{entry.when} · {entry.title[locale]}</span>
              <span>{entry.kind[locale]}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AskPage() {
  const { tr, locale } = useCopy();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [ids, setIds] = useState<string[]>([]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const reply = askKummie(query);
    setAnswer(reply.answer[locale]);
    setIds(reply.productIds);
  }

  return (
    <div className="wrap section">
      <h1>{tr("chingu")}</h1>
      <form className="ask" onSubmit={submit}>
        <label className="sr" htmlFor="ask">
          {tr("ask")}
        </label>
        <input id="ask" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("askPh")} />
        <button className="btn" type="submit">
          {tr("ask")}
        </button>
      </form>
      {answer ? <p className="panel">{answer}</p> : null}
      <div className="grid">
        {ids.map((id) => {
          const product = productById(id);
          return product ? <ProductCard key={id} product={product} /> : null;
        })}
      </div>
    </div>
  );
}

const legalCopy: Record<string, { bg: string; en: string }> = {
  withdrawal: {
    bg: "При истинска продажба в ЕС имаш 14 дни да се откажеш след получаване, с изключенията в закона. Тук няма договор.",
    en: "A real EU sale gives you 14 days to withdraw after delivery, with the legal exceptions. There is no contract here.",
  },
  returns: {
    bg: "Връщането в демото не изпраща нищо. Истинският процес се пише преди първа продажба.",
    en: "A demo return sends nothing. The real process is written before the first sale.",
  },
  guarantee: {
    bg: "Потребителските стоки в ЕС носят най-малко две години законова гаранция. Този текст не е гаранционна карта.",
    en: "Consumer goods in the EU carry at least a two-year legal guarantee. This text is not a warranty card.",
  },
  privacy: {
    bg: "Демото пази количка, желани и поръчки в localStorage на този браузър. Няма сървър, няма бисквитки за реклама и няма профил на детето зад KUMMIE Teen.",
    en: "The demo keeps the cart, wishlist, and orders in this browser's localStorage. There is no server, no ad cookie, and no profile of the young contributor behind KUMMIE Teen.",
  },
  terms: {
    bg: "Това е локален прототип за преглед. Бутонът за поръчка не взима пари и не създава задължение.",
    en: "This is a local prototype for review. The order button takes no money and creates no obligation.",
  },
  complaints: {
    bg: "Жалба към истински търговец се подава към него и, ако трябва, към контролния орган. Тук няма търговец.",
    en: "A complaint about a real seller goes to that seller and, if needed, to the authority. There is no seller here.",
  },
};

export function Legal() {
  const { page = "" } = useParams();
  const { locale, tr } = useCopy();
  const body = legalCopy[page];
  return (
    <div className="wrap section prose">
      <h1>{tr((page in legalCopy ? page : "terms") as "terms")}</h1>
      <p>{body ? body[locale] : tr("none")}</p>
    </div>
  );
}
