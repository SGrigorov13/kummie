import { z } from "zod";

/** What the customer asks for (repair, replacement, price reduction or money back). */
export const ComplaintDemand = z.enum(["repair", "replacement", "price_reduction", "refund"]);
export type ComplaintDemand = z.infer<typeof ComplaintDemand>;

/** "Подай рекламация" from the customer's order page (D-069). */
export const ComplaintRequest = z.object({
  /** The product from the order; null for the order as a whole (e.g. the parcel). */
  orderLineId: z.uuid().nullable(),
  description: z.string().trim().min(10).max(2000),
  demand: ComplaintDemand,
});
export type ComplaintRequest = z.infer<typeof ComplaintRequest>;

/** A complaint received by e-mail, phone or in person, entered by staff. */
export const StaffComplaintInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(40).nullable(),
  /** KUM-1001 or 1001; optional. */
  orderNumber: z.string().trim().max(20).nullable(),
  product: z.string().trim().min(1).max(300),
  description: z.string().trim().min(10).max(2000),
  demand: ComplaintDemand,
  channel: z.enum(["email", "phone", "in_person"]),
  /** The day it was received (Sofia), when entered later. */
  receivedOn: z.iso.date(),
  locale: z.enum(["bg", "en"]),
});
export type StaffComplaintInput = z.infer<typeof StaffComplaintInput>;

export const ComplaintStatus = z.enum(["open", "resolved", "rejected"]);

/** One row of the register (ЗЗП чл. 127). */
export const Complaint = z.object({
  id: z.string(),
  number: z.string(),
  status: ComplaintStatus,
  receivedAt: z.string(),
  dueOn: z.iso.date(),
  /** Open and past the deadline. */
  overdue: z.boolean(),
  /** Open with 7 days or less left. */
  dueSoon: z.boolean(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  product: z.string(),
  description: z.string(),
  demand: ComplaintDemand,
  channel: z.enum(["site", "email", "phone", "in_person"]),
  outcome: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});
export type Complaint = z.infer<typeof Complaint>;
export const ComplaintList = z.object({ items: z.array(Complaint) });
export type ComplaintList = z.infer<typeof ComplaintList>;

/** Staff close a complaint: satisfied (with what was done) or refused (with the reason). */
export const ComplaintResolution = z.object({
  status: z.enum(["resolved", "rejected"]),
  outcome: z.string().trim().min(3).max(2000),
});
export type ComplaintResolution = z.infer<typeof ComplaintResolution>;

/** What the customer sees of their complaints in the order. */
export const OrderComplaint = z.object({
  number: z.string(),
  status: ComplaintStatus,
  product: z.string(),
  dueOn: z.iso.date(),
  outcome: z.string().nullable(),
});
