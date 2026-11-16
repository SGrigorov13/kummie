import { and, eq, inArray, sql } from "drizzle-orm";
import type { EmailAdapter, EmailMessage } from "../adapters/email";
import type { Database } from "../db/client";
import { addresses, customers, customerSessions, customerTokens, jobs } from "../db/schema";
import type { JobHandler } from "../jobs/outbox";

/**
 * GDPR Art. 17: removes the personal data of a closed account. The row stays (orders and sales
 * documents will point to it and must be kept for accounting), but without e-mail, name, date of
 * birth, password or addresses. Consent history keeps only the customer id. Safe to run twice.
 */
export async function eraseCustomer(db: Database, customerId: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(customers).where(eq(customers.id, customerId));
    if (!row || row.erasedAt || !row.deletedAt) return;
    // Queued e-mails still holding the address (except the "account closed" confirmation).
    await tx
      .update(jobs)
      .set({ payload: {}, status: "failed", lastError: "account erased" })
      .where(
        and(
          eq(jobs.kind, "email"),
          inArray(jobs.status, ["pending", "running"]),
          sql`${jobs.payload}->>'to' = ${row.email}`,
          sql`${jobs.idempotencyKey} <> ${`deleted:${customerId}`}`,
        ),
      );
    await tx.delete(addresses).where(eq(addresses.customerId, customerId));
    await tx.delete(customerSessions).where(eq(customerSessions.customerId, customerId));
    await tx.delete(customerTokens).where(eq(customerTokens.customerId, customerId));
    await tx
      .update(customers)
      .set({
        email: `erased-${customerId}@invalid.kummie`,
        name: "",
        passwordHash: "",
        birthDate: null,
        erasedAt: now,
        updatedAt: now,
      })
      .where(eq(customers.id, customerId));
  });
}

/** Background job handlers for accounts and e-mail. */
export function accountJobHandlers(email: EmailAdapter): Record<string, JobHandler> {
  return {
    email: async (payload) => {
      const result = await email.send(payload as unknown as EmailMessage);
      if (!result.accepted) throw new Error("e-mail not accepted");
    },
    account_erasure: async (payload, { db, now }) => {
      await eraseCustomer(db, String(payload.customerId), now);
    },
  };
}
