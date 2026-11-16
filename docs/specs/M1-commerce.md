# M1 — Commerce

Goal: turn the M0 demo storefront into a **real, testable shop**: products in the database with the
GPSR compliance gate, customer accounts, a server-side cart, checkout through the payment adapter
(fake provider until one is chosen), orders with the customer-facing timeline, transactional
e-mails, invoices/receipts as the accountant decides, and the first deploy to Bulinfo.
At the end of M1 a person can register, buy a test product, "pay" with the fake provider, get the
e-mails and follow the order — on the hosted staging site.

Read first: `CLAUDE.md`, `docs/ARCHITECTURE.md` (§3 domain, §4 order lifecycle, §6 money, §7
payments, §8 identity), `docs/DECISIONS.md` (D-016, D-025 – D-032), concept v3 §1, §1a, §3, §7.

Status: **spec — all questions answered on 2026-11-16** (section A). Still open: A2 (lawyer) and
A6 (UniCredit virtual POS — implemented when the contract is a fact). **Real sales stay switched
off** until every go-live condition in Task 13 is met.

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

**Отговорите ти са в раздел A.** Отворени остават само възрастта (A2, юрист) и платежният
доставчик (A6, УниКредит). **Истинските продажби остават изключени** (скрита функционалност), докато
не са изпълнени всички условия: регистрация по OSS, регистрация на магазина в НАП, платежен
доставчик, данни на фирмата и правни текстове. В админ панела ще има страница „Готовност за
продажби“, която показва кое е готово и кое не (задача 13).

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
| A12 | **OSS start date.** Until the voluntary OSS registration is active, RO and GR customers would be charged **Bulgarian 20 % VAT** (accountant). | **Answered: the shop does not go live before the OSS registration is active.** Real sales stay switched off (Task 13), so every real sale uses the destination rate. The `ossEffectiveFrom` setting stays as a safety net (before it, the BG rate) and is a go-live condition. |
| A13 | **Romania's rate.** The accountant's note says 19 %; the EU TEDB database shows **21 % since 01.08.2025**. | **Answered: the official EU database is leading.** RO = 21 %; the daily check keeps it in line with TEDB. |
| A14 | **B2B customers.** BG companies need an invoice within 5 days; RO/GR companies with a valid VIES number are invoiced at 0 % (intra-EU supply, VIES return), outside OSS. | **Answered:** M1 supports "Искам фактура" for individuals and Bulgarian companies (20 %); cross-border B2B with VIES and 0 % is built when the first such customer appears. |
| A15 | **Registering the e-shop with НАП** (Приложение № 33 към Н-18, with КЕП) before real sales. | **Owner registers.** The registration gives the shop its `RF` number and unique e-shop number (`E_SHOP_N`), which the platform needs for the receipts and the monthly XML (Task 9). Ongoing obligations after registration are in Task 9; any change to the declared facts (payment operator, vPOS terminal, domain, hosting, closing the shop) must be reported as an update of Приложение № 33 **within 7 days** — the admin reminds of it (Task 13). |

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
  fee per country (A5), **НАП e-shop data: `RF` number and `E_SHOP_N`, registration date** (A15).
  Changes are audited; sales documents store a snapshot of the company data.

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

Requirements from the accountant and the owner (2026-11-16). Regime: **alternative regime without
a cash register (Н-18, чл. 52о)** for card / vPOS payments, money straight to the company IBAN,
e-shop registered with НАП via Приложение № 33 (A15):

- **No cash register and no fiscal receipt** (Н-18, чл. 3, ал. 17). For **every card-paid order** the
  platform issues an **electronic system receipt** (документ по чл. 52о) when the payment webhook
  confirms the payment.
- **PDF e-mailed to the customer** with: unique document number (10 digits, sequential, no gaps),
  date and time, trader data incl. VAT number, description of the goods, **tax base, VAT rate and
  VAT amount per rate**, total, payment method, and a **two-dimensional barcode (QR code)
  containing the shop's `RF` number** plus the fields Н-18 requires (exact QR content confirmed
  with the accountant before go-live).
