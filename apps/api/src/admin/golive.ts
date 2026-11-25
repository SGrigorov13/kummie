import type { NapUpdate, SalesReadiness } from "@kummie/contracts";
import {
  allGreen,
  businessDay,
  checkoutMode,
  goLiveConditions,
  LEGAL_PAGE_IDS,
  napUpdateDaysLeft,
  napUpdateDueOn,
  type LegalPageId,
  type NapUpdateKind,
} from "@kummie/core";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { settings } from "../db/schema";
import { loadCompanySettings } from "./settings-routes";

/** What the gate needs to know about the running server. */
export type RuntimeInfo = { paymentProvider: string; emailTransport: string };

/** The running payment provider and e-mail transport, from the shop's adapters. */
export function runtimeOf(deps: { payments: { name: string }; email: { name: string } }): RuntimeInfo {
  return { paymentProvider: deps.payments.name, emailTransport: deps.email.name };
}

type SalesState = { enabled: boolean; changedAt: string | null; changedBy: string | null };
type StoredNapUpdate = {
  id: string;
  kind: NapUpdateKind;
  changedOn: string;
  note: string | null;
  submittedOn: string | null;
};

const KEYS = {
  sales: "sales",
  legal: "legal_pages",
  nap: "nap_updates",
  provider: "last_payment_provider",
} as const;

export async function readSetting<T>(db: Database, key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return (row?.value as T | undefined) ?? fallback;
}

export async function writeSetting(db: Database, key: string, value: unknown, staffId: string | null) {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now, updatedBy: staffId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now, updatedBy: staffId } });
}

export const readNapUpdates = (db: Database) => readSetting<StoredNapUpdate[]>(db, KEYS.nap, []);
export const writeNapUpdates = (db: Database, list: StoredNapUpdate[], staffId: string | null) =>
  writeSetting(db, KEYS.nap, list, staffId);
export const readLegalApproved = (db: Database) =>
  readSetting<Partial<Record<LegalPageId, string | null>>>(db, KEYS.legal, {});
export const writeLegalApproved = (
  db: Database,
  value: Partial<Record<LegalPageId, string | null>>,
  staffId: string | null,
) => writeSetting(db, KEYS.legal, value, staffId);
export const writeSalesState = (db: Database, value: SalesState, staffId: string | null) =>
  writeSetting(db, KEYS.sales, value, staffId);

/**
 * A change of payment provider is a change to the facts declared in Приложение № 33: when the
 * running provider differs from the last one seen, a 7-day reminder is added automatically.
 */
async function noticeProviderChange(db: Database, runtime: RuntimeInfo, today: string) {
  const last = await readSetting<string | null>(db, KEYS.provider, null);
  if (last === runtime.paymentProvider) return;
  await writeSetting(db, KEYS.provider, runtime.paymentProvider, null);
  // The first provider ever seen, or the test provider, is not a declared fact.
  if (last === null || runtime.paymentProvider === "fake") return;
  const list = await readNapUpdates(db);
  list.push({
    id: `auto-${today}-${runtime.paymentProvider}`,
    kind: "payment_provider",
    changedOn: today,
    note: `${last} → ${runtime.paymentProvider}`,
    submittedOn: null,
  });
  await writeNapUpdates(db, list, null);
}

/** The gate as the admin page and checkout see it. */
export async function loadSalesReadiness(
  db: Database,
  runtime: RuntimeInfo,
  now = new Date(),
): Promise<SalesReadiness> {
  const today = businessDay(now);
  await noticeProviderChange(db, runtime, today);
  const [company, legal, sales, napList] = await Promise.all([
    loadCompanySettings(db),
    readLegalApproved(db),
    readSetting<SalesState>(db, KEYS.sales, { enabled: false, changedAt: null, changedBy: null }),
    readNapUpdates(db),
  ]);
  const conditions = goLiveConditions({
    company,
    today,
    paymentProvider: runtime.paymentProvider,
    emailTransport: runtime.emailTransport,
    legalApproved: legal,
  });
  const green = allGreen(conditions);
  const napUpdates: NapUpdate[] = napList
    .map((u) => ({
      ...u,
      dueOn: napUpdateDueOn(u.changedOn),
      daysLeft: napUpdateDaysLeft(u.changedOn, today),
    }))
    .toSorted((a, b) => b.changedOn.localeCompare(a.changedOn));
  return {
    enabled: sales.enabled,
    mode: checkoutMode(sales.enabled, runtime.paymentProvider, green),
    canEnable: green,
    conditions,
    legalApproved: Object.fromEntries(LEGAL_PAGE_IDS.map((p) => [p, legal[p] ?? null])) as Record<
      LegalPageId,
      string | null
    >,
    napUpdates,
    changedAt: sales.changedAt,
  };
}
