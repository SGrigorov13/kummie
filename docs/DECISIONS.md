# Decision log

Newest first. Status: **Decided**, **Proposed** (needs owner confirmation), **Open**.

| # | Date | Decision | Status |
|---|---|---|---|
| D-012 | 2026-11-16 | Artists and merch taxonomy are based on `docs/research/kpop-research.md`: 99 groups (gen 1–5) seeded in `data/seed/groups.json`, merch categories in `data/seed/merch-taxonomy.json`. Group entries need an editorial check before going live. | Decided |
| D-011 | 2026-11-16 | Production hosting: **Bulinfo cPanel shared hosting**. Node apps via cPanel, PostgreSQL, cron for background work, builds in GitHub Actions, upgrade path to VPS. Plan size and technical details to confirm with Bulinfo (see `docs/hosting/bulinfo-checklist.md`). | Decided |
| D-010 | 2026-11-16 | **Fully own backend**: no hosted commerce platform (Shopify) and no commerce framework (Medusa). Node.js + Fastify + PostgreSQL (Drizzle) in this repo. | Decided |
| D-009 | 2026-11-16 | Payments: provider not chosen yet; build against a `PaymentProvider` adapter with a fake provider. Launch with **cards and wallets only, no cash on delivery**. | Decided (provider Open) |
| D-008 | 2026-11-16 | **Android app at launch**, iOS submission gated on the month-3 subscriber check (concept v3 §6.5). Overrides the brand handoff's "app after web proves itself". | Decided |
| D-007 | 2026-11-16 | Promo bar copy as in the brand concept ("HURRY!!! ORDER IT NOW * COLLECT MORE KUMMIES AND WIN AWARD * FREE DELIVERY OVER 79.99 EUR"). Free shipping threshold **€79.99 incl. VAT**. The promo bar is **not shown on Teen routes** (brand rule: no pressure language in Teen). Scarcity claims only when true. | Decided |
| D-006 | 2026-11-16 | Concept v3 is the leading business document; where the brand handoff conflicts on business matters, v3 wins. Brand handoff wins on visual identity. | Decided |
| D-005 | 2026-11-16 | Web storefront on **Next.js** (server rendering for SEO of Magazine and product pages) instead of the Vite SPA prototype. | Proposed |
| D-004 | 2026-11-16 | Prices shown in **EUR only**; BGN display behind a config flag, off by default (Bulgaria's mandatory dual display ended 8 Aug 2026). | Proposed |
| D-003 | 2026-11-16 | Brand fonts (Archivo Black, Space Grotesk, Space Mono) **have no Cyrillic**. Bulgarian text needs Cyrillic-capable companions or replacement fonts, chosen visually. Until then, use the brand fonts for Latin and a temporary Cyrillic fallback in the font stack. | Open |
| D-002 | 2026-11-16 | Kummies: earn from €15 ex-VAT merchandise, 10 per €1, 500 = €5 store credit. When points become spendable (at payment vs. after delivery + 14-day withdrawal) is still open. | Open (timing) |
| D-001 | 2026-11-16 | TypeScript monorepo (pnpm workspaces + Turborepo): web, mobile, admin, api, shared packages. | Decided |