- **Monthly standardised audit XML** for the previous month, submitted by the owner in the НАП
  portal with КЕП **between the 1st and the 15th**. It contains **all orders, including refunded /
  reversed ones with negative amounts**, and the shop's unique number `E_SHOP_N`. Generated by a
  monthly job, validated against the official XSD, offered for download in admin; submission stays
  manual.
- **Refunds and cancellations** produce a reversal (storno) document with negative amounts that
  references the original receipt, and appear in the monthly XML.
- **Invoices:** B2C only on request ("Искам фактура"); B2B mandatory within 5 days of payment.
  Invoices have their own 10-digit numbering. Credit notes for refunds.
- **Sales journal:** B2C sales without an invoice are summarised in the monthly VAT sales journal
  (by the 14th) — the platform exports what the accountant needs (CSV/XML for their software).
- **OSS:** quarterly figures per country (RO, GR), submitted by the end of the month after the
  quarter — exported from the platform.
- Built behind a `ReceiptAdapter` so the format can change without touching checkout. Document
  numbering lives in the database under a lock, so two payments can never get the same number.
- **Later (not M1): cash on delivery** without a cash register needs a written agreement with the
  courier to pay the amounts as a postal money transfer (ППП) to the company account, and a
  document with the details of Н-18 чл. 26, ал. 1, т. 1, 4, 7 и 8 attached to every parcel. Planned
  a few months after launch together with the courier adapters.

### 10. Web storefront on the API *(no decision needed once Tasks 1–8 exist)*

- Replace `src/lib/demo-store.tsx` with the contracts client; remove `@demo` data from pages
  (keep it only as seed data).
- Product pages render from the database (static where possible, revalidated on publish).
- Account, checkout, order pages; cookie banner stays "essential only" (no analytics yet).
- **Trader information visible on the site (ЗЗП, GDPR):** a "Данни за търговеца" page (name, ЕИК,
  registered office, contacts — from Settings → Company) and a "Плащане и доставка" page (payment
  methods, delivery countries, fees and times), both linked from the footer next to the terms,
  14-day withdrawal, returns, privacy, guarantee and complaints pages. Final legal texts in M6.

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

### 13. Go-live gate — sales stay off until everything is ready *(A6, A12, A15)*

- A single **sales switch** in Settings, **off by default**. While it is off the shop can be
  browsed (behind the site password until launch) but checkout cannot take real payments — only
  the fake provider in test mode for staff.
- An admin page **"Готовност за продажби"** lists every condition, each green or red, and the switch
  can only be turned on when all are green:
  1. Company data complete (A4).
  2. OSS registration date set and reached (A12).
  3. НАП e-shop registration: `RF` number and `E_SHOP_N` entered (A15).
  4. A real payment provider configured and tested (A6).
  5. Legal pages published: terms, 14-day withdrawal, returns, privacy, trader data, payment and
     delivery (final texts in M6).
  6. Delivery fees set per country (A5).
- **7-day reminder for Приложение № 33:** when the payment provider, vPOS terminal, domain or
  hosting settings change — or the shop is switched off for good — admin records the date and shows
  a reminder to submit the update to НАП within 7 days, until someone marks it as submitted.

### 14. Tests *(throughout)*

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
- The monthly audit XML (all orders incl. refunds with negative amounts, `E_SHOP_N`) validates
  against the official XSD; receipts carry a QR code with the `RF` number.
- The sales switch is off and cannot be turned on while any go-live condition is red.
- No demo data left in storefront pages; demo store module removed.
- Owner guide and `docs/DECISIONS.md` updated with everything decided in M1.

## D. Out of scope for M1

Batching, purchase orders, hub receiving/repacking, carriers and labels (M2); spending Kummies at
checkout, expiry reminders, wishlist/collection sync, referrals (M3); Magazine/Teen as MDX, SEO
(M4); mobile screens and push (M5); legal texts, analytics after consent, performance budgets,
security review (M6); real payment provider (as soon as A6 is a fact); cash on delivery (a few
months after launch, Task 9); cross-border B2B with VIES (when the first such customer appears).
