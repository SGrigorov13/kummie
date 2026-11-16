# M1 — Commerce

Goal: turn the M0 demo storefront into a **real, testable shop**: products in the database with the
GPSR compliance gate, customer accounts, a server-side cart, checkout through the payment adapter
(fake provider until one is chosen), orders with the customer-facing timeline, transactional
e-mails, invoices/receipts as the accountant decides, and the first deploy to Bulinfo.
At the end of M1 a person can register, buy a test product, "pay" with the fake provider, get the
e-mails and follow the order — on the hosted staging site.

Read first: `CLAUDE.md`, `docs/ARCHITECTURE.md` (§3 domain, §4 order lifecycle, §6 money, §7
payments, §8 identity), `docs/DECISIONS.md` (D-016, D-025 – D-032), concept v3 §1, §1a, §3, §7.

Status: **spec — waiting for the owner's answers in "Decisions needed" (section A).** Tasks
marked *(no decision needed)* can start as soon as the spec is approved.

---

## За собственика (накратко на български)

**Какво носи M1 за бизнеса:** истински магазин в тестов режим. Продуктите се въвеждат от админ
панела и **не могат да се публикуват без задължителната информация по GPSR** (производител,
отговорно лице в ЕС, предупреждения, версия, срок за изпращане). Клиентите си правят профил,
пазаруват, плащат през тестов платежен доставчик, получават имейли и следят поръчката си в 7-те
стъпки. Kummies се записват в деня на плащане. Сайтът се качва на тестов адрес при Bulinfo.

**Какво още НЕ е в M1:** сборните поръчки към доставчиците, хъбът и куриерите (M2), използването на
Kummies при плащане и напомнянията (M3), истински плащания (след избор на доставчик), правните
текстове (M6).

**Въпросите към теб са в раздел A** — всеки с препоръка. Без отговорите на A1–A4 можем да започнем
технически, но не можем да завършим M1.

---

## A. Decisions needed (owner / accountant)

