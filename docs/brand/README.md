# Handoff: KUMMIE brand identity — direction 3B "Star & Sound"

## Overview

KUMMIE is a European K-pop commerce and fan platform launching online from Bulgaria in
October 2026 ("KUMMIE — Your K-pop Chingu"). This package contains the approved visual
identity (direction **3B, "Star & Sound"**) and the build specification for the website
and the later mobile app: logo system, colour, typography, icon and badge system,
slogans, site banners, social profile kit, and developer instructions.

The audience is K-pop fans, teenagers first (13–19) with young adults and gift-buying
parents second. The brand must read as a friendly companion to teens while staying
credible enough for parents at checkout — that tension drives most of the rules below.

## About the design files

The files in `design-references/` are **design references created in HTML** — prototypes
that show the intended look and behaviour. They are **not production code to copy**.
They are streaming "Design Component" files (`.dc.html` + `support.js`) authored for a
design tool, with inline styles throughout.

The task is to **recreate these designs in the target codebase's own environment** —
Shopify theme, React, Vue, SwiftUI, Kotlin — using its established patterns, component
library and state management. If no codebase exists yet, choose the most appropriate
stack for a content-led commerce platform and implement the designs there. Take colour,
type, geometry and copy from this README, `tokens.css`, `logo-geometry.md` and
`badges.json`; take layout intent from the HTML.

To view a reference file, open it in a browser (it needs `support.js` beside it, which
is included).

## Fidelity

**High fidelity.** Colours, typography, spacing, radii, badge system and copy are final
and should be reproduced exactly. Two caveats:

1. The wordmark uses **Archivo Black** and the tagline **Space Grotesk** as
   production-ready stand-ins. Before trademark filing, the `K` and the wordmark should
   be redrawn as custom outlines so the mark is ownable. Build against the font for now;
   swap in the SVG later without layout change.
2. All imagery in the references is a striped placeholder labelled with what belongs
   there ("product shot"). No artist photography, album artwork or group logos may be
   used anywhere — see *Legal constraints*.

## Files in this package

| File | What it is |
|---|---|
| `README.md` | This document. Self-sufficient implementation spec. |
| `tokens.css` | Design tokens as CSS custom properties. Single source of truth for colour, type, spacing, radii, motion. |
| `logo-geometry.md` | Exact star polygon, equaliser ratios, lockup construction, clear space, prohibited uses. Includes SVG path. |
| `badges.json` | The closed badge enum with fills, text colours, EN/BG copy and meanings. |
| `design-references/KUMMIE Brand Concept.dc.html` | The full brand concept page — the primary reference. |
| `design-references/KUMMIE Brand Directions.dc.html` | All explored directions (1a–1d, 2a–2b, 3a–3b). Context only; **3b is the approved one**. |
| `design-references/support.js` | Runtime needed to open the reference files in a browser. |
| `KUMMIE_Final_Platform_Concept.md` | The business concept this brand serves: product strategy, fulfilment, EU compliance, roadmap, KPIs. Read sections 29, 32 and 15 before building. |

## Design tokens

Ship `tokens.css` as-is, then reference variables — never raw hex in components.

### Colour

| Token | Hex | Job |
|---|---|---|
| `--kum-violet` | `#5B14E5` | Brand ground: header, hero, app chrome, packaging |
| `--kum-ink` | `#2D0075` | All text, icons, rules. **The brand never uses pure black** |
| `--kum-glow` | `#B4FF3A` | The single primary-action colour; links on violet; NEW DROP |
| `--kum-pink` | `#FF2E9A` | The logo star, and **LIMITED only** |
| `--kum-spotlight` | `#FFE44D` | OFFICIAL badge, editorial/Magazine accents |
| `--kum-paper` | `#F4F2EF` | Light-mode page background, cards, long-form |
| `--kum-white` | `#FFFFFF` | Text on violet/ink, card surfaces |
| `--kum-label` | `#6B5FA0` | Small uppercase meta labels on paper/white |
| `--kum-body-muted` | `#55507A` | Secondary body text on paper/white |
| `--kum-hairline` | `#E6E2DA` | 1px borders on paper/white |

