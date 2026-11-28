import type { AdminReturn, ReturnDecisionInput, ReturnRequest } from "@kummie/contracts";
import { businessDay, formatMoney, refundOfUnits, returnNumber, returnRefundDueOn } from "@kummie/core";
import { t } from "@kummie/i18n";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { loadCompanySettings } from "../admin/settings-routes";
import type { Database } from "../db/client";
import { orderLines, orders, returnLines, returns } from "../db/schema";
import { enqueue } from "../jobs/outbox";
import { readHubAddress } from "../operations/service";
import { orderNumber, type OrderRow, type Tx } from "../shop/basics";
import { orderLink, type ShopDeps } from "../shop/orders";
import { PartialRefundError, refundUnits } from "../shop/partial-refund";
import { withdrawalInfo } from "./view";

export class ReturnError extends Error {
  constructor(
    readonly code: "not_found" | "not_allowed" | "refund_failed",
    message: string,
  ) {
    super(message);
    this.name = "ReturnError";
  }
}

type Deps = Pick<ShopDeps, "db" | "webUrl" | "kick">;
const COURIER = { speedy: "Speedy", econt: "Еконт", boxnow: "BoxNow" } as const;

/**
 * The customer withdraws (ЗЗП чл. 50): the units and the courier are recorded with a return number,
 * the customer gets the confirmation with the hub address on a durable medium (e-mail), the shop
 * mailbox a note.
 */
export async function requestReturn(deps: Deps, order: OrderRow, request: ReturnRequest) {
  const { db } = deps;
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const info = await withdrawalInfo(db, order, lines);
  if (!info) throw new ReturnError("not_allowed", "The 14 days to withdraw are over");
  const wanted = new Map<string, number>();
  for (const l of request.lines) wanted.set(l.orderLineId, (wanted.get(l.orderLineId) ?? 0) + l.qty);
  for (const [lineId, qty] of wanted) {
    const can = info.lines.find((l) => l.orderLineId === lineId)?.returnableQty ?? 0;
    if (qty > can) throw new ReturnError("not_allowed", "More units than can be returned");
  }
  const hub = await readHubAddress(db);
  const company = await loadCompanySettings(db);
  const today = businessDay(new Date());
  await db.transaction(async (tx) => {
    const [ret] = await tx
      .insert(returns)
      .values({
        orderId: order.id,
        courier: request.courier,
        reason: request.reason,
        refundDueOn: returnRefundDueOn(today),
      })
      .returning();
    if (!ret) throw new Error("return not stored");
    await tx
      .insert(returnLines)
      .values([...wanted].map(([orderLineId, qty]) => ({ returnId: ret.id, orderLineId, qty })));
    const number = returnNumber(ret.seq);
    const locale = order.locale;
    const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
    const items = [...wanted]
      .map(([id, qty]) => {
        const line = lines.find((l) => l.id === id);
        return `- ${line?.title} (${line?.version}) × ${qty}`;
      })
      .join("\n");
    const address = hub ? `${hub.name}\n${hub.line1}\n${hub.postcode} ${hub.city}\nБългария / Bulgaria` : "—";
    const key = `return-requested:${ret.id}`;
    await enqueue(
      tx,
      "email",
      {
        to: order.email,
        subject: t(locale, "email.return.subject", { number, order: orderNumber(order.seq) }),
        text: [
          t(locale, "email.return.body", {
            name: order.address.name,
            number,
            order: orderNumber(order.seq),
            items,
            courier: COURIER[request.courier],
            address,
            refundDueOn: ret.refundDueOn,
          }),
          "",
          t(locale, "email.signoff", { site }),
        ].join("\n"),
        locale,
        category: "transactional",
        idempotencyKey: key,
        cta: { label: t(locale, "email.cta.order"), url: orderLink(deps, order) },
      },
      key,
    );
    if (company.contactEmail) {
      const note = `return-new:${ret.id}`;
      await enqueue(
        tx,
        "email",
        {
          to: company.contactEmail,
          subject: `Отказ ${number} по поръчка ${orderNumber(order.seq)}`,
          text: `${order.address.name} се отказва от:\n${items}\n\nКуриер: ${COURIER[request.courier]}. Парите трябва да са върнати до ${ret.refundDueOn}. Пункт България → Връщания.`,
          locale: "bg",
          category: "transactional",
          idempotencyKey: note,
        },
        note,
      );
    }
  });
  deps.kick?.();
}

