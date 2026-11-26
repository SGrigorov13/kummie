# M2 — Operations: supplier batches, the Bulgaria hub and couriers

Status: **in progress** (started 2026-11-26). Builds on M1. Real partners (distributor, couriers)
are not contracted yet, so M2 runs end to end with **test partners**: a test supplier that writes
purchase orders to a folder and a test courier with PDF labels and simulated tracking. The real
adapters replace them without changing the flow.

## За собственика (накратко на български)

**Какво носи M2 за бизнеса:** пътят на поръчката след плащането става автоматичен и видим:

1. Платена поръчка влиза в **сборната поръчка** на доставчика (за всеки продукт е записано от
   кой доставчик го взимаме и на каква цена).
2. В понеделник и четвъртък в 08:30 сборната поръчка се **затваря сама** и системата подготвя
   файла (CSV) за доставчика — една поръчка вместо десетки. Ти я сваляш, изпращаш я по имейл и
   отбелязваш „Изпратих я“ (решение D-063).
3. Когато доставчикът изпрати, отбелязваш „Изпратена“ (с номер за проследяване, ако има).
4. В **пункта в България**: сканираш или броиш получените бройки. Системата показва липси.
5. **Опаковане:** за всяка клиентска поръчка виждаш какво да сложиш в кашона; сканираш всеки
   продукт (грешен продукт се отказва веднага), натискаш „Етикет“ и принтираш етикета на куриера.
6. **Предаване на куриера:** сканираш етикета — поръчката става „Предадена на куриер“.
7. Системата сама проверява куриера и отбелязва „Доставя се“ и „Доставена“.

**На всяка стъпка клиентът получава имейл** (concept v3 §1a). Ти виждаш всичко в Админ →
Сборни поръчки и Пункт България.

**Пример:** Мария поръчва албум във вторник. В четвъртък в 08:30 сборната поръчка към K-Moon се
затваря с 14 албума от 9 поръчки; ти я пращаш на доставчика. Следващата седмица пратката пристига
в пункта: разпределителят сканира 14 албума, опакова поръчката на Мария, принтира етикета и я
предава на куриера. На следващия ден Мария получава „Доставена“.

**Какво още НЕ е в M2:** истинските Speedy/Econt и доставчикът (след договорите), избор на
офис/автомат в касата (идва с истинските куриери — тестовият вече има списък), частично връщане
на пари при липси и връщане на стока по отказ (следваща част на M2).

---

## A. Decisions (owner answers 2026-11-26: D-063, D-064)

| # | Topic | Decision | Status |
|---|---|---|---|
| B1 | **When batches close** | Per supplier schedule; default **Mon and Thu at 08:30 Sofia time** while orders are few; no holiday calendar (the owner posts a notice on delays and can close or postpone by hand). Launch with European distributors only. | Decided, built |
| B2 | **Minimum order value** | Per supplier, default 0. Below it the batch waits for the next closing, **at most 7 days past its first closing time**, then goes anyway. | Decided, built |
| B3 | **Which supplier for a product** | Offers per variant (supplier, supplier SKU, cost). **EU supplier first**, then the cheapest. Offers by hand or **price-list import (CSV)**; roles admin and content; costs never shown to customers. **No offer → cannot publish**; all offers inactive → **"Няма наличност"**, cart refuses it. | Decided, built |
| B4 | **Hub** | The address of „СГ Корпорейшън“ ЕООД, entered in Admin → Сборни поръчки → Пункт; the owner or a distributor (role hub) receives, splits and ships. **Also the return address.** | Decided; owner enters the address |
| B5 | **Short, damaged, extra units** | Short or damaged: ask the supplier (photo and claim if damaged); without the units within 3 working days the customer gets the rest plus a partial refund and credit note (staff confirm the refund, Q25). Extra units: recorded, owner decides. | Decided; refund flow in part 2 |
| B6 | **Couriers** | **Speedy, Econt, BoxNow**; address, office and locker from day one; prices per country, courier and method — set with the courier offers. Test courier until then. | Decided; contracts pending |
| B7 | **Parcel weight** | The packer types the weight for now; box sizes not known yet. | Decided |
| B8 | **Labels, printer, scanner** | **Ordinary A4 printer, no scanner** at the start (D-065): items confirmed with "+1" on the packing screen, hand-over by click; the courier's label PDF prints on A4. Parcel contents: **A4 packing list** (customer's language, warnings, return address, withdrawal) + thank-you card or sticker (design separate). Thermal printer and USB scanner above ~5 parcels a day. | Decided, built |
| B9 | **Scanners** | Any USB barcode scanner that types the code and Enter; the screens also accept typing. Product codes: our SKU or the supplier SKU. | Decided (scanner optional, see B8) |
| B10 | **Order status from batches** | An order moves only when **all** its lines have moved: batched → ordered from supplier → supplier shipped → received at hub. One order can be in batches of several suppliers. | Decided |

