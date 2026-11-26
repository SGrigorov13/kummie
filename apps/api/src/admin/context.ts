import type { Staff, StaffRole } from "@kummie/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt } from "drizzle-orm";
import type { StorageAdapter } from "../adapters/storage";
import type { SecretBox } from "../auth/crypto";
import type { OperationsDeps } from "../operations/service";
import { sha256 } from "../auth/crypto";
import type { Database } from "../db/client";
import { auditLog, staffSessions, staffUsers } from "../db/schema";
import type { ShopDeps } from "../shop/orders";

export const STAFF_COOKIE = "kummie_staff";
export const SESSION_HOURS = 12;

export type AdminDeps = {
  db: Database;
  secretBox: SecretBox;
  /** Origins allowed to call the staff API with cookies (the admin app). */
  allowedOrigins: string[];
  /** Secure cookies everywhere except local http development. */
  cookieSecure: boolean;
  /** Orders, refunds and e-mails; the order screens are on only when the shop is configured. */
  shop?: ShopDeps;
  /** Product photo files (disk on the hosting); the photo screens are on only when set. */
  storage?: StorageAdapter;
  /** Suppliers, batches and the hub (M2); on only together with the shop. */
  operations?: OperationsDeps;
};

declare module "fastify" {
  interface FastifyRequest {
    staff: Staff | null;
  }
}

/** Loads the staff member behind the session cookie, or null. */
export async function staffFromRequest(db: Database, request: FastifyRequest): Promise<Staff | null> {
  const token = request.cookies[STAFF_COOKIE];
  if (!token) return null;
  const [row] = await db
    .select({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, role: staffUsers.role })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
    .where(
      and(
        eq(staffSessions.tokenHash, sha256(token)),
        gt(staffSessions.expiresAt, new Date()),
        eq(staffUsers.active, true),
      ),
    );
  return row ?? null;
}

/** preHandler: 401 without a valid session, 403 when the role is not allowed. */
export function requireStaff(db: Database, roles: readonly StaffRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = await staffFromRequest(db, request);
    if (!staff) {
      return reply.code(401).send({ error: "unauthorized", message: "Please sign in" });
    }
    if (!roles.includes(staff.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Your role cannot do this" });
    }
    request.staff = staff;
  };
}

/** Append-only audit record for a staff action. */
export async function audit(
  db: Pick<Database, "insert">,
  staffId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(auditLog).values({ staffId, action, entity, entityId, data });
}
