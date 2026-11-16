/**
 * Push adapter (Firebase Cloud Messaging for Android; APNs later for iOS).
 * Four separate opt-in categories. Quiet hours 22:00–08:00 and the two-per-week marketing cap are
 * enforced by the notification job before calling this adapter, never by the adapter itself.
 */

export type PushCategory = "comebacks" | "restocks" | "order_status" | "club_drops";

export type PushMessage = {
  deviceToken: string;
  category: PushCategory;
  /** Under 60 characters (brand copy rule). */
  title: string;
  body?: string;
  /** Deep link inside the app, e.g. kummie://orders/KM-123. */
  url?: string;
  idempotencyKey: string;
};

export type PushResult = { delivered: boolean; invalidToken?: boolean };

export interface PushAdapter {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}
