import type {
  Complaint,
  ComplaintRequest,
  ComplaintResolution,
  OrderDetail,
  StaffComplaintInput,
} from "@kummie/contracts";
import { addDays, businessDay, complaintDueOn, complaintNumber, complaintReminderDue } from "@kummie/core";
import { t, type MessageKey } from "@kummie/i18n";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { loadCompanySettings } from "../admin/settings-routes";
import type { Database } from "../db/client";
import { complaints, orderLines, orders } from "../db/schema";
import { toCsv } from "../documents/reports";
import { enqueue } from "../jobs/outbox";
import { orderNumber, type OrderRow, type Tx } from "../shop/basics";

export class ComplaintError extends Error {
  constructor(
    readonly code: "not_found" | "not_allowed",
    message: string,
  ) {
    super(message);
    this.name = "ComplaintError";
  }
}

type Row = typeof complaints.$inferSelect;
type Deps = { db: Database; webUrl: string; kick?: () => void };

/** Orders the customer can complain about: the goods have reached them. */
export const canComplain = (order: Pick<OrderRow, "status">) => order.status === "delivered";

function toComplaint(row: Row, seq: number | null, today: string): Complaint {
  const open = row.status === "open";
  return {
    id: row.id,
    number: complaintNumber(row.seq),
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
    dueOn: row.dueOn,
    overdue: open && today > row.dueOn,
    dueSoon: open && today <= row.dueOn && addDays(today, 7) >= row.dueOn,
    name: row.name,
    email: row.email,
    phone: row.phone,
    orderId: row.orderId,
    orderNumber: seq === null ? null : orderNumber(seq),
    product: row.product,
    description: row.description,
    demand: row.demand,
    channel: row.channel,
    outcome: row.outcome,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** The register: open complaints first (nearest deadline first), then the closed ones. */
export async function listComplaints(db: Database, all: boolean, today = businessDay(new Date())) {
  const rows = await db
    .select({ c: complaints, seq: orders.seq })
    .from(complaints)
    .leftJoin(orders, eq(orders.id, complaints.orderId))
    .where(all ? undefined : eq(complaints.status, "open"))
    .orderBy(sql`${complaints.status} = 'open' desc`, asc(complaints.dueOn), desc(complaints.seq))
    .limit(500);
  return rows.map((r) => toComplaint(r.c, r.seq, today));
}

/** What the customer sees in the order. */
export async function orderComplaints(db: Database, orderId: string): Promise<OrderDetail["complaints"]> {
  const rows = await db
    .select()
    .from(complaints)
    .where(eq(complaints.orderId, orderId))
    .orderBy(asc(complaints.seq));
  return rows.map((r) => ({
    number: complaintNumber(r.seq),
    status: r.status,
    product: r.product,
    dueOn: r.dueOn,
    outcome: r.outcome,
  }));
}

const demandLabel = (locale: "bg" | "en", demand: Row["demand"]) =>
  t(locale, `complaint.demand.${demand}` as MessageKey);

/** The customer's copy with the register number (ЗЗП: a document with the entry number). */
async function queueReceived(deps: Deps, tx: Tx, row: Row) {
  const locale = row.locale;
  const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
  const number = complaintNumber(row.seq);
  const key = `complaint-received:${row.id}`;
  await enqueue(
    tx,
    "email",
    {
      to: row.email,
      subject: t(locale, "email.complaint.subject", { number }),
      text: [
        t(locale, "email.complaint.body", {
          name: row.name,
          number,
          date: businessDay(row.receivedAt),
          product: row.product,
          description: row.description,
          demand: demandLabel(locale, row.demand),
          dueOn: row.dueOn,
        }),
        "",
        t(locale, "email.signoff", { site }),
      ].join("\n"),
      locale,
      category: "transactional",
      idempotencyKey: key,
    },
    key,
  );
}

/** A note to the shop's own mailbox (new complaint or a reminder before the deadline). */
async function queueStaffNote(db: Database | Tx, tx: Tx, key: string, subject: string, text: string) {
  const company = await loadCompanySettings(db as Database);
  if (!company.contactEmail) return;
  await enqueue(
    tx,
    "email",
    { to: company.contactEmail, subject, text, locale: "bg", category: "transactional", idempotencyKey: key },
    key,
  );
}

async function insert(deps: Deps, values: typeof complaints.$inferInsert): Promise<Row> {
  const row = await deps.db.transaction(async (tx) => {
    const [created] = await tx.insert(complaints).values(values).returning();
    if (!created) throw new Error("complaint not stored");
    await queueReceived(deps, tx, created);
    const number = complaintNumber(created.seq);
    await queueStaffNote(
      deps.db,
      tx,
      `complaint-new:${created.id}`,
      `Нова рекламация ${number}`,
      `${number} от ${created.name} (${created.email}): ${created.product}\n\n${created.description}\n\nСрок: ${created.dueOn}. Админ → Рекламации.`,
    );
    return created;
  });
  deps.kick?.();
  return row;
}

/** "Подай рекламация" from the order page: registered at once and confirmed by e-mail. */
export async function fileCustomerComplaint(deps: Deps, order: OrderRow, request: ComplaintRequest) {
  if (!canComplain(order)) throw new ComplaintError("not_allowed", "This order has not reached you yet");
  let product = `${t(order.locale, "order")} ${orderNumber(order.seq)}`;
  if (request.orderLineId) {
    const [line] = await deps.db
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.id, request.orderLineId), eq(orderLines.orderId, order.id)));
    if (!line) throw new ComplaintError("not_found", "No such product in this order");
    product = `${line.title} (${line.version})`;
  }
  const now = new Date();
  return insert(deps, {
    orderId: order.id,
    orderLineId: request.orderLineId,
    name: order.address.name,
    email: order.email,
    phone: order.address.phone,
    product,
    description: request.description,
    demand: request.demand,
    channel: "site",
    locale: order.locale,
    receivedAt: now,
    dueOn: complaintDueOn(businessDay(now)),
    createdBy: "customer",
  });
}

