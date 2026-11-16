# M1 — Commerce

Goal: turn the M0 demo storefront into a **real, testable shop**: products in the database with the
GPSR compliance gate, customer accounts, a server-side cart, checkout through the payment adapter
(fake provider until one is chosen), orders with the customer-facing timeline, transactional
e-mails, invoices/receipts as the accountant decides, and the first deploy to Bulinfo.
At the end of M1 a person can register, buy a test product, "pay" with the fake provider, get the
e-mails and follow the order — on the hosted staging site.

Read first: `CLAUDE.md`, `docs/ARCHITECTURE.md` (§3 domain, §4 order lifecycle, §6 money, §7
payments, §8 identity), `docs/DECISIONS.md` (D-016, D-025 – D-032), concept v3 §1, §1a, §3, §7.

Status: **spec — owner answered A1–A11 on 2026-11-16** (section A). Still open: A2 (lawyer), A6
(UniCredit virtual POS under negotiation), A12–A15 (accountant/owner, see below).

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

**Отговорите ти са в раздел A.** Отворени остават: възрастта (A2, юрист), платежният доставчик
(A6, преговори с УниКредит) и четири въпроса към счетоводителя и теб (A12–A15).

---

## A. Decisions (answered 2026-11-16 unless marked open)

| # | Question | Answer |
|---|---|---|
| A1 | Guest checkout? | **Yes.** Guest checkout allowed; "save as account" offered after payment; Kummies only for accounts. |
| A2 | Minimum age for an account | **Open — owner checks with a lawyer.** Build the age gate configurable (minimum age and under-18 restrictions as settings); default 14. |
| A3 | Receipts, invoices, Наредба Н-18 | **The platform issues them** — the accountant's requirements are in Task 9. |
| A4 | Company details | **Entered later in the admin panel** (Settings → Company) once the registration is done. Nothing is hard-coded: footer, sales documents, e-mails and product pages read them from there. Legal entity per the accountant: „СГ Корпорейшън“ ЕООД (SG Corporation LTD), VAT-registered under чл. 100, ал. 1 ЗДДС. |
| A5 | Delivery fee | **Per country, set when a courier contract is signed.** Until then the fee is €4.90 everywhere and copy says **"Доставка от 4,90 €" / "Delivery from €4.90"**; the cart always shows the exact fee. Fees become a per-country admin setting. |
| A6 | Payment provider | **Open — negotiating a virtual POS with UniCredit Bulbank.** M1 keeps the fake provider; the UniCredit adapter is added when its technical documentation arrives. Money goes straight to the company IBAN (a condition for Н-18, Task 9). |
| A7 | E-mail sending | **Bulinfo SMTP** (MX for kummie.eu already points to the hosting); SPF/DKIM/DMARC set in cPanel. |
| A8 | Domain | **kummie.eu is the real domain.** DNS is already on Bulinfo (ns5/ns6.bulinfo.org) and HTTPS answers. Until launch the site runs on kummie.eu itself behind a password (no separate staging domain). |
| A9 | Hosting | **Bulinfo PRO, already paid**, only this domain, low traffic at start; scale-up options are reconsidered when traffic grows. Still needed from Bulinfo: Node versions and whether PRO runs two Node apps (web + API) — see the checklist. |
| A10 | Free cancellation until the order is batched | **Yes.** |
| A11 | First products | **Yes** — KUMMIE Originals / test products first, real supplier data when the first distributor answers. |
| A12 | **OSS start date.** Until the voluntary OSS registration is active, RO and GR customers are charged **Bulgarian 20 % VAT** (accountant). | **Open — owner/accountant to give the date.** Core gets an `ossEffectiveFrom` setting: before it every sale uses the BG rate; from it, the destination rate. With one price everywhere (D-025) this only changes the VAT inside the price, not what the customer pays. |
| A13 | **Romania's rate.** The accountant's note says 19 %; the EU TEDB database and our daily check show **21 % since 01.08.2025** (Law 141/2025). | **Open — accountant to confirm.** Code keeps 21 %; the daily check alerts if the official rate changes. |
| A14 | **B2B customers.** BG companies need an invoice within 5 days; RO/GR companies with a valid VIES number are invoiced at 0 % (intra-EU supply, VIES return), outside OSS. | **Proposed:** M1 supports "Искам фактура" for individuals and Bulgarian companies (20 %); cross-border B2B with VIES validation and 0 % comes later, when the first such customer appears. |
| A15 | **Registering the e-shop with НАП** (Приложение № 33 към Н-18, with КЕП) before real sales: domain, shop software, ePOS provider, company IBAN. | **Owner action before launch** — needs the payment provider (A6) first. Software name and version for the form come from the deploy (Task 12). |

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

### 3. Catalogue, compliance gate and company settings *(A4, A11)*

- Public API: list/filter (category → subcategory, generation, group, limited, search), product
  detail, groups. Only `published` products are visible.
