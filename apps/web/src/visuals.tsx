import { badgeSpec, BGN_PER_EUR, formatMoney, VAT_RATE, type Country, type Locale, type Product } from "@kummie/catalog";
import { Link } from "react-router-dom";

export function Star({ className = "star" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-20 50 50)">
        <path fill="currentColor" d="M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z" />
      </g>
    </svg>
  );
}

export function Equaliser({ compact = false }: { compact?: boolean }) {
  const heights = compact ? [0.35, 0.82, 0.53, 0.94] : [0.33, 0.66, 1, 0.53, 0.79, 0.29];
  return (
    <span className={compact ? "eq eq-compact" : "eq"} aria-hidden="true">
      {heights.map((height, index) => (
        <i key={height + index} style={{ height: `${height * 100}%` }} />
      ))}
    </span>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="KUMMIE">
      <Equaliser />
      <span className="wordmark">
        <Star />
        <span className="word">KUMMIE</span>
        <span className="tag">Your K-pop Chingu</span>
      </span>
    </Link>
  );
}

export function Badge({ id, locale }: { id: Product["sourcing"] | NonNullable<Product["state"]>; locale: Locale }) {
  const spec = badgeSpec(id);
  return (
    <span
      className="badge"
      style={{ background: spec.fill, color: spec.text, border: spec.border ?? "2px solid transparent" }}
    >
      {locale === "bg" ? spec.bg : spec.en}
    </span>
  );
}

export function Price({ exVat, country, locale }: { exVat: number; country: Country; locale: Locale }) {
  const gross = exVat * (1 + VAT_RATE[country]);
  return (
    <p className="price">
      <strong>{formatMoney(gross, "EUR", locale)}</strong>
      <span>
        {formatMoney(gross * BGN_PER_EUR, "BGN", locale)} · {locale === "bg" ? "с ДДС" : "incl. VAT"}
      </span>
    </p>
  );
}

export function Shot({ product }: { product: Product }) {
  return (
    <div className={`shot shot-${product.category}`} aria-hidden="true">
      <span>product shot</span>
      <Star className="shot-star" />
    </div>
  );
}
