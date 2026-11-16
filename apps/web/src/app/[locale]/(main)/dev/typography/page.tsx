import { LogoLockup } from "@kummie/brand/react";
import { messages, t, type MessageKey } from "@kummie/i18n";
import type { Metadata } from "next";
import { Badge } from "@/components/Badge";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = { title: "Typography", robots: { index: false, follow: false } };

const STYLES: { id: string; token: string; className: string; sample: MessageKey }[] = [
  {
    id: "Display",
    token: "--kum-display · Archivo Black 44/1.05",
    className: "display",
    sample: "dev.sampleDisplay",
  },
  { id: "H2", token: "--kum-h2 · Archivo Black 30/1.1", className: "h2", sample: "dev.sampleH2" },
  { id: "H3", token: "--kum-h3 · Space Grotesk 700 20/1.25", className: "h3", sample: "dev.sampleH3" },
  { id: "Body", token: "--kum-body · Space Grotesk 400 16/1.6", className: "body", sample: "dev.sampleBody" },
  {
    id: "Small",
    token: "--kum-small · Space Grotesk 400 14/1.5",
    className: "small",
    sample: "dev.sampleSmall",
  },
  {
    id: "Label",
    token: "--kum-label-ty · Space Mono 700 12, +0.12em, uppercase",
    className: "label",
    sample: "dev.sampleLabel",
  },
];

const ALPHABET = {
  bg: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯ абвгдежзийклмнопрстуфхцчшщъьюя 0123456789 € №",
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 € &",
};

/**
 * /[locale]/dev/typography — every text style in Bulgarian and English, so the owner can judge the
 * temporary Cyrillic fallbacks and choose replacements (D-003). Not indexed.
 */
export default async function TypographyPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section typo">
      <h1>{t(locale, "dev.title")}</h1>
      <p className="muted">{t(locale, "dev.intro")}</p>

      <div className="typo__logo on-violet">
        <LogoLockup size={52} />
      </div>

      {STYLES.map((style) => (
        <section key={style.id} className="typo__row">
          <p className="typo__meta">
            <strong>{style.id}</strong> <code>{style.token}</code>
          </p>
          <div className="typo__pair">
            <div lang="bg">
              <span className="typo__lang">BG</span>
              <p className={`typo__sample ty-${style.className}`}>{messages.bg[style.sample]}</p>
              <p className={`typo__sample ty-${style.className}`}>{ALPHABET.bg}</p>
            </div>
            <div lang="en">
              <span className="typo__lang">EN</span>
              <p className={`typo__sample ty-${style.className}`}>{messages.en[style.sample]}</p>
              <p className={`typo__sample ty-${style.className}`}>{ALPHABET.en}</p>
            </div>
          </div>
        </section>
      ))}

      <section className="typo__row">
        <p className="typo__meta">
          <strong>Buttons · badges · promo</strong>
        </p>
        <div className="row">
          <span className="btn">{messages.bg.add}</span>
          <span className="btn btn--secondary">{messages.en.add}</span>
          <Badge id="OFFICIAL" locale="bg" />
          <Badge id="PRE_ORDER" locale="en" />
          <Badge id="LIMITED" locale="bg" />
        </div>
        <p className="promo__text typo__promo">{messages.bg.promoBar}</p>
        <p className="promo__text typo__promo">{messages.en.promoBar}</p>
      </section>
    </div>
  );
}