**Approved text/background pairs (use only these):** white on violet · ink on glow ·
ink on spotlight · ink on pink · ink on paper · paper on ink · glow on violet · glow on ink.

**Never:** white text on glow, spotlight or pink at UI sizes · glow on pink · pink text
on violet · pink as a background for anything that is not scarcity · more than two
accents in one screen.

**Proportion target:** ~60% paper, ~30% violet, ~7% glow, ~3% pink. Pink must stay rare
enough that a teen reads it as "almost gone".

### Typography

- **Archivo Black** (400) — display only: hero, section headings, campaign, prices over
  €100. Tracking −0.02em. Never below 20px, never in paragraphs.
- **Space Grotesk** (400/500/700) — everything readable: product titles, body, buttons,
  forms, all app UI.
- **Space Mono** (400/700) — labels only: badges, SKU codes, drop timers, tracking
  numbers, release dates. Uppercase, tracking +0.12em.

Both families are SIL Open Font License. Self-host woff2, `font-display: swap`, subset
**Latin + Cyrillic** (Bulgarian is a launch language).

| Role | Size / line-height | Face |
|---|---|---|
| Display | 44 / 48 | Archivo Black |
| H2 | 30 / 36 | Archivo Black |
| H3 | 20 / 26 | Space Grotesk 700 |
| Body | 16 / 26 | Space Grotesk 400 |
| Small | 14 / 20 | Space Grotesk 400 |
| Label | 12, tracking .12em, uppercase | Space Mono 700 |

Minimum body size on any surface is 14px / 12pt. **Teen-facing screens use 16px as the
floor.** Honour OS dynamic type up to 200% in the app.

### Spacing, radius, motion

Spacing scale is multiples of **4px**. Radii: 8 / 14 / 22 / 999px. Shadow:
`0 18px 46px -24px rgba(45,0,117,.28)`. Transitions 180–240ms ease-out — no bounce,
no parallax.

## Logo system

Full construction is in `logo-geometry.md`. Summary:

- **The mark is a star that makes sound.** A 10-point star clipped from a square,
  rotated **−20°**, in hot pink, sitting **behind the wordmark, centred on the K**, with
  a six-bar equaliser to its left.
- **Critical constraint:** the star must never cover an equaliser bar. The wordmark
  column carries a left margin that pushes the star's left point clear of the last bar
  (48px for a 52px wordmark with a 115px star at `left:-39px`). Re-check at every size.
- The tagline "YOUR K-POP CHINGU" renders **in front of** the star (`z-index: 2`).
- Four lockups: **horizontal** (default), **stacked** (narrow placements, social covers),
  **star monogram** (app icon, avatar, favicon — K dropped below 32px and on round
  masks), **one-colour wordmark** (invoices, legal, embroidery, engraving).
- Clear space = the height of the K. Minimum digital width 140px, print 30mm.
- Implement the star as an **inline SVG sprite**, one file, `currentColor`-aware. The
  equaliser is a CSS-animated component, **paused by default**, animating only on
  hover/active/loading.

## Icons

24px grid, 2px stroke, rounded caps and joins, ink by default, glow when active. Only
three shapes appear as filled forms: the star, the equaliser bar, the dot. The five
brand-specific glyphs are star · equaliser · dot/alert · photocard · chingu bubble.

## Badge system — the most important component

`badges.json` is the closed enum. **Every product renders exactly one sourcing badge and
at most one state badge.** This is how a large catalogue stays understandable and how
"official", "original" and "supplier direct" stay honest and legally defensible.

Build one `<Badge>` component with a typed enum prop. No free-text badges. Hot pink is
wired to exactly one boolean: `product.isLimited`.

## Sub-brands

