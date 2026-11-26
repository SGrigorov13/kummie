# M2 — Operations: supplier batches, the Bulgaria hub and couriers

Status: **in progress** (started 2026-11-26). Builds on M1. Real partners (distributor, couriers)
are not contracted yet, so M2 runs end to end with **test partners**: a test supplier that writes
purchase orders to a folder and a test courier with PDF labels and simulated tracking. The real
adapters replace them without changing the flow.

## За собственика (накратко на български)

**Какво носи M2 за бизнеса:** пътят на поръчката след плащането става автоматичен и видим:

1. Платена поръчка влиза в **сборната поръчка** на доставчика (за всеки продукт е записано от
   кой доставчик го взимаме и на каква цена).
2. В определени дни (предложение: понеделник, сряда и петък в 12:00) сборната поръчка се
   **затваря сама** и заминава към доставчика като файл (CSV) — една поръчка вместо десетки.
3. Когато доставчикът изпрати, отбелязваш „Изпратена“ (с номер за проследяване, ако има).
4. В **пункта в България**: сканираш или броиш получените бройки. Системата показва липси.
5. **Опаковане:** за всяка клиентска поръчка виждаш какво да сложиш в кашона; сканираш всеки
   продукт (грешен продукт се отказва веднага), натискаш „Етикет“ и принтираш етикета на куриера.
6. **Предаване на куриера:** сканираш етикета — поръчката става „Предадена на куриер“.
7. Системата сама проверява куриера и отбелязва „Доставя се“ и „Доставена“.

**На всяка стъпка клиентът получава имейл** (concept v3 §1a). Ти виждаш всичко в Админ →
Сборни поръчки и Пункт България.

**Пример:** Мария поръчва албум във вторник. В сряда в 12:00 сборната поръчка към K-Moon се
затваря с 14 албума от 9 поръчки и заминава. В петък пратката пристига в пункта: Иван сканира 14
албума, после опакова поръчката на Мария, принтира етикета и я предава на куриера. В събота
Мария получава „Доставена“.

**Какво още НЕ е в M2:** истинските Speedy/Econt и доставчикът (след договорите), избор на
офис/автомат в касата (идва с истинските куриери — тестовият вече има списък), частично връщане
на пари при липси и връщане на стока по отказ (следваща част на M2).

---

## A. Decisions (proposals — the owner confirms or changes them)

| # | Topic | Proposal | Status |
|---|---|---|---|
| B1 | **When batches close** | Per supplier schedule; default **Mon, Wed, Fri at 12:00 Sofia time** (every 2–3 days, concept §1). Changeable per supplier in the admin. | Proposed |
| B2 | **Minimum order value** | Per supplier, default **0**. If set and not reached, the batch waits for the next closing time — at most once, then it goes anyway so customers never wait more than ~5 days. | Proposed |
| B3 | **Which supplier for a product** | Each variant has one or more **offers** (supplier, supplier SKU, cost). The cheapest active offer wins; staff can deactivate an offer. A paid order with a product without an offer stays "paid" and is shown as a problem. | Proposed |
| B4 | **Hub address** | Entered in Admin → Сборни поръчки → Пункт (name, address); used as "deliver to" on purchase orders. | Owner fills in |
| B5 | **Short deliveries** | When the hub receives fewer units than ordered, the affected orders stay at "Изпратена от доставчика" and appear under "Липси" for staff to decide (wait, cancel the line and refund — refund of a part comes with returns). | Proposed |
| B6 | **Carrier per country** | One carrier per destination country, chosen in config; until contracts every country uses the test courier. | Proposed |
| B7 | **Parcel weight** | Products have no weight yet; the packer types the weight (default 0.5 kg per item). A weight field on variants comes with the real couriers. | Proposed |
| B8 | **Labels** | A6 PDF (105 × 148 mm), the usual thermal label size; the browser prints it. | Proposed |
| B9 | **Scanners** | Any USB barcode scanner that types the code and Enter; the screens also accept typing. Product codes: our SKU or the supplier SKU. | Decided |
| B10 | **Order status from batches** | An order moves only when **all** its lines have moved: batched → ordered from supplier → supplier shipped → received at hub. One order can be in batches of several suppliers. | Decided |

## B. Tasks

1. **Data model** (migration 0006): `suppliers` (schedule, minimum, DDP, PO e-mail), `supplier_offers`
   (variant ↔ supplier SKU and cost), `batches` (one open batch per supplier, closing time,
   PO reference `PO-YYYY-NNNN`, supplier reference, shipped/received times, extra landed cost),
   `batch_lines` (one per order line), `parcels` (carrier, tracking number, label PDF, weight,
   status, times) and `parcel_items`; `operations` setting with the hub address.
2. **Core rules** (`packages/core/src/batches.ts`): closing schedule, consolidated PO lines, PO CSV,
   landed-cost allocation, order progress from its batches. *(done: schedule, CSV, landed cost)*
3. **Test partners**: `FileSupplierAdapter` (PO CSV to `PO_OUTBOX_DIR`), `FakeCarrier` (labels,
   simulated tracking, offices and lockers). *(done)*
4. **Operations job** in the tick (every 5 minutes): put paid orders into batches, close due
   batches and send purchase orders, poll tracking of parcels with the courier. Each step is
   idempotent; status e-mails go through the outbox.
5. **Admin → Сборни поръчки** (role admin): suppliers and their schedule, offers per product,
   hub address; open/closed batches with their lines, "Close now", "Shipped by supplier".
6. **Admin → Пункт България** (roles admin, hub): receive a batch by scanning; packing queue;
   pack an order by scanning, weight, create label, print; hand over by scanning the label.
7. **Customer side**: order page shows the tracking number and link once handed to the courier.
8. Tests: core unit tests; database tests for the whole path paid → delivered with the test
   partners.

## C. Definition of done

- A paid test order goes through every step to "delivered" using only the admin screens and the
  tick, with one e-mail per customer step.
- Nothing contains customer personal data on the way to the supplier (purchase orders list only
  products and quantities).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (with the database) and `pnpm build` pass.
