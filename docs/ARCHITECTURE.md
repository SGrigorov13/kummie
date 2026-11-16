# KUMMIE — Platform architecture

Status: v1, 2026-11-16. Leading business document: `docs/concept/KUMMIE_Platform_Concept_v3.md`.

## 1. Principles

1. **We own the whole stack.** No hosted commerce platform and no commerce framework. Our backend,
   our database, our data model. We use ordinary open-source libraries (React, Next.js, Expo,
   Fastify, Drizzle, PostgreSQL) — code we run, not services we rent.
2. **One customer record** shared by web and app (wishlist, collection, Kummies, orders, consents).
3. **External services only behind adapters** (payments, carriers, email, push, storage, supplier
   ordering), so any provider can be swapped without touching business logic.
4. **Business rules in one place** (`packages/core`), unit-tested, imported by every app.
5. **Zero held inventory.** Everything sold is pre-sold; the only physical touchpoint is the
   Bulgaria hub that repacks consolidated supplier shipments into customer parcels (v3 §1).
6. **Lean infrastructure that fits cPanel shared hosting (Bulinfo).** One PostgreSQL database also
   holds the job queue; background work is triggered by cron. No Docker, Redis or Kafka in
   production.

## 2. System overview

```
            ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
            │  apps/web    │   │ apps/mobile  │   │  apps/admin  │
            │  Next.js     │   │ Expo (RN)    │   │ Vite + React │
            │  customers   │   │ customers    │   │ staff + hub  │
            └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
                   │  HTTPS JSON, typed client from packages/contracts
                   └──────────────────┼──────────────────┘
                              ┌───────▼────────┐
                              │   apps/api     │  Fastify + Zod
                              │  modules:      │
                              │  catalog, cart │
                              │  checkout,     │
                              │  orders,       │
                              │  batching, hub │
                              │  loyalty,      │
                              │  collector,    │
                              │  notifications │
                              └───┬────────┬───┘
                     Drizzle ORM  │        │ adapters
                       ┌──────────▼─┐   ┌──▼──────────────────────────────┐
                       │ PostgreSQL │   │ payment · carriers · email ·    │
                       │ + jobs     │   │ push (FCM) · storage · supplier │
                       └─────▲──────┘   └─────────────────────────────────┘
                             │ cron → `tick` worker (closes batches, sends notifications)
```

| Part | Technology | Why |
|---|---|---|
| Web storefront | Next.js (App Router), React, TypeScript | Server rendering for SEO — the Magazine is the main acquisition channel; fast first paint (LCP < 2.5 s target) |
| Mobile app | Expo / React Native, Expo Router | One codebase for Android now, iOS later (v3 §6.5) |
| Admin + hub | Vite + React SPA | Internal tool, no SEO needed; reuses the prototype setup |
| API | Node.js LTS, Fastify, Zod | Small, fast, schema-validated; same language as the frontends |
| Database | PostgreSQL + Drizzle ORM | Relational data with strong consistency for money and orders; typed SQL and migrations |
| Jobs / scheduler | `jobs` table in PostgreSQL + a run-once worker (`pnpm --filter api tick`) started by cPanel cron every few minutes | Batch closing, notifications, emails, retries. cPanel runs Node apps under Passenger, which can stop idle processes, so in-process schedulers are not reliable there |
| Shared logic | `packages/core`, `packages/contracts` | Same VAT/shipping/Kummies maths and the same API types everywhere |

## 3. Domain model (first version)

Catalog
- `Group` (artist/group metadata only: name, generation, aka) — seeded from
  `data/seed/groups.json` (99 groups, generations 1–5, from `docs/research/kpop-research.md`);
  each starts with `editorialCheck = true` until an editor confirms it
- `Category` → `Subcategory` — seeded from `data/seed/merch-taxonomy.json` (albums, photocards &
  paper, apparel, accessories, collectibles, concert & tour, collector supplies). "Limited" is the
  `isLimited` flag, and photocard type / keychain type are product attributes, not categories
- `Product` → `Variant` (album version, size…) with `priceExVatCents`, `sourcing`, `state`,
  `isLimited`, dispatch estimate, delivery regions
- `ComplianceInfo` per product (manufacturer, EU responsible person, warnings, safety, return
  exceptions) — publishing is blocked while required fields are missing
- `Supplier` (distributor) and `SupplierOffer` (supplier SKU, cost, lead time, DDP yes/no) — a
  variant can have offers from 2+ suppliers (v3 §8 concentration risk)

Customers
- `Customer` (one record for web and app), `Address`, `Session`, `AgeStatus`, `Consent`
  (cookies, marketing, each notification category), `NotificationPreference`, `Device` (push tokens)

Commerce
- `Cart`, `CartLine`
- `Order`, `OrderLine`, `OrderEvent` (append-only timeline; drives notifications)
- `Payment`, `Refund` (supports partial refunds per line)
- `Invoice` (numbering per Bulgarian rules — detailed in M1)