`KUMMIE Shop · Magazine · Teen · Collect · Club · Picks · Originals`, plus `Ask KUMMIE`.
Sub-brand names set in Space Grotesk Medium at the same optical size as the wordmark,
always in violet, always **after** KUMMIE — except "Ask KUMMIE", where Ask leads.

## Copy and voice

Primary tagline: **Your K-pop Chingu**. Secondary: **Discover. Collect. Connect.**
Section slogans and campaign lines are in the concept page (section 05) and must be used
verbatim.

Rules: talk like a friend who knows the catalogue, not like a brand · short sentences ·
no hype we cannot prove · prices, shipping and stock always stated plainly · Korean terms
used then explained once (chingu, comeback, photocard, lightstick) · never imply an
artist or label endorses KUMMIE · **in Teen, no pressure language — no "last chance", no
countdown anxiety** · sponsored/affiliate content labelled in plain words.

## Website build spec

### Structure

- Responsive-first, **PWA-capable. No native app in stage 1.**
- Top-level nav: Shop · Collect · Magazine · Teen · Club. Search always visible.
- Breakpoints 360 / 768 / 1024 / 1440. Content max-width **1120px**.
- 12-column desktop grid, 4-column mobile, 24px gutters.
- Promo bar is a dismissible region, not a fixed overlay.
- **Every product page must render:** exact version · official/original/licensed
  classification · estimated dispatch date · delivery region · manufacturer and
  responsible-person information where applicable · safety information and warnings
  where applicable · return restrictions/exceptions · compatibility where relevant.
  (This is a GPSR Article 19 requirement, not a design preference.)

### Components

| Component | Spec |
|---|---|
| Primary button | Pill, glow fill, ink text, 700, 44px min height. **Never pink.** |
| Secondary button | Pill, transparent, 2px ink border, ink text (white border/text on violet) |
| Product card | 3:4 image, title max 2 lines, one sourcing badge, price, one state badge, radius 14px |
| Badge | Space Mono 700 12px, uppercase, tracking .12em, radius 6px, padding 7px 12px, enum-driven |
| Hero banner | 16:5 desktop / 4:5 mobile crop, flat violet panel, eyebrow label in mono glow, Archivo Black headline, two buttons, product image right |
| Category tile | 3:2, flat violet/ink/spotlight/pink, brand glyph top-left, Archivo Black label bottom |
| Promo bar | 48px, glow fill, ink mono text, star glyph, dismissible |
| Form field | Label above, 44px min height, radius 8px, error in ink **with an icon — never colour alone** |

### Accessibility and performance

- **WCAG 2.2 AA**: 4.5:1 for text under 24px. Use only the approved colour pairs.
- Visible focus ring: 3px glow on violet, 3px violet on paper.
- Respect `prefers-reduced-motion` — equaliser and star animations stop entirely.
- Images AVIF/WebP, lazy below the fold, explicit width and height.
- Targets: LCP < 2.5s on 4G, CLS < 0.1.
- Full **Bulgarian and English** localisation from day one; EUR and BGN display.

### Non-negotiable

- Total price, shipping cost and delivery window visible **before** checkout — no
  surprise customs charges.
- Cookie consent before any non-essential script; analytics loads after consent.
- Withdrawal (14-day), returns, two-year guarantee and complaint pages linked from every
  footer.
- **KUMMIE Teen has no comments, no DMs, no user profiles, no location data.** No
  identifying information about the young contributor anywhere in markup, metadata,
  image EXIF or alt text.
- No artist imagery in templates, placeholders, or seed data.

## Mobile app build spec

The app is a **retention tool, not a mobile copy of the shop**, and ships only after the
web business proves repeat purchase. Its jobs: comeback notifications, collection,
wishlist, drops, Ask KUMMIE.

- **Icon:** violet ground, pink star at −20° (~77% of tile), white K. Adaptive icon keeps
  the star inside the 66% safe circle; the K is dropped on round masks.
