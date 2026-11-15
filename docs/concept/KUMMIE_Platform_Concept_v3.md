# KUMMIE — Platform Concept v3
## Zero-stock, order-split operating model — Bulgaria-first

This is a distinct scenario built on top of v2 (KUMMIE_Platform_Concept_v2.md), not a replacement of it. Brand identity, KUMMIE Teen, the compliance framework (Sections 9–14), and most of the product catalogue logic carry over unchanged and are referenced by their v2 section numbers below rather than repeated. What v3 redefines is **how a product physically gets from a producer to a customer, who carries the customs/duty burden, and how big the delivery footprint is on day one** — plus a fully expanded version of the KUMMIE Club loyalty programme, since under this model, retention economics matter more than they did in v2.

---

## 1. Operating model — how an order actually flows

**Updated to the batch-consolidation model** (a refinement of the original per-order dropship idea — this replaces it, and it's a meaningfully better design for the reasons below).

1. Customer places an order and pays **KUMMIE** (KUMMIE is the merchant of record and the checkout).
2. KUMMIE **batches orders over a 2–3 day window** rather than sending each one individually.
3. At the end of that window, KUMMIE sends **one consolidated purchase order** to the B2B distributor.
4. The distributor picks and packs everything as **one grouped shipment** and sends it to KUMMIE's receiving point in Bulgaria.
5. On arrival in Bulgaria, the grouped shipment is **broken down and repacked into individual parcels**, one per original customer order. (Read "commissioned it into separate packs" as this de-consolidation/repacking step — confirm that's what you meant if not.)
6. Each individual parcel goes out through the matched local/regional carrier to the end customer — who may be in Bulgaria, Romania, or Greece (Section 4).
7. **A notification fires to the customer's profile at every step** — see Section 1a.

This is still a **zero-held-inventory model**, not a warehousing model: by the time the grouped shipment lands in Bulgaria, every item in it is already sold and tied to a paid order. Nothing sits waiting for demand — it's a cross-dock, not a stockroom. The 2–3 day repacking window is the only point where KUMMIE physically touches product, and it's brief and pre-sold by design.

**Why this is better than pure per-order dropship (the original v3 idea):** it turns dozens of small, unpredictable cross-border parcels into one predictable, poolable customs/logistics event every 2–3 days. That's a direct improvement on the biggest risk flagged in the original version of this section — customs cost per parcel — and it also puts KUMMIE in a much stronger position to negotiate real wholesale (not per-unit dropship) pricing from the distributor, which is why Section 5's margin assumptions improve below.

### 1a. Order-status notifications

Every profile-visible status change should fire a notification (email + in-account, minimum): order confirmed → included in this batch's consolidated order → grouped shipment dispatched by distributor → arrived at the Bulgaria hub → your parcel repacked and handed to [carrier] → out for delivery → delivered. This is a build requirement for the order-tracking system, not just a nice-to-have — with a 2–3 day batching step in the middle, customers need more visibility than a single-shipment order would, or the batching delay will read as "nothing is happening."

---

## 2. Reseller / producer network — two tiers

**Tier 1 — EU-based resellers and wholesalers.** Prioritise these. If the partner already holds stock inside the EU customs union, an order shipped to a Bulgarian customer is a **domestic EU parcel**, not an import — no customs duty, no import VAT complexity, no customs broker needed. This tier should carry as much of the catalogue as possible specifically because it removes the entire customs problem for those SKUs.

**Tier 2 — Korea/China-based direct producers.** Needed for exclusives, faster access to new releases, and anything Tier 1 doesn't carry. Every shipment here is a cross-border import and triggers the customs mechanics in Section 3. Partner agreements with this tier should specify **DDP (Delivered Duty Paid)** terms wherever the partner can offer it.

**KUMMIE Originals via print-on-demand / dropship OEM.** KUMMIE's own designs don't need to break the "zero stock" rule — a POD/dropship manufacturing partner (holds blanks, prints/assembles to order, ships direct) keeps Originals inside the same operating model while letting KUMMIE keep the margin that a pure reseller relationship gives away. Under v3, **Originals become more important to the business than they were in v2** — see Section 5.

**Partner vetting criteria** (minimum bar before listing a partner's product): proof of official licensing/authorisation where applicable, sample order and quality check, stated ship time and return/defect policy in writing, and — for Tier 2 — a clear answer on whether they offer DDP.

### 2.1 Distributor candidates — starting leads, not vetted partners

You asked for at least 3 direct B2B distributors. I searched rather than invented names — these are real, findable companies that publicly offer B2B/wholesale supply of official K-pop albums and merchandise. **I have not verified anyone's actual licensing status, current pricing, or willingness to do a batch-consolidation arrangement like Section 1 describes — that requires you (or someone on your behalf) contacting each one directly with the required portfolio (v2: A. Official albums, B. Official MD, C. Collector accessories) and asking for proof of authorisation.**

| Candidate | Base | Type | Why it's a plausible fit |
|---|---|---|---|
| **K-Moon** (kmoon.eu / kmoon.it) | Italy — **EU** | Retailer with a public B2B/wholesale programme for other retailers | The only candidate found that is genuinely EU-based, which matters most for Section 3: stock already inside the EU means the consolidated shipment to Bulgaria is a domestic EU movement, not an import |
| **Koreapopstore** (koreapopstore.com) | South Korea | Wholesaler, explicitly runs a "Worldwide B2B Export" programme | Long-established (since 2010), broad catalogue across albums, official merch and pre-order benefits; already referenced in v2's own research sources |
| **KODY Global** (kodyglobal.com) | South Korea | K-pop B2B/wholesale supplier | Public testimonials include an existing Bulgarian client ("Bulgaria - P Corp"), which is a meaningful proof point for exactly this market |
| *(backup)* **Idol Store Co., Ltd.** (idolstore.kr) | South Korea | Larger-scale K-pop distributor (reported ~20 billion KRW sales), sells via its own platform plus Amazon/Shopify | Worth a conversation as a fourth option or backup if one of the above doesn't work out on terms or licensing |

Only K-Moon is EU-based; the other three are Korea-based, which means the customs mechanics in Section 3 still apply to shipments from them — but as one consolidated batch shipment every 2–3 days rather than many individual parcels, which is a much easier problem than the original per-order model had. **Practical next step: run the same outreach to all of them in parallel — ask for wholesale pricing, minimum order quantities, whether they can support a 2–3 day consolidated batch order, and proof of official licensing — rather than picking one on name recognition alone.**

---

## 3. Customs, VAT and duty — who pays, and how

Two separate cost layers apply to anything imported from outside the EU, and they need two separate solutions.

### 3.1 VAT — solvable by prepayment today

KUMMIE, as the platform that controls checkout, payment and delivery terms for goods fulfilled by third parties, meets the EU's definition of a **"deemed supplier" / facilitating marketplace** under the VAT e-commerce rules in force since 1 July 2021. That means KUMMIE can — and should — register for the **IOSS (Import One-Stop Shop)**: charge VAT to the customer at checkout for any consignment up to €150, and remit it through a single monthly return instead of the customer being charged VAT (plus a handling fee) by the courier on delivery. This directly answers "can we prepay it": **yes, IOSS is exactly that mechanism**, and it's the industry-standard way to do it. Since KUMMIE isn't EU-resident-only by supplier origin (Tier 2 partners are outside the EU), an IOSS intermediary will likely be needed to register on KUMMIE's behalf.

### 3.2 Customs duty and the new handling fee — not solved by IOSS

IOSS only covers VAT. Since 1 July 2026 a flat **€3 customs duty per tariff line** applies to imports regardless of value, and a separate EU-wide **handling fee (~€2, expected to become mandatory around November 2026)** stacks on top, alongside mandatory product-identifier data from the same date. Neither is covered by IOSS. Two ways to handle it:

- **Option A — preferred: push it upstream.** Require Tier 2 partners to ship **DDP**, with duty and the handling fee pre-paid before the parcel leaves their country. The cost gets baked into what KUMMIE pays the partner per order, which is cleaner and keeps the customer's experience surprise-free.
- **Option B — the fallback the founder asked about: a customs broker.** Where a partner can't offer DDP, KUMMIE contracts a licensed Bulgarian customs broker (a "митнически представител") — or uses a courier that bundles this service (several couriers and Bulgarian Post itself offer customs clearance plus duty disbursement as a paid add-on) — to act as the declarant: verify the customs paperwork, pay the duty/fee from a disbursement account, and release the parcel to the domestic carrier for last-mile delivery. This is a standard, real service, not a bespoke build.

Either way, duty + handling fee should be treated as a **landed-cost line per SKU**, not an afterthought — it changes the real margin on low-priced items (a €5 sticker pack absorbing €3–5 in duty/fee is a very different SKU economically than the same item shipped from an EU-based Tier 1 partner).

### 3.3 One important shift under the batch-consolidation model

Section 3.1's IOSS mechanism is built for individual low-value parcels (≤€150) shipped one-by-one to consumers — it's the right tool for pure per-order dropship. The batch model in Section 1 changes this: a consolidated shipment bundling many customers' orders together will usually have an aggregate customs value well above €150, so it clears as a **normal commercial B2B import**, not through IOSS. In practice: KUMMIE (or its customs broker) pays standard import VAT plus the duty/handling fee on the whole batch as one declaration — which is actually the simplification Section 1 promised, since it's one predictable event instead of many small ones. Once that batch has cleared customs, the goods are VAT-paid and inside the EU; the subsequent sale to each end customer in Bulgaria, Romania or Greece is a normal intra-EU distance sale, with VAT charged at the destination country's rate through the regular **OSS** (not Import-OSS) scheme. This only applies to Tier 2 (Korea-based) distributors — a batch sourced from an EU-based distributor like K-Moon never touches import procedure at all, since it's already inside the EU customs union.

---

## 4. Market scope — Bulgaria, Romania and Greece at launch; Poland from month 2

**Updated from the Bulgaria-only scope.** Launch delivery footprint is now three countries: Bulgaria, Romania and Greece, each served by its own local/regional carrier for the last-mile leg out of the Bulgaria repacking hub (Section 1). Poland is added roughly a month after launch, once a suitable 3rd-party delivery partner there is confirmed — not before, since the batch-consolidation model in Section 1 depends on having a working carrier relationship in every destination country before orders can be accepted from it.

This is a materially bigger addressable market than Bulgaria alone: Romania (~19M) and Greece (~10.4M) together are roughly 4.5x Bulgaria's population (~6.4M). That directly improves the feasibility case in Section 6.2 below — the earlier concern about Bulgaria alone being too small a base to reach €100K gross profit is significantly de-risked by adding two markets of this size at launch rather than waiting to prove Bulgaria first.

**Candidate 3rd-party delivery/carrier starting points** (unverified leads, same caveat as Section 2.1 — get quotes and confirm actual cross-border/last-mile capability before committing):

| Country | Domestic/regional candidates to evaluate |
|---|---|
| Bulgaria | Speedy, Econt |
| Romania | Fan Courier, Cargus |
| Greece | ACS Courier, ELTA Courier, Speedex |
| Poland *(month 2)* | InPost, DPD Polska, GLS Poland |

Worth specifically checking whether **DPD** or **GLS** — both pan-European networks — operate their own local entity in all three (soon four) countries: a single carrier group present everywhere would be a much simpler integration than four separate domestic couriers with four separate APIs and four separate account relationships, which is closer to what "closely integrated" should mean operationally. I haven't verified their exact country-by-country coverage for this specific route, so this needs its own quick confirmation call before ruling in or out.

---

## 5. Margin structure under this model

**Updated for the batch-consolidation model.** The original per-order dropship version of v3 assumed each order was bought at close to individual/retail-minus-a-cut pricing. Buying as one consolidated batch every 2–3 days (Section 1) is a genuinely different negotiating position — it's much closer to real wholesale purchasing, which should land margins somewhere between the original v2 bulk-import numbers and the pessimistic per-order-dropship numbers below.

| Category | v2 margin (bulk stock, self-import) | v3 margin (consolidated batch purchasing) | Why it moves |
|---|---:|---:|---|
| Official albums | 25–40% | 20–30% *(assumption, revised up)* | Batch purchasing recovers some of the wholesale discount a pure dropship model loses |
| Official lightsticks/MD | 35–50% | 25–35% *(assumption, revised up)* | Same |
| Collector accessories (Tier 1 EU partner, e.g. K-Moon-type) | 55–70% | 35–50% *(assumption, revised up)* | EU partner still needs margin, but no customs drag, and batch pricing is closer to their own wholesale tier |
| KUMMIE Originals (POD/dropship OEM) | 55–70% | 45–60% *(unchanged)* | KUMMIE keeps design/IP margin regardless of purchasing model |

**Blended planning assumption for the growth math below: 30%** (revised up from 25% in the per-order version) — still the single biggest unknown in this document, and still entirely dependent on the actual quotes that come back from Section 2.1's distributor outreach. Treat 30% as the working number, not a confirmed one.

The strategic implication on Originals is unchanged: it's still the best-margin category, and still worth prioritising early.

---

## 6. Growth strategy to €100,000 gross profit / year

### 6.1 The math, at different margin outcomes

At a planning AOV of €45 (consistent with v2's early-stage assumption):

| Blended gross margin | Revenue needed for €100K gross profit | Orders/year | Orders/month |
|---:|---:|---:|---:|
| 20% | €500,000 | ~11,100 | ~925 |
| 25% | €400,000 | ~8,900 | ~740 |
| 30% *(base case)* | €333,000 | ~7,400 | ~620 |
| 35% *(Originals-heavy)* | €286,000 | ~6,350 | ~530 |

### 6.2 A reality check on a three-country market

The three-country launch (Bulgaria, Romania, Greece — Section 4) meaningfully improves the feasibility case here. Bulgaria alone (~6.4M people) was the concern in the earlier version of this document; the combined population across all three is closer to **36M**, roughly 5.5x Bulgaria on its own. I don't have hard K-pop-fandom-size numbers for any of the three (this isn't published data anywhere reliable), but there's confirmed organised fan activity in Bulgaria specifically (a recurring Sofia K-pop club night, the K-pop Cover Dance Festival hosted there, an academic case study tracking the fandom back to 2008) — and Greece and Romania are both larger markets that plausibly have proportionally larger scenes, though I haven't verified that directly and it shouldn't be assumed without checking. The order volume needed (530–925/month across three countries rather than one) is a substantially more plausible target than the same number from Bulgaria alone was.

**The trigger from the earlier version still stands, just at a higher bar**: if combined order volume across all three markets plateaus well below what the 30% margin scenario needs, Poland (already planned for month 2) becomes the next lever, and the honest fallback after that is revisiting the margin assumption itself rather than assuming a fifth country fixes it.

### 6.3 Phased ramp (illustrative, not a forecast)

| Phase | Months | Orders/month target | Focus |
|---|---|---:|---|
| A — Prove it | 1–6 | 15 → 200 | Distributor(s) confirmed and first batch cycles running, BG/RO/GR carriers live, Kummies + referral live from day one, first tombola, website + Android app live at launch, iOS submission gated on the month-3 subscriber check (6.5) |
| B — Build the engine | 7–12 | 200 → 400 | Poland added (month ~2), more distributor relationships for catalogue breadth, first KUMMIE Originals via POD |
| C — Compound | 13–18 | 400 → 550 | Kummies redemption + Exclusive Exchange live, referral programme compounding, repeat-purchase rate becomes the main lever |
| D — Reach the target | 19–24 | 550 → 650+ | At the 30% base-case margin, this crosses the €100K gross-profit run-rate |

### 6.4 Acquisition tactics by market

For Bulgaria specifically, there's a concrete, sourced starting point: sponsor or set up a stand at events like Sofia's recurring K-pop club night and the K-pop Cover Dance Festival, and get in front of the Bulgarian K-pop Discord/Facebook communities that already organise around them. **I haven't done the equivalent research for Romania and Greece** — the same playbook (find the existing K-pop club nights, cover-dance groups, and Discord/Facebook communities in Bucharest, Athens/Thessaloniki, etc.) should work, but it needs its own search before spending against it rather than assuming Bulgaria's findings transfer.

### 6.5 Mobile app — website + Android at launch, iOS gated on 3-month subscriber health

**Updated sequencing.** Website and Android ship together at launch (month 1) — no purchaser gate on Android, it's part of day one. iOS is the one that's conditional: built into the same codebase from the start (see below), but the App Store submission is held back until the first 3 months show healthy subscriber numbers.

**Why Android-first is a genuinely good fit here, not just the cheaper option** — I checked rather than assumed: Android's mobile OS market share is running **~76% in Bulgaria and ~73% in Romania** as of mid-2026 (Statcounter), against roughly a quarter for iOS in both. That's an unusually strong Android skew — for most Western European launches this would be closer to 50/50 or iOS-leaning, but for this specific three-country footprint, Android at launch genuinely reaches the large majority of the addressable audience. iOS being the one held back for a health-check isn't a compromise here; it's the right order for this market.

This still revises v2's "don't build the app before the web is proven" principle (as flagged in the previous version of this section), for the same underlying reason: the teen-first audience makes early app presence worth more than it would for a generic e-commerce launch.

**One build, staggered releases — not two separate builds.** Because this is a cross-platform codebase (React Native, per Section 9), "Android now, iOS later" mostly means *staggering the store submissions*, not building the app twice. Build once; submit to Google Play at launch; hold the App Store Connect submission until the gate below is met. This keeps the engineering effort roughly what Section 6.5 already scoped, while still matching the staged rollout.

**Proposed definition of "the first 3 months are OK as subscribers"** — "OK" needs a measurable answer, not a gut check at month 3. Proposed checklist (all three, not just one):

- subscriber count at or above a target — *proposed 200, roughly matching the Phase A ramp's month-3 pace; confirm or adjust*;
- repeat-purchase rate among those subscribers above a minimum — *proposed 15%*, since raw signups without any repeat behaviour aren't really "OK";
- no material spike in refunds/complaints tied to the fulfilment model (Section 1) itself — a new model with real teething risk, and not something an app should be built on top of if it's still unstable.

If all three hold at month 3, submit to the App Store. If not, keep collecting data and re-check monthly rather than committing the $99/year and the review-process overhead (including the sweepstakes-specific requirements in 6.6 below) on an unproven base.

**Scope, unchanged from the previous version of this plan:** account + Kummies balance/history, push notifications (order status, tombola, Club Drops), browsing/wishlist, checkout via mobile web view rather than full native payment — still lean, still proportionate to how early this is in the fulfilment model's own track record.

### 6.6 A build/ownership note

I can write and build a substantial amount of the actual codebase for both the website and the app — that's work I can do directly. What I can't do on your behalf is anything that requires a real account, payment, or legal registration in KUMMIE's name: domain purchase, hosting/cloud account, the Apple Developer Program and Google Play Console enrolments, the payment gateway/merchant account (needs your actual registered business), and the IOSS/OSS VAT registrations from Section 3. Realistic split: I can be the main engineering resource and produce working code, but those account-and-money steps need to happen on your side, at the points in this plan where they come up.

---

## 7. KUMMIE Club v2 — the full loyalty & rewards strategy

Everything below extends Section 19 of v2 (base earning rule, "Bring your chingu" referral, double-Kummies promo code) rather than replacing it. Retention matters more here than in v2: under the thinner v3 margins, the cost of acquiring an order is a bigger share of a smaller gross profit, so getting a second and third purchase out of the same customer is doing more of the work.

### 7.1 Acquisition — "Bring your chingu" (unchanged from v2 Section 19)
Still the primary purchase-linked acquisition mechanic. No change proposed here.

### 7.2 Minimum spend to earn Kummies — new rule
Not every order should earn points — a €5 sticker order earning the same proportional Kummies as a €50 order, while also carrying disproportionate customs/handling cost (Section 3.2), is a bad trade. *Proposed: a €15 minimum order value (pre-shipping, pre-VAT) to earn any Kummies at all — confirm or adjust.*

### 7.3 Retention — Kummies-for-discount redemption (unchanged from v2 Section 19)
Still Phase 2+, still needs the conversion rate confirmed.

### 7.4 Two different "doubling" campaigns — worth keeping distinct
Your message describes both a points-multiplier promo (already in v2) and what reads like a second, different idea. I've kept them as two separate mechanics rather than merging them, since they cost the business differently:

- **Double Kummies code** (v2, unchanged): a promo code doubles the *Kummies earned* on that order. Cost = extra points liability.
- **Double Redemption code** (new): a promo code doubles the *€ value a member gets when redeeming existing Kummies* — e.g. if 500 Kummies normally = €5 off, the code makes the same 500 Kummies = €10 off. Cost = a one-time discount, not an ongoing points liability, so it's cheaper to run and better suited to a targeted push (e.g. lapsed members, a specific tier) — *"for some users"* in your message reads like this one. Confirm which you meant, or keep both.

### 7.5 KUMMIE Tombola — periodic purchase-linked prize draws
This is the new campaign type from your message, generalised into a repeatable template:

> **Template:** Pre-order / buy [qualifying product or minimum quantity from a specific group] by [deadline] for a chance to win [prize]. Winner(s) drawn at random after the deadline; odds and rules stated plainly at entry.

Your two examples map directly onto this:

- *"Pre-order the latest album from [group] by 15 October — win concert tickets."*
- *"Order at least 3 products from [group] by 30 November — win their official lightstick."*

**Legal framing (this matters, so I checked it rather than assumed it):** the EU's Unfair Commercial Practices Directive doesn't ban purchase-conditional prize draws outright — a 2010 CJEU ruling struck down a French law that tried to ban them categorically, and the UK's own Gambling Act explicitly permits "buy at normal price to enter" draws. So this campaign type is legally sound across the EU, Bulgaria included, **as long as**: the qualifying product's price isn't inflated to cover the prize, the rules and odds are stated clearly, and the promotion never implies the customer has already won (the one pattern EU law does treat as an unfair/aggressive practice).

**The extra thing I'd flag given KUMMIE's audience:** none of that legal analysis changes because entrants might be 14 instead of 24, but the EU's Digital Fairness Act — actively moving through the legislature in 2026 — specifically targets purchase-linked chance mechanics aimed at minors (the "loot box" pattern). It's not clear yet whether a straightforward prize draw like this would be caught, but given a meaningful share of KUMMIE's audience is 13–19, I'd build in self-imposed safeguards now rather than retrofit them later: require entrants to be 18+ (or have parental consent below that), keep frequency to roughly monthly rather than constant, and consider adding a genuine no-purchase-necessary entry route even though EU law doesn't strictly require one — it's a small cost for meaningfully lower regulatory and reputational risk with this specific audience.

**Budget:** prizes here are real cash costs (concert tickets, lightsticks) — this needs its own line, e.g. a fixed monthly tombola budget or a % of that month's revenue. *Not yet sized — needs a number from you.*

### 7.6 Exclusive Exchange — non-KUMMIE items, gated behind a real order
Your requirement: point-redemption exclusives shouldn't be limited to KUMMIE-brand products — periodically feature genuine official (non-KUMMIE) merchandise KUMMIE doesn't normally sell, sourced through the same partner network — **but** redemption is only unlocked alongside a qualifying paid order at or above the free-shipping threshold. This is a clean mechanic: it protects margin (a real, adequately sized order always accompanies a redemption) and pushes AOV toward the free-shipping line, which is a well-worn and effective lever. *Needs the free-shipping threshold value itself — not yet set anywhere in this plan.*

### 7.7 KUMMIE Club Drop — biannual flagship campaign
Twice a year to start (scale to quarterly if the first two perform well): an exclusive link sent to subscribers combining (a) a limited-time points-exchange window and (b) entry into a tombola with **three separate prizes**, run under the same rules as Section 7.5. This is the flagship retention moment — the one where lapsed members are most worth winning back, so it's worth pairing with a Double Redemption code (7.4) for anyone who hasn't ordered recently.

---

## 8. New risks specific to v3

| Risk | Severity | Control |
|---|---|---|
| No quality control before a product reaches the customer (KUMMIE never touches it — except the brief repacking step) | High | Contractual quality SLAs per partner, periodic sample audits, fast partner replacement on review-score drops |
| Partner concentration — losing a key distributor removes catalogue instantly, no buffer stock | High | Multi-source popular SKUs across 2+ distributors where possible (Section 2.1 gives a starting shortlist); maintain a vetted backup list |
| KUMMIE remains the legal seller regardless of who fulfilled the order — returns/warranty liability sits with KUMMIE | High | Indemnification/reimbursement clauses in every partner agreement; a return-handling workflow that doesn't require KUMMIE to hold stock |
| One bulk customs event now carries all of that batch's orders — a held/inspected shipment delays every order in it at once, not just one parcel | Medium/high | DDP-first sourcing policy, standing Bulgarian customs-broker relationship, and keep the batch window short (2–3 days) so any one delay's blast radius stays small |
| The repacking/cross-dock step (Section 1, step 5) is a real physical operation — space, staff, and pick accuracy when splitting one grouped shipment into many individual parcels | Medium/high *(new)* | Even a small dedicated repacking point, a simple pick-and-pack checklist per order, and a barcode/order-number match at repack to prevent mis-sent parcels |
| Tombola mechanics and a partly-minor audience | Medium | Age gate or parental consent on entry, capped frequency, transparent odds, optional free-entry route |
| App investment lands before the core fulfilment model (Section 1) has a full operating track record | Medium | Android ships at launch since the engineering cost is already committed either way (one codebase); iOS specifically is gated on the 3-month subscriber checklist (6.5) rather than committing the Apple-specific cost (fee + review overhead) on an unproven base |

---

## 9. Immediate action list for v3

- Contact the four candidates in Section 2.1 (K-Moon, Koreapopstore, KODY Global, Idol Store) in parallel: request wholesale pricing, minimum order quantities, proof of official licensing, and whether they can support a 2–3 day consolidated batch order.
- Confirm a carrier relationship in Bulgaria, Romania and Greece before accepting orders from any of them (Section 4) — get Poland's confirmed separately before turning that market on.
- Check whether DPD or GLS operate their own entity in all three (soon four) launch countries — one integrated network would be simpler than four separate domestic couriers.
- Set up the Bulgaria repacking/cross-dock point: even a small space, a simple per-order pick checklist, and a way to match each repacked parcel back to its order number.
- Ask each Korea-based candidate directly whether they offer DDP; get a quote from a Bulgarian customs broker as the fallback (Section 3.2).
- Register KUMMIE for IOSS and, separately, for OSS to cover the domestic-EU resale leg once a batch has cleared customs (Section 3.3).
- Identify a POD/dropship OEM partner for KUMMIE Originals.
- Draft the KUMMIE Tombola terms template (rules, odds disclosure, age gate) once, so every future draw just fills in the blanks.
- Reach out to the organisers of Sofia's recurring K-pop club night and the K-pop Cover Dance Festival about a launch-window partnership; do the equivalent research for Romania and Greece before assuming the same approach transfers.
- Set up unique-purchaser tracking now, before Phase A starts, so the 250-purchaser app trigger (6.5) can actually be measured when it matters.
- Shortlist a cross-platform framework (e.g. one codebase for iOS + Android) for the V1 app, given the lean scope and compressed timeline (6.5).

---

## 10. Open questions — need your input

Carried over from v2, still unanswered, and now more consequential given thinner v3 margins:
1. Referral design — hybrid (subscribe + purchase bonus) as written, or exactly as described (reward on 5 subscribes only)?
2. Kummies expiry — 12 months of inactivity as proposed, or no expiry?

New to v3:
3. Minimum order value to earn Kummies — €15 proposed, adjust?
4. Kummies → discount conversion rate — not set anywhere yet (e.g. "500 Kummies = €5")?
5. "Doubling discounts code" — confirm this is the new Double Redemption code (7.4), separate from the existing Double Kummies code, or did you mean the same mechanic?
6. Tombola prize budget — fixed monthly amount, or % of revenue?
7. Free-shipping threshold value — needed to gate Exclusive Exchange (7.6) and it isn't defined anywhere in v2 or v3 yet.
8. Blended gross margin — the 30% base case in Section 6 is an assumption with no partner quotes behind it yet. Worth revisiting as soon as real numbers come in from the action list above.

New to this update:
9. "Commissioned it into separate packs" — I read this as "de-consolidate and repack into individual parcels" (Section 1, step 5). Confirm that's what you meant.
10. Where does the Bulgaria repacking step physically happen — a rented space, a partner's facility, someone's own premises? Not yet answered anywhere in this document, and it's now a real operational dependency.
11. iOS gate — 200 subscribers + 15% repeat-purchase rate + no fulfilment-related complaint spike, all three by month 3, proposed in 6.5. Confirm or adjust the numbers.