## B. Tasks

1. **Data model** (migration 0006): `suppliers` (schedule, minimum, DDP, PO e-mail), `supplier_offers`
   (variant ↔ supplier SKU and cost), `batches` (one open batch per supplier, closing time,
   PO reference `PO-YYYY-NNNN`, supplier reference, shipped/received times, extra landed cost),
   `batch_lines` (one per order line, with the units counted at the hub), `parcels` (carrier,
   tracking number, label PDF, weight, status, times; one parcel per order for now);
   `operations` setting with the hub address. *(done, migration 0006)*
2. **Core rules** (`packages/core/src/batches.ts`): closing schedule, consolidated PO lines, PO CSV,
   landed-cost allocation, order progress from its batches. *(done)*
3. **Test partners**: `FileSupplierAdapter` (PO CSV to `PO_OUTBOX_DIR`), `FakeCarrier` (labels,
   simulated tracking, offices and lockers). *(done)*
4. **Operations job** in the tick (every 5 minutes): put paid orders into batches, close due
   batches and send purchase orders, poll tracking of parcels with the courier. Each step is
   idempotent; status e-mails go through the outbox. *(done; also "Пусни сега" in the admin)*
5. **Admin → Сборни поръчки** (role admin): suppliers and their schedule, offers per product,
   hub address; open/closed batches with their lines, "Close now", "Shipped by supplier". *(done)*
6. **Admin → Пункт България** (roles admin, hub): receive a batch by scanning; packing queue;
   pack an order by scanning, weight, create label, print; hand over by scanning the label. *(done)*
7. **Customer side**: order page shows the tracking number once packed. *(done; carrier tracking
   links come with the real couriers)*
8. Tests: core unit tests; database tests for the whole path paid → delivered with the test
   partners. *(done)*
9. **Owner decisions B1–B8 (D-063)** *(done, migration 0007)*: schedule with minutes (Mon and Thu
   08:30); the 7-day minimum wait (`first_closes_at`); EU suppliers first (`in_eu`); purchase
   orders sent by staff (`auto_send` off: download `PO-….csv`, then "I sent it" → ordered); offers
   for the content role and price-list import; the supplier-offer publishing gate and
   "out of stock" when every offer is inactive.

## B2. Next part of M2 (owner answers D-064)

10. **Missing and damaged units:** "Липси" list after receiving; claim to the supplier with photo;
    after 3 working days staff **confirm** the partial refund (card refund through the payment
    adapter, credit note, Kummies re-counted per D-032) and the customer gets an e-mail; the rest
    of the order ships.
11. **Withdrawal and returns:** "Откажи се" in the customer's order up to 14 days after delivery,
    choice of products; return form with the customer's courier choice and the minimum fee
    (amounts with the courier prices); refund when staff accept the parcel at the hub; per-product
    decision what happens to the goods (back to the supplier / kept).
12. **Complaints register (ЗЗП):** number, received date, one-month deadline, reminders, outcome.
13. **Split shipments:** an order whose parts reach the hub more than 3 days apart ships in parts.
14. **Calculated delivery estimate:** next closing + supplier transit days + courier days per
    country; staff enter the transit days; shown on the product page and in the cart.
15. **Office/locker on a map** at checkout (courier map widget loaded only when opened, consent
    rules for third-party scripts; searchable list as fallback) — with the real courier adapters.
16. **Delivery prices per country, courier and method** (D-063 B6) — when the offers arrive.
17. **Packing list** printed with each parcel (products, safety information and warnings in the customer's language, return address, withdrawal steps). *(done, D-065: `GET /admin-api/hub/orders/:id/packing-slip`, printed from Пункт България → Опаковане)*
18. **Landed cost and margin report:** transport and duties per supplier shipment at receiving,
    margin per product and order, export for the ERP.
19. **Order ratings:** the customer rates a delivered order — with an account or as a guest through the link to the order (D-066); staff see low ratings at once to make
    it right. Compensation never depends on the rating; no bought or filtered ratings; public
    display only with a note on how they are checked; never on Teen routes.
20. **Real adapters** for Speedy, Econt, BoxNow and the supplier once the contracts exist.

## C. Definition of done

- A paid test order goes through every step to "delivered" using only the admin screens and the
  tick, with one e-mail per customer step.
- Nothing contains customer personal data on the way to the supplier (purchase orders list only
  products and quantities).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (with the database) and `pnpm build` pass.