Operations (the KUMMIE-specific core)
- `Batch` — collects paid order lines per supplier during a 2–3 day window
- `PurchaseOrder`, `PurchaseOrderLine` — what we send to the supplier when a batch closes
- `HubReceipt`, `HubReceiptLine` — what physically arrived in Bulgaria (shortages, damages)
- `Parcel` — one per customer order (or per split shipment), with pick list and scan check
- `Shipment` — carrier, label, tracking number, carrier status

Loyalty and collector
- `KummiesLedger` — append-only (earn, redeem, expire, adjust), balance = sum
- `StoreCredit` — euro credit from redemption, consumed at checkout
- `Referral`, `WishlistItem`, `OwnedItem`, `Follow` (groups)
- Later: `Tombola`, `TombolaEntry`, `ClubDrop`

Content
- Magazine and Teen articles start as MDX files in `apps/web/content/` (edited by an adult,
  reviewed by PR); a CMS module can come later without changing URLs.
- From the research (`docs/research/kpop-research.md` §6–7), later content types:
  - **Group profile** (agency, debut, generation, members, fandom name, official colours,
    lightstick, releases, official links) and **member profile** (stage name, position, birthday,
    solo work). Real names only when public and relevant. Text and links only — no photos or logos.
  - **Comeback calendar** (artist, release date, album, title track, MV date, pre-order date),
    always labelled with its source; feeds the "comebacks" notification category.
  - **Album guide** (versions, photocard info, inclusions, where to buy → our product pages).
  - **Interactive** (polls, quizzes, bias lists, comeback countdowns) — never on Teen routes;
    anything user-generated needs moderation and is out of scope until after launch.

## 4. Order lifecycle

Internal states (customer-facing step in brackets, from v3 §1a):

| Internal state | Customer sees | SAP analogy |
|---|---|---|
| `pending_payment` | — | Sales order, payment open |
| `paid` | 1. Order confirmed | Sales order released |
| `batched` | 2. Included in the batch order | Requirement collected (PR) |
| `ordered_from_supplier` | 2. (unchanged) | Purchase order sent (ME21N) |
| `supplier_shipped` | 3. Grouped shipment dispatched | Inbound delivery / ASN |
| `received_at_hub` | 4. Arrived at the Bulgaria hub | Goods receipt (MIGO 101) |
| `packed` | 5. Handed to the carrier (once label scanned) | Picking + packing |
| `handed_to_carrier` | 5. Handed to the carrier | Post goods issue |
| `out_for_delivery` | 6. Out for delivery | Carrier event |
| `delivered` | 7. Delivered | Proof of delivery |
| `cancelled`, `refunded`, `partially_refunded`, `exception` | Explained in plain words | Rejection / credit memo |

Rules
- Every transition writes an `OrderEvent`; a job turns events into email + in-account
  notification (+ push if opted in). Order-status messages are transactional.
- A shortage at the supplier or at hub receipt puts the affected lines into `exception` and
  triggers a **partial refund** (or a customer choice to wait), so one missing album never blocks
  the rest of the order.
- Cancellation by the customer is free until the batch closes; after that the 14-day withdrawal
  right applies after delivery.

## 5. Batch consolidation

1. Each supplier has an open `Batch` with a configurable window (default 2–3 days) and an optional
   minimum order value.
2. When an order is paid, its lines are assigned to the open batch of the supplier chosen for each
   variant (cheapest available offer that meets lead time; manual override in admin).
3. A scheduled job closes due batches, builds the `PurchaseOrder` and dispatches it through the
   supplier adapter (first version: email with CSV/PDF; API later where suppliers offer one).
4. Hub staff record the inbound shipment against the PO (`HubReceipt`), then repack: the admin
   shows a pick list per order, each item is scanned against the order number, the parcel label is
   created through the carrier adapter and scanned to confirm.
5. Batch cost (goods, duty, handling fee, inbound freight) is allocated to lines to get a real
   **landed cost per SKU** (v3 §3.2), used for margin reporting.

## 6. Money, tax and currency

- All amounts are integer **euro cents**. Prices are stored as the **consumer price incl. VAT**,
  the same in every country (D-025).
- VAT is charged at the **destination country** rate (BG / RO / GR, later PL) — intra-EU distance
  sales under OSS (v3 §3.3). Because the customer price is fixed, the VAT is *extracted* from the
  amount paid and KUMMIE's net absorbs the difference (e.g. €18.00 → net €15.00 in BG, €14.52 in
  GR). Rates live in a dated table in `packages/core`; a daily job compares it with the EU TEDB
  database and alerts on any difference (D-029).
- Display in EUR. Bulgaria's mandatory lev/euro dual display ended on 8 Aug 2026, so BGN display is
  off by default (config flag).
- Free delivery when the goods incl. VAT are worth **more than €79.99, i.e. from €80.00** (D-026).
  Flat delivery fee below it.