/** Пункт България → Връщания: open ones first (nearest refund deadline first). */
export async function listReturns(db: Database, today = businessDay(new Date())): Promise<AdminReturn[]> {
  const rows = await db
    .select({ r: returns, o: orders })
    .from(returns)
    .innerJoin(orders, eq(orders.id, returns.orderId))
    .orderBy(
      sql`${returns.status} in ('requested', 'received') desc`,
      asc(returns.refundDueOn),
      desc(returns.seq),
    )
    .limit(200);
  if (rows.length === 0) return [];
  const lines = await db
    .select({ rl: returnLines, line: orderLines })
    .from(returnLines)
    .innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId))
    .where(
      inArray(
        returnLines.returnId,
        rows.map((r) => r.r.id),
      ),
    );
  const orderIds = [...new Set(rows.map((r) => r.o.id))];
  const allLines = await db.select().from(orderLines).where(inArray(orderLines.orderId, orderIds));
  return rows.map(({ r, o }) => {
    const mine = lines.filter((l) => l.rl.returnId === r.id);
    const accepted = mine.filter((l) => l.rl.decision === "accepted");
    const left = allLines.filter((l) => l.orderId === o.id).reduce((s, l) => s + l.qty - l.refundedQty, 0);
    const acceptedUnits = accepted.reduce((s, l) => s + l.rl.qty, 0);
    const goods = accepted.reduce((s, l) => {
      const room = l.line.qty - l.line.refundedQty;
      return s + (l.rl.qty <= room ? refundOfUnits(l.line, l.rl.qty).totalCents : 0);
    }, 0);
    const open = r.status === "requested" || r.status === "received";
    return {
      id: r.id,
      number: returnNumber(r.seq),
      status: r.status,
      orderId: o.id,
      orderNumber: orderNumber(o.seq),
      name: o.address.name,
      email: o.email,
      courier: r.courier,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      refundDueOn: r.refundDueOn,
      overdue: open && today > r.refundDueOn,
      receivedAt: r.receivedAt?.toISOString() ?? null,
      lines: mine.map((l) => ({
        id: l.rl.id,
        title: l.line.title,
        version: l.line.version,
        sku: l.line.sku,
        qty: l.rl.qty,
        unitPriceCents: l.line.unitPriceCents,
        decision: l.rl.decision,
        refuseReason: l.rl.refuseReason,
        disposition: l.rl.disposition,
      })),
      refundCents: goods + (open && acceptedUnits > 0 && acceptedUnits === left ? o.shippingCents : 0),
    };
  });
}

async function loadReturn(db: Database | Tx, id: string) {
  const [ret] = await db.select().from(returns).where(eq(returns.id, id));
  if (!ret) throw new ReturnError("not_found", "No such return");
  return ret;
}

/** The parcel reached the hub. */
export async function markReturnReceived(db: Database, id: string) {
  const ret = await loadReturn(db, id);
  if (ret.status !== "requested") throw new ReturnError("not_allowed", "This return is not on its way");
  await db
    .update(returns)
    .set({ status: "received", receivedAt: new Date(), updatedAt: new Date() })
    .where(eq(returns.id, id));
}

/** Staff check each line: accepted, or refused with the reason; and what happens to the goods. */
export async function decideReturn(db: Database, id: string, input: ReturnDecisionInput) {
  const ret = await loadReturn(db, id);
  if (ret.status !== "received") throw new ReturnError("not_allowed", "Check the parcel after it arrives");
  const lines = await db.select().from(returnLines).where(eq(returnLines.returnId, id));
  for (const decision of input.lines) {
    if (!lines.some((l) => l.id === decision.id))
      throw new ReturnError("not_found", "No such line in this return");
    if (decision.decision === "refused" && !decision.refuseReason)
      throw new ReturnError("not_allowed", "A refused line needs the reason");
  }
  await db.transaction(async (tx) => {
    for (const d of input.lines) {
      await tx
        .update(returnLines)
        .set({
          decision: d.decision,
          refuseReason: d.decision === "refused" ? d.refuseReason : null,
          disposition: d.disposition,
        })
        .where(eq(returnLines.id, d.id));
    }
    await tx.update(returns).set({ updatedAt: new Date() }).where(eq(returns.id, id));
  });
}