/** A complaint received by e-mail, phone or in person, entered by staff (same register). */
export async function addStaffComplaint(deps: Deps, input: StaffComplaintInput, staffId: string | null) {
  const today = businessDay(new Date());
  if (input.receivedOn > today) throw new ComplaintError("not_allowed", "The day received is in the future");
  let orderId: string | null = null;
  if (input.orderNumber) {
    const digits = /^(?:KUM-)?(\d{1,12})$/i.exec(input.orderNumber)?.[1];
    const [order] = digits
      ? await deps.db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.seq, Number(digits)))
      : [];
    if (!order) throw new ComplaintError("not_found", "No such order");
    orderId = order.id;
  }
  return insert(deps, {
    orderId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    product: input.product,
    description: input.description,
    demand: input.demand,
    channel: input.channel,
    locale: input.locale,
    // Entered the same day: now; entered later: noon of the day it was received (Sofia ≈ UTC+2).
    receivedAt: input.receivedOn === today ? new Date() : new Date(`${input.receivedOn}T10:00:00Z`),
    dueOn: complaintDueOn(input.receivedOn),
    createdBy: `staff:${staffId ?? "unknown"}`,
  });
}

/** Staff close a complaint; the customer gets the outcome by e-mail. */
export async function resolveComplaint(
  deps: Deps,
  id: string,
  resolution: ComplaintResolution,
  actor: string,
) {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(complaints).where(eq(complaints.id, id)).for("update");
    if (!row) throw new ComplaintError("not_found", "No such complaint");
    if (row.status !== "open") throw new ComplaintError("not_allowed", "This complaint is already closed");
    const [closed] = await tx
      .update(complaints)
      .set({
        status: resolution.status,
        outcome: resolution.outcome,
        resolvedAt: new Date(),
        resolvedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, id))
      .returning();
    if (!closed) return;
    const locale = closed.locale;
    const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
    const number = complaintNumber(closed.seq);
    const key = `complaint-closed:${closed.id}`;
    await enqueue(
      tx,
      "email",
      {
        to: closed.email,
        subject: t(locale, "email.complaintClosed.subject", { number }),
        text: [
          t(
            locale,
            resolution.status === "resolved"
              ? "email.complaintClosed.resolved"
              : "email.complaintClosed.rejected",
            { name: closed.name, number, outcome: resolution.outcome },
          ),
          "",
          t(locale, "email.signoff", { site }),
        ].join("\n"),
        locale,
        category: "transactional",
        idempotencyKey: key,
      },
      key,
    );
  });
  deps.kick?.();
}

/** Daily: reminders to the shop 7 days and 1 day before the deadline and on the last day. */
export async function sendComplaintReminders(db: Database, today = businessDay(new Date())): Promise<number> {
  const open = await db.select().from(complaints).where(eq(complaints.status, "open"));
  let sent = 0;
  for (const row of open) {
    const days = complaintReminderDue(row.dueOn, today);
    if (days === null) continue;
    const number = complaintNumber(row.seq);
    await db.transaction((tx) =>
      queueStaffNote(
        db,
        tx,
        `complaint-reminder:${row.id}:${days}`,
        days === 0
          ? `Днес изтича срокът на рекламация ${number}`
          : `Рекламация ${number}: остават ${days} дни`,
        `${number} от ${row.name}: ${row.product}. Срок: ${row.dueOn}. Отговори на клиента и я затвори в Админ → Рекламации.`,
      ),
    );
    sent += 1;
  }
  return sent;
}

const CHANNEL_BG = { site: "Сайт", email: "Имейл", phone: "Телефон", in_person: "На място" } as const;
const STATUS_BG = { open: "Отворена", resolved: "Удовлетворена", rejected: "Отказана" } as const;
const DEMAND_BG = {
  repair: "Ремонт",
  replacement: "Замяна",
  price_reduction: "Намаляване на цената",
  refund: "Връщане на парите",
} as const;

/** The whole register as CSV (for the accountant or a КЗП inspection). */
export async function complaintsCsv(db: Database): Promise<string> {
  const rows = await db
    .select({ c: complaints, seq: orders.seq })
    .from(complaints)
    .leftJoin(orders, eq(orders.id, complaints.orderId))
    .orderBy(asc(complaints.seq));
  return toCsv([
    [
      "№",
      "Дата",
      "Клиент",
      "Имейл",
      "Телефон",
      "Поръчка",
      "Стока",
      "Описание",
      "Претенция",
      "Начин",
      "Срок",
      "Статус",
      "Решение",
      "Дата на решението",
    ],
    ...rows.map(({ c, seq }) => [
      complaintNumber(c.seq),
      businessDay(c.receivedAt),
      c.name,
      c.email,
      c.phone,
      seq === null ? null : orderNumber(seq),
      c.product,
      c.description,
      DEMAND_BG[c.demand],
      CHANNEL_BG[c.channel],
      c.dueOn,
      STATUS_BG[c.status],
      c.outcome,
      c.resolvedAt ? businessDay(c.resolvedAt) : null,
    ]),
  ]);
}