- **Splash:** violet, stacked lockup centred, equaliser animates once (600ms) then hands off.
- **Store listing:** "KUMMIE — K-pop Shop & Collect", subtitle "Your K-pop Chingu".
- **Navigation:** five tabs — Home · Shop · Collection · Drops · Chingu (Ask KUMMIE).
  Tab bar paper in light mode, ink in dark; active icon violet on light, glow on dark.
- Minimum touch target 44×44pt / 48×48dp. Base spacing 4pt. Dark mode is first-class.
- Native components per platform — do not imitate the other OS.
- **Motion:** one signature animation, the equaliser (loading, live drops, Ask KUMMIE
  thinking). Star rotates ±6° max on tap and never spins. Honour reduced-motion and
  reduced-transparency.
- **Sound:** none by default; optional single tick on drop countdown only.
- **Notifications:** four separately toggleable opt-in categories — comebacks, restocks,
  order status, Club drops. Copy pattern "⭐ Stray Kids comeback — pre-orders open 10:00",
  under 60 characters. Order status is transactional and never bundled with marketing.
  Quiet hours 22:00–08:00 local, no exceptions. Max two marketing pushes per user per week.
- **Data:** collection and wishlist sync through the same API as web — one customer
  record. Age gate at signup; minors get no personalised advertising and no public
  profile. No third-party ad SDKs in v1.
- **Ask KUMMIE** answers are labelled as recommendations and must never invent stock
  levels or release dates.

## State and data notes

Minimum product model the UI depends on:

```ts
type Product = {
  id: string;
  title: string;                    // 2 lines max in cards
  sourcing: "OFFICIAL" | "KUMMIE_ORIGINAL" | "LICENSED" | "SUPPLIER_DIRECT";
  state?: "LIMITED" | "NEW_DROP" | "IN_STOCK_EU" | "PRE_ORDER";
  isLimited: boolean;               // the ONLY thing that turns the UI pink
  version?: string;                 // album version / variant
  priceExVat: number; currency: "EUR" | "BGN";
  dispatchEstimate: string;         // required on every product page
  deliveryRegions: string[];
  compliance: {                     // required by GPSR Art. 19 where applicable
    manufacturer?: string; responsiblePerson?: string;
    warnings?: string[]; safetyInfo?: string;
  };
  returnExceptions?: string[];
};
```

Account state for the collector features: wishlist, owned items ("I own this"),
photocard collection, missing-version tracker, comeback alerts, stock/price alerts,
notification opt-ins. One customer record shared by web and app.

## Legal constraints the implementation must respect

These come from the business concept and are binding on templates, seed data and
marketing assets:

1. **No third-party IP.** No artist or group names as brand elements, no logos, no
   official slogans, no photographs, no likenesses, no album artwork in KUMMIE's own
   design assets. Artist names appear only as catalogue metadata for genuine products.
2. **KUMMIE Originals = original designs.** Anything using a group's protected material
   is a licensed product and must be badged `LICENSED`.
3. **Child privacy.** The young contributor behind KUMMIE Teen is never named,
   photographed, or made directly reachable. No school, address, neighbourhood, routine,
   private accounts, contact details or schedules — in content, metadata or markup.
4. **Minors and commercial practices.** Commercial and sponsored content aimed at young
   audiences is clearly identified. No dark patterns, no countdown pressure in Teen.
5. Products in the references are placeholders; do not ship sample data implying stock or
   authorisation that does not exist.

## Handover assets still to produce

- Logo package: SVG (horizontal, stacked, monogram, one-colour), PNG @1x/@2x/@3x, favicon ICO set.
- Icon set: 24px SVG sprite, ink and white.
- Token files for native: iOS colour set, Android `colors.xml` (values in `tokens.css`).
- Self-hosted woff2 subsets plus original OFL licence files.
- Social export templates at 1:1, 4:5 and 9:16.
- Custom-drawn wordmark outlines before trademark filing.