- **Publishing is blocked** unless version, sourcing badge, dispatch estimate, delivery regions,
  manufacturer, EU responsible person, safety information/warnings (or an explicit "none") and
  return exceptions (or an explicit "none") are filled — enforced in `packages/core`
  (`missingComplianceFields(product)`) and checked by the API and the admin UI.
- Badges: exactly one sourcing badge, at most one state badge; LIMITED only from `is_limited`.
- Images through the storage adapter (disk on Bulinfo); AVIF/WebP variants, explicit sizes.
- Admin: product list, create/edit with live compliance checklist, publish/unpublish, image upload.
- Admin **Settings → Company** (A4): legal name, ЕИК, VAT number, registered address, contact
  e-mail/phone, IBAN, EU responsible person (GPSR default), OSS effective date (A12), delivery
  fee per country (A5). Changes are audited; sales documents store a snapshot of the company data.

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
- Quote from `@kummie/core` only (one price everywhere, VAT extracted per country — the BG rate for
  every sale before the OSS date (A12), free delivery over €79.99, delivery fee per country (A5),
  Kummies preview) — the web never re-implements the maths.
- **"Искам фактура"** option (A14): individual (name, address — no ЕГН collected) or Bulgarian
  company (name, ЕИК, VAT number, address).
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

### 9. Sales documents under Наредба Н-18 and ЗДДС *(A3, A4, A12–A15)*

Requirements from the accountant (2026-11-16), for card payments through a virtual POS / licensed
payment operator with the money going straight to the company IBAN:

- **No cash register and no fiscal receipt** (Н-18, чл. 3, ал. 17). Instead the platform issues a
  **"документ за регистриране на продажба"** (non-fiscal system document, Н-18 чл. 52м–52о) when
  the payment webhook confirms the payment.
- **PDF e-mailed to the customer** with: unique 10-digit document number (sequential, no gaps),
  date and time, company data incl. VAT number, description of the goods, **tax base, VAT rate and
  VAT amount per rate**, total, payment method, and a **QR code** (ЕИК, document number, date,
  time, amount).
- **Monthly audit XML (Приложение № 38)** of all card-paid orders, generated at the end of each
  month per the НАП XSD schema, for submission by the 15th of the next month (the file is offered
  for download in admin; submission stays manual).
- **Invoices:** B2C only on request ("Искам фактура"); B2B mandatory within 5 days of payment.
  Invoices have their own 10-digit numbering. Credit notes for refunds.
- **Sales journal:** B2C sales without an invoice are summarised in the monthly VAT sales journal
  (by the 14th) — the platform exports what the accountant needs (CSV/XML for their software).
- **OSS:** quarterly figures per country (RO, GR) exported once OSS is active (A12).
- Built behind a `ReceiptAdapter` so the format can change without touching checkout. Document
  numbering lives in the database under a lock, so two payments can never get the same number.
- The exact XSD and the document layout are confirmed with the accountant before go-live; the XML
  is validated against the official XSD in tests.

### 10. Web storefront on the API *(no decision needed once Tasks 1–8 exist)*

- Replace `src/lib/demo-store.tsx` with the contracts client; remove `@demo` data from pages
  (keep it only as seed data).
- Product pages render from the database (static where possible, revalidated on publish).
- Account, checkout, order pages; cookie banner stays "essential only" (no analytics yet).

### 11. Admin *(no decision needed)*

- Real staff login (Task 5), catalogue (Task 3), orders (Task 7), basic dashboard numbers
  (orders today, paid total, awaiting batch).

### 12. Deploy to Bulinfo *(A8, A9)*

- GitHub Actions deploy workflow on merge to `main`: build, upload over SSH/rsync, run
  `node dist/migrate.js`, restart the Node apps (Passenger).
- cPanel cron: `node dist/tick.js` every 5 minutes, `node dist/tick.js --daily` at 06:00, cron
  e-mail set (D-029 alerts).
- Nightly `pg_dump` backup copied off the server.
- Bulinfo PRO, domain kummie.eu; API and admin on the subdomains `api.` and `admin.` if PRO runs
  two Node apps, otherwise the API is served under a path of the main domain — decided with the
  Bulinfo answers. Until launch the whole site is behind HTTP basic auth and `robots: noindex`.
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
- On kummie.eu (password-protected): register, verify e-mail, buy a test product with the fake
  provider, receive the confirmation e-mail with the sales-document PDF (QR code), follow the
  order steps, cancel and see the refund, the credit document and the Kummies revoked.
- The monthly Приложение 38 XML validates against the official XSD.
- No demo data left in storefront pages; demo store module removed.
- Owner guide and `docs/DECISIONS.md` updated with everything decided in M1.

## D. Out of scope for M1

Batching, purchase orders, hub receiving/repacking, carriers and labels (M2); spending Kummies at
checkout, expiry reminders, wishlist/collection sync, referrals (M3); Magazine/Teen as MDX, SEO
(M4); mobile screens and push (M5); legal texts, analytics after consent, performance budgets,
security review (M6); real payment provider (as soon as A6 is decided).
