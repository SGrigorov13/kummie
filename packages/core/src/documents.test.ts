import { describe, expect, it } from "vitest";
import {
  centsToDecimal,
  formatDocNumber,
  napAuditXml,
  receiptQrContent,
  sofiaDateTime,
  toWindows1251,
} from "./documents";

describe("document numbers and amounts", () => {
  it("formats 10-digit numbers and refuses impossible ones", () => {
    expect(formatDocNumber(1)).toBe("0000000001");
    expect(formatDocNumber(9_999_999_999)).toBe("9999999999");
    expect(() => formatDocNumber(0)).toThrow();
    expect(() => formatDocNumber(10_000_000_000)).toThrow();
  });

  it("writes cents as decimals with a sign", () => {
    expect(centsToDecimal(2995)).toBe("29.95");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-4890)).toBe("-48.90");
    expect(() => centsToDecimal(1.5)).toThrow();
  });

  it("uses the Sofia date and time", () => {
    expect(sofiaDateTime(new Date("2026-11-16T22:30:05Z"))).toEqual({ date: "2026-11-17", time: "00:30:05" });
  });
});

describe("receiptQrContent", () => {
  it("joins the Приложение № 18а fields with *", () => {
    expect(
      receiptQrContent({
        eShopNumber: "RF0001234",
        issuedAt: new Date("2026-11-16T10:00:00Z"),
        posNumber: "POS12345",
        authCode: "123456",
        totalCents: 4890,
        orderNumber: "KUM-1001",
      }),
    ).toBe("RF0001234*2026-11-16*12:00:00*POS12345*123456*48.90*KUM-1001");
  });
});

describe("napAuditXml", () => {
  const xml = napAuditXml({
    eik: "123456789",
    eShopNumber: "RF0001234",
    domain: "kummie.eu",
    eShopType: 1,
    creationDate: "2026-12-01",
    year: 2026,
    month: 11,
    orders: [
      {
        orderNumber: "KUM-1001",
        orderDate: "2026-11-16",
        docNumber: "0000000001",
        docDate: "2026-11-16",
        lines: [
          { name: "Binder <A5> & co", qty: 2, totalCents: 4400, vatCents: 733, vatRatePercent: 20 },
          { name: "Доставка", qty: 1, totalCents: 490, vatCents: 82, vatRatePercent: 20 },
        ],
        totalCents: 4890,
        vatCents: 815,
        discountCents: 0,
        paymentMethod: 2,
        posNumber: "POS1",
        transactionRef: "TX1",
        processorId: "",
      },
    ],
    refunds: [{ orderNumber: "KUM-1001", amountCents: 4890, date: "2026-11-17", method: 2 }],
  });

  it("follows the structure of НАП's sample file", () => {
    expect(
      xml.startsWith('<?xml version="1.0" encoding="windows-1251"?>\n<audit>\n<eik>123456789</eik>'),
    ).toBe(true);
    expect(xml).toContain(
      "<e_shop_n>RF0001234</e_shop_n>\n<domain_name>kummie.eu</domain_name>\n<e_shop_type>1</e_shop_type>",
    );
    expect(xml).toContain("<mon>11</mon>\n<god>2026</god>\n<order>\n<orderenum>\n<ord_n>KUM-1001</ord_n>");
    expect(xml).toContain(
      "<art_name>Binder &lt;A5&gt; &amp; co</art_name>\n<art_quant>2</art_quant>\n<art_price>18.34</art_price>",
    );
    expect(xml).toContain(
      "<ord_total1>40.75</ord_total1>\n<ord_disc>0.00</ord_disc>\n<ord_vat>8.15</ord_vat>\n<ord_total2>48.90</ord_total2>\n<paym>2</paym>",
    );
    expect(xml).toContain(
      "<r_ord>1</r_ord>\n<rorder>\n<rorderenum>\n<r_ord_n>KUM-1001</r_ord_n>\n<r_amount>48.90</r_amount>",
    );
    expect(xml).toContain("<r_total>48.90</r_total>\n</audit>");
  });

  it("writes empty sections for a month without sales", () => {
    const empty = napAuditXml({
      eik: "1",
      eShopNumber: "RF1",
      domain: "kummie.eu",
      eShopType: 1,
      creationDate: "2026-12-01",
      year: 2026,
      month: 1,
      orders: [],
      refunds: [],
    });
    expect(empty).toContain("<mon>01</mon>");
    expect(empty).toContain(
      "<order>\n</order>\n<r_ord>0</r_ord>\n<rorder>\n</rorder>\n<r_total>0.00</r_total>",
    );
  });
});

describe("toWindows1251", () => {
  it("encodes Bulgarian letters, euro and quotes", () => {
    expect([...toWindows1251("Аа Яя €„“")]).toEqual([0xc0, 0xe0, 0x20, 0xdf, 0xff, 0x20, 0x88, 0x84, 0x93]);
    expect([...toWindows1251("KUM-1")]).toEqual([75, 85, 77, 45, 49]);
    expect([...toWindows1251("中")]).toEqual([0x3f]);
  });
});
