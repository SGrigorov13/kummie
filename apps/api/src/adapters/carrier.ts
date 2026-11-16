/**
 * Carrier adapter (Speedy / Econt first, M2). One parcel per customer order or split shipment;
 * the label is created here and scanned at the Bulgaria hub to confirm hand-over.
 */

export type Address = {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  /** ISO 3166-1 alpha-2: BG, RO, GR (PL later). */
  country: string;
};

export type ParcelInput = {
  orderId: string;
  parcelId: string;
  recipient: Address;
  weightGrams: number;
  /** Declared value in integer euro cents. */
  valueCents: number;
  /** Office/locker delivery when the carrier supports it. */
  pickupPointId?: string;
};

export type Label = {
  trackingNumber: string;
  /** PDF label, ready to print at the hub. */
  labelPdf: Uint8Array;
  carrierReference?: string;
};

export type TrackingStatus = "label_created" | "handed_to_carrier" | "in_transit" | "out_for_delivery" | "delivered" | "returned" | "exception";

export type TrackingEvent = { status: TrackingStatus; at: Date; location?: string; description?: string };

export interface CarrierAdapter {
  readonly name: string;
  /** Destination countries this carrier serves. */
  readonly countries: readonly string[];
  createShipment(input: ParcelInput): Promise<Label>;
  cancelShipment(trackingNumber: string): Promise<void>;
  track(trackingNumber: string): Promise<TrackingEvent[]>;
}
