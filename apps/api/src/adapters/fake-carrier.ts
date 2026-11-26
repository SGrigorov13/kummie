import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import PdfKit from "pdfkit";
import QRCode from "qrcode";
import type {
  CarrierAdapter,
  Label,
  ParcelInput,
  PickupPoint,
  TrackingEvent,
  TrackingStatus,
} from "./carrier";

const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const FONT_BOLD = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

const HOUR = 3_600_000;
/** Simulated journey of a test parcel, in hours after the label is created. */
const JOURNEY: readonly [TrackingStatus, number, string][] = [
  ["label_created", 0, "Етикетът е създаден"],
  ["handed_to_carrier", 2, "Приета от куриера в пункта"],
  ["in_transit", 6, "В движение"],
  ["out_for_delivery", 22, "Предадена за доставка"],
  ["delivered", 26, "Доставена"],
];

/**
 * Test courier (M2 until the Speedy / Econt contracts): creates real-looking labels (A6 PDF
 * with a QR code) and a tracking history that moves on by itself with time, so the hub screens and
 * customer notifications can be tried end to end. Stateless: the tracking number carries the
 * creation time. Nothing leaves the server.
 */
export class FakeCarrier implements CarrierAdapter {
  readonly name = "fake";
  readonly countries = ["BG", "RO", "GR"] as const;
  private readonly cancelled = new Set<string>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createShipment(input: ParcelInput): Promise<Label> {
    if (!(this.countries as readonly string[]).includes(input.recipient.country))
      throw new Error(`The test courier does not deliver to ${input.recipient.country}`);
    const created = this.now().getTime();
    const check = createHash("sha256").update(`${input.parcelId}:${created}`).digest("hex").slice(0, 4);
    const trackingNumber = `FK${created.toString(36).toUpperCase()}${check.toUpperCase()}`;
    return {
      trackingNumber,
      labelPdf: await renderLabel(input, trackingNumber),
      carrierReference: input.parcelId,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<void> {
    this.cancelled.add(trackingNumber);
  }

  async track(trackingNumber: string): Promise<TrackingEvent[]> {
    const created = createdAt(trackingNumber);
    if (created === null) throw new Error(`Unknown test tracking number ${trackingNumber}`);
    if (this.cancelled.has(trackingNumber))
      return [{ status: "exception", at: new Date(created), description: "Отказана товарителница" }];
    const now = this.now().getTime();
    return JOURNEY.filter(([, hours]) => created + hours * HOUR <= now).map(
      ([status, hours, description]) => ({
        status,
        at: new Date(created + hours * HOUR),
        location: status === "delivered" ? undefined : "София",
        description,
      }),
    );
  }

  async pickupPoints(country: string): Promise<PickupPoint[]> {
    const city = { BG: "София", RO: "București", GR: "Θεσσαλονίκη" }[country];
    if (!city) return [];
    return [1, 2, 3].map((n) => ({
      id: `FAKE-${country}-${n}`,
      name: `Тестов офис ${n}`,
      kind: n === 3 ? "locker" : "office",
      address: `${city}, тестова улица ${n}`,
      city,
      country,
    }));
  }
}

function createdAt(trackingNumber: string): number | null {
  const match = /^FK([0-9A-Z]+)[0-9A-F]{4}$/.exec(trackingNumber);
  if (!match?.[1]) return null;
  const ms = Number.parseInt(match[1].toLowerCase(), 36);
  return Number.isFinite(ms) ? ms : null;
}

/** A6 label (105 × 148 mm) — the size of the usual thermal label printers. */
async function renderLabel(input: ParcelInput, trackingNumber: string): Promise<Uint8Array> {
  const qr = await QRCode.toBuffer(trackingNumber, { type: "png", margin: 0, width: 160 });
  const pdf = new PdfKit({ size: [298, 420], margin: 18, info: { Title: `Label ${trackingNumber}` } });
  pdf.registerFont("regular", FONT_REGULAR);
  pdf.registerFont("bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  const r = input.recipient;
  pdf.font("bold").fontSize(9).text("ТЕСТОВ КУРИЕР — НЕ Е ИСТИНСКА ПРАТКА", { align: "center" });
  pdf.moveDown(0.6).font("bold").fontSize(16).text(trackingNumber, { align: "center" });
  pdf.image(qr, (298 - 120) / 2, pdf.y + 6, { width: 120 });
  pdf.y += 134;
  pdf.font("bold").fontSize(10).text("Получател");
  pdf
    .font("regular")
    .fontSize(11)
    .text(
      [r.name, r.phone ?? "", r.line1, r.line2 ?? "", `${r.postcode} ${r.city}`, r.country]
        .filter(Boolean)
        .join("\n"),
    );
  if (input.pickupPointId) pdf.font("bold").text(`До офис/автомат: ${input.pickupPointId}`);
  pdf.moveDown(0.6).font("regular").fontSize(9).text(`Поръчка: ${input.orderId}`);
  pdf.text(
    `Тегло: ${(input.weightGrams / 1000).toFixed(2)} кг · Обявена стойност: ${(input.valueCents / 100).toFixed(2)} €`,
  );
  pdf.end();
  return new Uint8Array(await done);
}