/** The customer's e-mail when the return is closed (refunded in part or refused). */
async function queueClosedEmail(
  deps: Deps,
  tx: Tx,
  order: OrderRow,
  ret: typeof returns.$inferSelect,
  amountCents: number,
  documentIds: string[],
) {
  const refused = await tx
    .select({
      title: orderLines.title,
      version: orderLines.version,
      qty: returnLines.qty,
      why: returnLines.refuseReason,
    })
    .from(returnLines)
    .innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId))
    .where(and(eq(returnLines.returnId, ret.id), eq(returnLines.decision, "refused")));
  const locale = order.locale;
  const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
  const number = returnNumber(ret.seq);
  const refusedText = refused.map((r) => `- ${r.title} (${r.version}) × ${r.qty}: ${r.why}`).join("\n");
  const key = `return-closed:${ret.id}`;
  await enqueue(
    tx,
    "email",
    {
      to: order.email,
      subject: t(locale, "email.returnClosed.subject", { number }),
      text: [
        amountCents > 0
          ? t(locale, "email.returnClosed.refunded", {
              name: order.address.name,
              number,
              amount: formatMoney(amountCents, locale),
            })
          : t(locale, "email.returnClosed.rejected", { name: order.address.name, number }),
        refused.length > 0 ? `\n${t(locale, "email.returnClosed.refusedLines")}\n${refusedText}` : "",
        "",
        t(locale, "email.signoff", { site }),
      ].join("\n"),
      locale,
      category: "transactional",
      idempotencyKey: key,
      cta: { label: t(locale, "email.cta.order"), url: orderLink(deps, order) },
      ...(documentIds.length > 0 ? { documentIds } : {}),
    },
    key,
  );
}

/**
 * "Прието, върни парите" (D-064): every line decided; the accepted ones are refunded to the card
 * with storno / credit note (delivery too when nothing is left — the law's "original delivery"),
 * the refused ones are explained. Nothing accepted: the return closes as refused.
 */
export async function refundReturn(shop: ShopDeps, id: string, actor: string) {
  const ret = await loadReturn(shop.db, id);
  if (ret.status !== "received") throw new ReturnError("not_allowed", "The parcel has not been received");
  const lines = await shop.db.select().from(returnLines).where(eq(returnLines.returnId, id));
  if (lines.some((l) => l.decision === "pending"))
    throw new ReturnError("not_allowed", "Check every line first");
  const accepted = lines.filter((l) => l.decision === "accepted");
  if (accepted.length === 0) {
    await shop.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, ret.orderId));
      await tx
        .update(returns)
        .set({ status: "rejected", closedAt: new Date(), closedBy: actor, updatedAt: new Date() })
        .where(eq(returns.id, id));
      if (order) await queueClosedEmail(shop, tx, order, ret, 0, []);
    });
    shop.kick?.();
    return;
  }
  try {
    await refundUnits(shop, {
      orderId: ret.orderId,
      items: accepted.map((l) => ({ orderLineId: l.orderLineId, qty: l.qty })),
      reason: "withdrawal",
      idempotencyKey: `refund:return:${ret.id}`,
      actor,
      documentReason: "отказ от договора от разстояние (чл. 50 ЗЗП)",
      onRecorded: async ({ tx, order, refundId, amountCents, whole, documentIds }) => {
        await tx
          .update(returns)
          .set({ status: "refunded", refundId, closedAt: new Date(), closedBy: actor, updatedAt: new Date() })
          .where(eq(returns.id, id));
        // When nothing is left, the "refunded" status e-mail with the documents already went out.
        if (!whole) await queueClosedEmail(shop, tx, order, ret, amountCents, documentIds);
      },
    });
  } catch (error) {
    if (error instanceof PartialRefundError) throw new ReturnError(error.code, error.message);
    throw error;
  }
}
