# KUMMIE — instructions for Claude Code

KUMMIE ("Your K-pop Chingu") is a European K-pop commerce, media and collector platform,
launching online from Bulgaria to Bulgaria, Romania and Greece (Poland ~1 month later).
This repo holds **everything**: web storefront, Android/iOS app, admin panel, our own backend,
shared packages and the concept/brand documents.

Read before any task:
1. `docs/ARCHITECTURE.md` — how the system is built and why.
2. `docs/DECISIONS.md` — decisions already taken. Do not re-open them silently.
3. The milestone spec you were asked to implement, in `docs/specs/`.
4. For business rules: `docs/concept/KUMMIE_Platform_Concept_v3.md` (leading document).
   For brand and UI rules: `docs/brand/README.md`, `docs/brand/tokens.css`, `docs/brand/badges.json`.

If a spec conflicts with these files, stop and say so instead of guessing.

## Repo map (target, built in M0)

```
apps/web       Next.js storefront (BG/EN), PWA
apps/mobile    Expo app (Android at launch, iOS later)
apps/admin     Internal admin + Bulgaria hub screens (Vite + React)
apps/api       Our backend: Fastify + PostgreSQL (Drizzle); background jobs via a cron-run `tick` worker
data/seed      Seed data: groups by generation, merch taxonomy (from docs/research)
packages/core       Domain rules shared everywhere: money, VAT, shipping, Kummies, badges, order statuses
packages/contracts  Zod schemas + typed API client shared by web, mobile, admin
packages/brand      Design tokens (CSS + TS), fonts, star/equaliser SVG
packages/i18n       All user-facing copy, Bulgarian and English
docs/               Architecture, decisions, specs, concept, brand
```

## Commands (after M0)

```
pnpm install
pnpm dev            # all apps
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Local database: PostgreSQL installed natively (Windows), DATABASE_URL in apps/api/.env
# docker compose up -d  # optional alternative if Docker Desktop is installed
```

A task is not done until `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

## Non-negotiable product rules

Legal and brand constraints from the concept and brand handoff. They are binding on code,
seed data, templates and copy.

- **No third-party IP in our own assets.** No artist photos, group logos, album art or official
  slogans in templates, placeholders, seed data or marketing components. Artist/group names
  appear only as catalogue metadata on genuine products.
- **Badges are a closed enum** (`docs/brand/badges.json`): exactly one sourcing badge and at most
  one state badge per product. No free-text badges. Hot Pink is wired to one boolean only:
  `product.isLimited`.
- **Product pages must render** version, sourcing classification, dispatch estimate, delivery
  regions, manufacturer and EU responsible person, safety information/warnings, and return
  exceptions (GPSR Art. 19). A product without these fields cannot be published.
- **Prices are transparent:** total, VAT, shipping and delivery window visible before checkout.
  No surprise customs charges.
- **Urgency copy must be true.** The site-wide promo bar may push ("HURRY!!! ORDER IT NOW"), but
  "limited", "last units" and similar claims are shown only when the data says so.
- **KUMMIE Teen:** no comments, no DMs, no user profiles, no location data, no pressure language,
  **no promo bar or countdowns on Teen routes**. Nothing that identifies the young contributor in
  content, markup, metadata, EXIF or alt text.
- **Minors:** age gate at signup; under-18 users get no personalised advertising, no public profile
  and no tombola entry without parental consent.
- **Consent first:** no non-essential script or analytics before cookie consent.
- **Footer on every page** links withdrawal (14 days), returns, 2-year guarantee, privacy, terms,
  complaints.
- **Ask KUMMIE** answers are labelled as recommendations and never invent stock or release dates.
- **Notifications:** four separate opt-ins (comebacks, restocks, order status, Club drops); order
  status is transactional and never bundled with marketing; quiet hours 22:00–08:00; max two
  marketing pushes per user per week.

## Engineering rules

- TypeScript `strict` everywhere. No `any` without a comment explaining why.
- **Money is integer euro cents** (`number` of cents, never floats). Prices are stored as the
  **consumer price incl. VAT, identical in every country** (D-025); the VAT inside it is worked out
  per destination country from the dated rates table in `packages/core`, and KUMMIE's margin
  absorbs the difference.
- Business rules live in `packages/core` with unit tests. Apps call them; they do not re-implement them.
- Every external service sits behind an **adapter interface** in `apps/api/src/adapters/`:
  payments, carriers, email, push, file storage, supplier purchase-order dispatch.
  The payment provider is **not chosen yet** — build against the interface and a fake provider.
- Card data never touches our servers (provider-hosted fields or redirect only).
- All user-facing strings go through `packages/i18n` with both `bg` and `en`. Bulgarian is the
  default locale.
- Database changes only through Drizzle migrations. Never edit an applied migration.
- Production is **cPanel shared hosting (Bulinfo)**: no Docker, no Redis, limited RAM. Do not add
  infrastructure that needs root, a long-running daemon outside the Node app, or more than a small
  database connection pool. Builds run in GitHub Actions, never on the server.
- No secrets in the repo. Use `.env` (git-ignored) and keep `.env.example` up to date.
- Keep commits small and focused; conventional commit messages (`feat:`, `fix:`, `docs:` …).
- When you take a decision that is not in `docs/DECISIONS.md`, add it there in the same PR.