| # | Question | Why it matters | Recommendation | Needed by |
|---|---|---|---|---|
| A1 | **Guest checkout** or account required to buy? | Friction vs. Kummies/tracking | Allow guest checkout; offer "save as account" after payment. Kummies only for accounts. | Task 6 |
| A2 | **Minimum age** for an account, and can under-18s pay themselves? | Teens 13–19 are the core audience; GDPR digital-consent age is 14 in BG, 15 in GR, 16 in RO | Accounts from **14**; under-18 accounts get the restrictions in CLAUDE.md; marketing consents only from the country's consent age; payment by the account holder's own card/wallet. Lawyer to confirm. | Task 4 |
| A3 | **Receipts and invoices** — does the platform issue them, or the accountant's software? Which Bulgarian rules apply to an online shop paid by card (Наредба Н-18: fiscal receipt / "документ за регистриране на продажба", registration of the e-shop with НАП)? | Legal requirement for every sale | Ask the accountant. Build the platform side as an adapter (`ReceiptAdapter`) so either answer fits. | Task 9 |
| A4 | **Company details**: legal name, ЕИК, VAT number, registered address, contact e-mail/phone, EU responsible person (GPSR) | Footer, invoices, product pages, e-mails | — (owner provides) | Tasks 3, 8, 9 |
| A5 | **Delivery fee** — the same €4.90 in BG, RO and GR? | Courier costs differ by country; "one price everywhere" (D-025) suggests one fee | One fee everywhere until carrier quotes say otherwise | Task 6 |
| A6 | **Payment provider** | Real payments | Keep building against the fake provider in M1; choose before launch (candidates to compare: Stripe, myPOS, a Bulgarian bank's virtual POS via Borica, Paysera). Needs a company account with the provider. | Before launch |
| A7 | **E-mail sending**: Bulinfo mailbox (~300/hour) at start, or a transactional service (e.g. Brevo, Postmark, Amazon SES)? | Deliverability (spam folder) | Start with Bulinfo SMTP + SPF/DKIM/DMARC; switch through the adapter if volume grows | Task 8 |
| A8 | **Domain and staging address**: `kummie.eu` confirmed? Staging on e.g. `staging.kummie.eu`? | Deploy, e-mail sender, Android package `eu.kummie.app` | Confirm kummie.eu; staging subdomain protected by a password until launch | Task 12 |
| A9 | **Bulinfo answers** (`docs/hosting/bulinfo-checklist.md`) and the hosting plan | Deploy | MAX plan (2 GB) | Task 12 |
| A10 | **Customer cancellation** — free until the batch closes (ARCHITECTURE §4)? In M1 there is no batching yet, so "until the order is batched". | Refund rules, e-mails | Confirm | Task 7 |
| A11 | **Who enters the first real products, and from which supplier?** | Real catalogue needs supplier data (concept v3 §9) | Start with KUMMIE Originals / test products; real supplier data as soon as the first distributor answers | Task 3 |

---

## B. Tasks

### 1. `packages/contracts` *(no decision needed)*

- Zod schemas for every API request/response (catalogue, auth, cart, checkout, orders, account,
  admin) and a typed fetch client used by web, admin and (later) mobile.
- Schemas reuse `@kummie/core` types (badges enum, countries, order statuses, money in cents).
- The API validates with the same schemas (fastify-type-provider-zod).

### 2. Database schema and migrations *(no decision needed)*

Drizzle tables (one migration per logical step, never edit an applied one):
- Catalogue: `groups` (seeded from `data/seed/groups.json`), `categories`, `subcategories`
  (seeded from the taxonomy), `products`, `variants` (version, `price_cents` incl. VAT — D-025,
  `is_limited`, state badge), `product_compliance` (manufacturer, EU responsible person, warnings,
  safety info, return exceptions, dispatch estimate, delivery regions), `product_images`.
- Customers: `customers`, `customer_sessions`, `addresses`, `consents` (cookies, marketing, the
  four notification categories — with timestamp and source), `age_status`.
- Commerce: `carts`, `cart_lines`, `orders`, `order_lines` (price, VAT rate and VAT amount frozen
  at payment), `order_events` (append-only), `payments`, `refunds`.
- Loyalty: `kummies_ledger` (append-only: earn / spend / expire / revoke / adjust, with
  `earned_on`, `valid_until`, order reference — D-031, D-032).
- Staff: `staff_users` (roles admin/hub/content, TOTP secret), `audit_log`.
- Jobs: `jobs` (outbox for e-mails and later notifications; picked up by `tick`).
- Seed command: `pnpm --filter api db:seed` (groups, taxonomy, one test product per badge
  combination — no artist imagery, no fake "official" claims).

### 3. Catalogue and the compliance gate *(A4, A11 for real data)*

- Public API: list/filter (category → subcategory, generation, group, limited, search), product
  detail, groups. Only `published` products are visible.
- **Publishing is blocked** unless version, sourcing badge, dispatch estimate, delivery regions,
  manufacturer, EU responsible person, safety information/warnings (or an explicit "none") and
  return exceptions (or an explicit "none") are filled — enforced in `packages/core`
  (`missingComplianceFields(product)`) and checked by the API and the admin UI.
- Badges: exactly one sourcing badge, at most one state badge; LIMITED only from `is_limited`.
- Images through the storage adapter (disk on Bulinfo); AVIF/WebP variants, explicit sizes.
- Admin: product list, create/edit with live compliance checklist, publish/unpublish, image upload.

### 4. Customer accounts *(A2)*

- Sign-up with e-mail + password (argon2id), e-mail verification, login/logout, password reset,
  HTTP-only secure cookie sessions on web (bearer tokens for mobile come in M5).
- Age gate at sign-up (date of birth or age band per A2); under-18 flags drive the restrictions
  in CLAUDE.md (no personalised advertising, no public profile, no tombola without consent).
- Account pages: profile, addresses, consents and the four notification opt-ins (with the D-031
  note), orders, Kummies balance (read-only in M1).
- GDPR: export my data (JSON) and delete-my-account request (soft delete + anonymisation job).
- Rate limiting on auth endpoints; CSRF protection for cookie sessions.

### 5. Staff access *(no decision needed)*

- Separate staff login with TOTP 2FA, roles `admin`, `hub`, `content`; every change to orders,
  refunds, products and Kummies is written to `audit_log`.

### 6. Cart and checkout *(A1, A5)*

- Server-side cart (guest cart by cookie, merged into the account on login).
- Quote from `@kummie/core` only (one price everywhere, VAT extracted per country, free delivery
  over €79.99, Kummies preview) — the web never re-implements the maths.
- Checkout: contact, delivery address (BG/RO/GR), consent to terms + withdrawal information
  shown before payment, then a payment session through `PaymentProvider` (redirect/hosted page;
  card data never touches our servers; cards and wallets only, no cash on delivery).
- Order created as `pending_payment`; moves to `paid` only from the provider webhook (idempotent,
  signature-checked). Prices, VAT rate and VAT amount are frozen on the order at payment.
- Dev/staging: the fake provider gets a small hosted "pay / fail" page.

### 7. Orders *(A10)*

- Customer order page with the 7 steps (ARCHITECTURE §4), off-track statuses in plain words.
- Every status change writes an `order_event`; events create e-mail jobs (Task 8).
- Customer cancellation while the order is not yet batched → full refund through the adapter,
  Kummies revoked (D-032).
- Kummies **earn** entry written on payment (D-027, D-031); spending at checkout is M3.
- Admin: order list/filter, detail with timeline, manual status change for testing (audited).

### 8. Transactional e-mails *(A4, A7)*

- `EmailAdapter` implementation over SMTP (Nodemailer); Mailpit locally (optional), a "log to
  file" adapter when no SMTP is configured.
- Templates in BG/EN through `packages/i18n`, brand-styled, plain-text alternative: verify
  e-mail, password reset, order confirmation (with total, VAT, delivery, dispatch estimate,
  withdrawal information), each status change, cancellation/refund.
- Sent by the `tick` worker from the `jobs` outbox (retries with backoff, idempotency key).
- Order-status e-mails are transactional and never contain marketing.

### 9. Receipts / invoices *(A3, A4)*

- `ReceiptAdapter` interface: issue a sales document for a paid order, cancel/credit on refund.
- Implementation chosen after the accountant's answer (platform-generated PDF with Bulgarian
  numbering rules, or an export to the accountant's software).

### 10. Web storefront on the API *(no decision needed once Tasks 1–8 exist)*

- Replace `src/lib/demo-store.tsx` with the contracts client; remove `@demo` data from pages
  (keep it only as seed data).
- Product pages render from the database (static where possible, revalidated on publish).
- Account, checkout, order pages; cookie banner stays "essential only" (no analytics yet).

### 11. Admin *(no decision needed)*

- Real staff login (Task 5), catalogue (Task 3), orders (Task 7), basic dashboard numbers
  (orders today, paid total, awaiting batch).

### 12. Deploy to Bulinfo staging *(A8, A9)*

- GitHub Actions deploy workflow on merge to `main`: build, upload over SSH/rsync, run
  `node dist/migrate.js`, restart the Node apps (Passenger).
- cPanel cron: `node dist/tick.js` every 5 minutes, `node dist/tick.js --daily` at 06:00, cron
  e-mail set (D-029 alerts).
- Nightly `pg_dump` backup copied off the server.
- Staging protected by HTTP basic auth until launch; `robots: noindex`.
- `docs/hosting/` gets the real runbook; the owner guide gets a "how a release happens" section.

### 13. Tests *(throughout)*

- Unit tests for every new core rule (compliance gate, quote edge cases already covered).
- API integration tests against a real PostgreSQL (CI service container; local: the owner's DB
  `kummie_test`).
- One end-to-end test of the happy path: sign up → add to cart → pay (fake) → order paid → e-mail
  job created → Kummies earned.

---

## C. Definition of done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass in CI (Ubuntu + Windows).
- A product cannot be published without its GPSR fields (API and admin).
- On staging: register, verify e-mail, buy a test product with the fake provider, receive the
  confirmation e-mail, follow the order steps, cancel and see the refund + Kummies revoked.
- No demo data left in storefront pages; demo store module removed.
- Owner guide and `docs/DECISIONS.md` updated with everything decided in M1.

## D. Out of scope for M1

Batching, purchase orders, hub receiving/repacking, carriers and labels (M2); spending Kummies at
checkout, expiry reminders, wishlist/collection sync, referrals (M3); Magazine/Teen as MDX, SEO
(M4); mobile screens and push (M5); legal texts, analytics after consent, performance budgets,
security review (M6); real payment provider (as soon as A6 is decided).
