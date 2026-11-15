# M0 — Foundation

Goal: turn the prototype into a working monorepo with shared packages, the real brand applied,
the storefront on Next.js, empty but running API/admin apps, a branded mobile shell and CI.
No real commerce yet (that is M1): the storefront keeps its local demo state.

Read first: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/brand/README.md`.

## Starting point

- `apps/web` — Vite + React prototype with 16 routes (`src/App.tsx`, `screens.tsx`, `shell.tsx`,
  `store.tsx`, `i18n.ts`, `visuals.tsx`). `main.tsx` imports `./styles.css`, which may be missing;
  `index.css` and `App.css` are leftovers from the Vite template.
- `apps/mobile` — untouched Expo template (Tab One / Tab Two).
- `packages/catalog` — domain types, demo products, groups, articles, VAT/shipping/Kummies maths,
  badge specs, rule-based Ask KUMMIE.
- `docs/brand/` — approved brand handoff (tokens, badges, logo geometry, reference HTML).
- `data/seed/` — groups (99, from research) and merch taxonomy.

## Tasks

### 1. Monorepo

- pnpm workspaces + Turborepo. Root `package.json` scripts: `dev`, `build`, `lint`, `typecheck`,
  `test`, `format`.
- `pnpm-workspace.yaml` covering `apps/*` and `packages/*`.
- `tsconfig.base.json` with `strict: true`; every package extends it.
- `.nvmrc` with the current Node.js LTS; `engines` field in root `package.json`.
- `.gitignore` (node_modules, build outputs, `.env*` except `.env.example`, Expo/Next caches).
- `.editorconfig`; keep `oxlint` as linter for all TS packages.
- Local database: the owner runs **PostgreSQL natively on Windows** (no Docker installed). Read the
  connection from `DATABASE_URL` in `apps/api/.env`; document the setup in `docs/dev-setup.md`.
  Also add an optional `docker-compose.yml` (PostgreSQL + Mailpit) for machines with Docker, but
  nothing may require Docker. `.env.example` for each app.
- All scripts must work in Windows PowerShell (use cross-platform tooling, no bash-only scripts).

### 2. `packages/core` (from `packages/catalog`)

- Rename to `@kummie/core`. Keep the public API, then change:
  - **Money in integer cents** everywhere (`priceExVatCents`, `quoteCart` returns cents).
    `formatMoney(cents, locale)` formats EUR.
  - `FREE_SHIPPING_GROSS_CENTS = 7999` (D-007). Keep shipping fee and Kummies constants.
  - VAT rates as a dated table `{ country, rate, validFrom }` with a `vatRate(country, date)` helper.
  - BGN display behind `SHOW_BGN = false` (D-004).
  - Order status enum and the mapping to the 7 customer-facing steps from `docs/ARCHITECTURE.md` §4.
- Move demo products/articles/calendar to `src/demo/` and mark every export `@demo`.
- Replace the demo `groups` with a loader for `data/seed/groups.json`; add the taxonomy from
  `data/seed/merch-taxonomy.json` as typed constants (`Category`, `Subcategory`).
  Keep the existing 4-value `Category` only as a mapping for the demo data.
- Unit tests (Vitest): VAT per country, shipping threshold edge (79.98 / 79.99), Kummies minimum
  (€14.99 vs €15.00 ex-VAT), redemption, credit never exceeding total, rounding.

### 3. `packages/brand`

- `tokens.css` copied from `docs/brand/tokens.css` (single source), plus `tokens.ts` with the same
  values for React Native. Add a small script or test that fails if the two drift.
- Star and equaliser as React components (web) with `currentColor`; equaliser paused by default,
  animates on hover/active, stops under `prefers-reduced-motion`.
- Fonts: self-host Archivo Black, Space Grotesk, Space Mono (woff2, OFL licence files included).
  **They have no Cyrillic (D-003).** Build the font stacks so Cyrillic falls back to a
  Cyrillic-capable font, and add a `/dev/typography` page in the web app showing every text style
  in Bulgarian and English so the owner can choose replacements. Do not choose final Cyrillic fonts
  yourself; list 2–3 candidates per role in the PR description.

### 4. `packages/i18n`

- Move the copy from `apps/web/src/i18n.ts`; typed keys; `bg` default, `en` second.
- Add the promo bar copy (D-007) in both languages.

### 5. `apps/web` → Next.js (D-005, proposed — confirm with owner before starting this task)

- Next.js App Router, TypeScript, locale prefixes `/bg/...` and `/en/...`, `/` redirects to `/bg`.
- Port all 16 routes from the prototype with the same behaviour. Keep the local demo state
  (localStorage) for now, isolated in one client-side store module so M1 can replace it with the API.
- Implement the visual system from `docs/brand/README.md` with `@kummie/brand` tokens:
  layout (max-width 1120px, breakpoints 360/768/1024/1440), header with search, nav
  (Shop · Collect · Magazine · Teen · Club), promo bar (48px, glow, dismissible, **hidden on
  `/[locale]/teen/**`**), hero, category tiles, product card (3:4, one sourcing badge, max one
  state badge), badges from the enum, buttons (glow primary, outlined secondary, never pink),
  forms (44px min height, errors with icon), footer legal links, cookie banner.
- Product page renders all GPSR fields (see CLAUDE.md).
- Shop filters use the new taxonomy (category → subcategory) and generations from the groups seed.
- Accessibility: focus rings per brand spec, WCAG 2.2 AA colour pairs only.
- Delete `index.css`, `App.css`, Vite assets and the template README once the port is done.

### 6. `apps/api` skeleton

- Fastify + TypeScript + Zod type provider; Drizzle with PostgreSQL; migrations folder wired
  (`pnpm --filter api db:migrate`), no business tables yet.
- Endpoints: `GET /health` (DB check). Structured logging (Pino).
- `src/adapters/` with interface files only: `payment.ts`, `carrier.ts`, `email.ts`, `push.ts`,
  `storage.ts`, `supplier.ts`, plus a `FakePaymentProvider`.
- `src/jobs/tick.ts`: run-once worker entry (`pnpm --filter api tick`) that exits cleanly — empty
  job list for now. This is what cPanel cron will call.
- Must start with `node dist/server.js` and read `PORT` from env (cPanel Passenger requirement).

### 7. `apps/admin` skeleton

- Vite + React + TypeScript, brand tokens, a sign-in placeholder and an empty dashboard.
  Builds to static files.

### 8. `apps/mobile` branded shell

- `app.json`: name "KUMMIE", slug `kummie`, scheme `kummie`, Android package `eu.kummie.app`
  (placeholder until the domain is confirmed), brand colours for splash and adaptive icon
  background (violet `#5B14E5`).
- Five tabs per brand spec: Home · Shop · Collection · Drops · Chingu. Placeholder screens using
  brand tokens; tab bar Paper (light) / Ink (dark); active icon Violet (light) / Glow (dark).
- Consume `@kummie/core`, `@kummie/brand`, `@kummie/i18n` through the workspace (Metro monorepo
  config). Follow `apps/mobile/AGENTS.md` for Expo-specific commands.
- Remove template leftovers (`EditScreenInfo`, `two.tsx`, SpaceMono-only font loading).

### 9. CI

- GitHub Actions on every PR and on `main`: install (pnpm cache), lint, typecheck, test, build
  web/api/admin. Mobile: typecheck only.

## Definition of done

- `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass from a clean clone.
- `pnpm dev` starts web (Next.js), admin and api; `GET /health` returns OK against the local PostgreSQL.
- Web shows the branded storefront in BG and EN; promo bar absent on Teen pages; `/dev/typography`
  exists.
- Mobile app starts in Expo with the five branded tabs.
- `docs/DECISIONS.md` updated with anything decided during M0.

## Out of scope for M0

Accounts, real catalog in the database, checkout, payments, batching, hub, notifications, content
migration to MDX, deployment to Bulinfo (deploy workflow comes in M1 once hosting answers are in).