- Kummies: **1 Kummie per whole euro** of goods incl. VAT, only on orders with goods **≥ €30.00**
  (D-027). Redemption 500 Kummies = €5 store credit is under review; whether points are granted at
  payment or after delivery + withdrawal period is still open (D-002).

## 7. Payments

- Provider **not chosen yet** (candidates being compared). The API defines a `PaymentProvider`
  interface: create payment session, handle webhook, capture, refund (full and partial).
- Launch scope: **cards and wallets (Apple Pay / Google Pay) only. No cash on delivery.**
- Card data never touches our servers (hosted fields or redirect).
- Mobile checkout opens the web checkout in an in-app browser (v3 §6.5), so there is one payment
  integration.

## 8. Identity and access

- Customers: email + password (argon2id) with email verification; HTTP-only cookie sessions on
  web, bearer tokens on mobile; optional magic-link login later.
- Staff: separate role-based access (`admin`, `hub`, `content`), 2FA required.
- Age status captured at signup; under-18 accounts get restricted features (see CLAUDE.md).

## 9. Notifications

Channels behind adapters: email (SMTP provider), in-account inbox (our DB), push (Firebase Cloud
Messaging for Android; APNs later for iOS). Viber/WhatsApp order updates are a later adapter.
The notification job enforces opt-ins, quiet hours (22:00–08:00 local) and the two-per-week
marketing cap.

## 10. Infrastructure

- **Local development:** PostgreSQL installed natively (the owner's machine is Windows without
  Docker); Docker Compose with PostgreSQL + Mailpit is an optional alternative. Nothing requires Docker.
- **Production: Bulinfo cPanel shared hosting** (decided 2026-11-16). Bulinfo lists Node.js
  support, PostgreSQL, SSH and 1–2 GB RAM depending on plan; Node versions, cron and Passenger
  details must be confirmed with Bulinfo support before M1 (see `docs/hosting/bulinfo-checklist.md`).

  | Part | How it runs on cPanel |
  |---|---|
  | `apps/api` | Node.js app ("Setup Node.js App" / Passenger) on `api.kummie.eu` |
  | `apps/web` | Next.js standalone build as a Node.js app on `kummie.eu`; pages rendered statically wherever possible to save memory |
  | `apps/admin` | Static files (Vite build) on `admin.kummie.eu`, served by Apache, protected by API auth |
  | PostgreSQL | cPanel PostgreSQL database; small connection pool (≤ 10) |
  | Background work | cPanel cron runs `tick` every 5 minutes; every job is idempotent and time-boxed |
  | Images | Uploaded to disk under the account, served by Apache with long cache headers; move to object storage only if disk or IO limits bite |
  | Email | Through an email adapter; the hosting mailbox allows ~300 outgoing emails/hour, so transactional email moves to a dedicated SMTP service if volume grows |

- **Builds never run on the server** (not enough RAM). GitHub Actions builds each app; a deploy
  workflow uploads the build over SSH (rsync) and restarts the Node apps. Database migrations run
  as a deploy step.
- **Backups:** nightly `pg_dump` via cron, copied off the server; cPanel backups as a second layer.
- **Upgrade path:** if memory/CPU limits are reached, move the same build to a VPS (Bulinfo also
  offers managed cloud VPS) without code changes — that is why nothing depends on cPanel-specific
  features beyond cron and the Node app runner.
- Monitoring: structured logs (Pino) to files, external uptime check, error tracking.
- CI: GitHub Actions — lint, typecheck, test, build on every PR.
- Mobile builds: EAS Build or local Gradle builds; Google Play at launch.

## 11. Security and privacy

- GDPR: data minimisation, export and delete on request, documented retention.
- Teen content: no user-generated content, no identifying data about the contributor anywhere.
- Rate limiting and bot protection on auth and checkout; audit log for staff actions on orders,
  refunds and Kummies adjustments.

## 12. Milestones

| Milestone | Scope |
|---|---|
| **M0 Foundation** | Monorepo, shared packages, brand tokens, Next.js port of the prototype, API/admin skeletons, branded mobile shell, CI |
| **M1 Commerce** | Catalog + compliance gate, accounts, cart, checkout with payment adapter (fake provider until chosen), orders, emails |
| **M2 Operations** | Batching, purchase orders, hub receipt and repack with scanning, carrier adapters (Speedy/Econt first), status notifications, partial refunds |
| **M3 Club & collector** | Kummies ledger and redemption, wishlist/owned/follows synced web+app, referrals, alert opt-ins |
| **M4 Content** | Magazine and Teen (MDX), SEO, sitemap, structured data |
| **M5 Android** | Five tabs (Home, Shop, Collection, Drops, Chingu), push, in-app web checkout, Play Store release |
| **M6 Launch readiness** | Legal texts, consent, analytics after consent, accessibility (WCAG 2.2 AA), performance budgets, security review |
| Later | Tombola, Exclusive Exchange, Club Drop, Ask KUMMIE AI, iOS release, Poland |
