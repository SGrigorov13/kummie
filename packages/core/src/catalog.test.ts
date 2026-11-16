import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeSpec, sourcingBadges, stateBadgeOf, stateBadges } from "./badges";
import { demoCategoryOf, products } from "./demo/index";
import { groupById, groups, parseGroups } from "./groups";
import {
  CUSTOMER_STEPS,
  customerStep,
  customerStepNumber,
  HAPPY_PATH,
  isOffTrack,
  nextHappyStatus,
  ORDER_STATUSES,
} from "./orders";
import { categoryOf, isSubcategoryId, TAXONOMY } from "./taxonomy";

function byId(id: string) {
  const product = products.find((item) => item.id === id);
  if (!product) throw new Error(`missing demo product ${id}`);
  return product;
}

function readRepoJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"));
}

describe("badges", () => {
  it("match the closed enum in docs/brand/badges.json", () => {
    const brand = readRepoJson("docs/brand/badges.json") as {
      sourcing: { id: string; en: string; bg: string; fill: string; text: string; border?: string }[];
      state: { id: string; en: string; bg: string; fill: string; text: string; border?: string }[];
    };
    const pick = ({ id, en, bg, fill, text, border }: (typeof brand.sourcing)[number]) => ({
      id,
      en,
      bg,
      fill,
      text,
      ...(border ? { border } : {}),
    });
    expect(sourcingBadges.map((badge) => ({ ...badge }))).toEqual(brand.sourcing.map(pick));
    expect(stateBadges.map((badge) => ({ ...badge }))).toEqual(brand.state.map(pick));
  });

  it("wires LIMITED only to isLimited", () => {
    expect(stateBadgeOf({ isLimited: true, state: "NEW_DROP" })).toBe("LIMITED");
    expect(stateBadgeOf({ isLimited: false, state: "NEW_DROP" })).toBe("NEW_DROP");
    expect(stateBadgeOf({ isLimited: false })).toBeUndefined();
  });

  it("rejects unknown badges", () => {
    // @ts-expect-error — not part of the enum
    expect(() => badgeSpec("SALE")).toThrow();
  });
});

describe("taxonomy", () => {
  it("matches data/seed/merch-taxonomy.json", () => {
    const seed = readRepoJson("data/seed/merch-taxonomy.json") as { categories: unknown };
    expect(JSON.parse(JSON.stringify(TAXONOMY))).toEqual(seed.categories);
  });

  it("resolves a subcategory to its category", () => {
    expect(categoryOf("toploaders").id).toBe("collector-supplies");
    expect(isSubcategoryId("lightsticks")).toBe(true);
    expect(isSubcategoryId("limited")).toBe(false);
  });
});

describe("groups seed", () => {
  it("loads all 99 groups with generations 1–5", () => {
    expect(groups).toHaveLength(99);
    expect(new Set(groups.map((group) => group.generation))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(groupById("tomorrow-x-together")?.aka).toBe("TXT");
    expect(groups.every((group) => group.editorialCheck)).toBe(true);
  });

  it("rejects malformed seeds", () => {
    expect(() => parseGroups({})).toThrow();
    expect(() => parseGroups({ groups: [{ id: "x", name: "X", generation: 9 }] })).toThrow();
    expect(() =>
      parseGroups({
        groups: [
          { id: "x", name: "X", generation: 1 },
          { id: "x", name: "Y", generation: 2 },
        ],
      }),
    ).toThrow();
  });
});

describe("demo catalogue", () => {
  it("uses integer cents, known taxonomy and known groups", () => {
    for (const product of products) {
      expect(Number.isInteger(product.priceCents)).toBe(true);
      expect(isSubcategoryId(product.subcategory)).toBe(true);
      if (product.groupId) expect(groupById(product.groupId)).toBeDefined();
    }
  });

  it("carries the GPSR fields every product page renders", () => {
    for (const product of products) {
      expect(product.version).not.toBe("");
      expect(product.dispatchEstimate.bg && product.dispatchEstimate.en).toBeTruthy();
      expect(product.deliveryRegions.length).toBeGreaterThan(0);
      expect(product.compliance.manufacturer).not.toBe("");
      expect(product.compliance.responsiblePerson).not.toBe("");
    }
  });

  it("maps onto the old 4-value demo category", () => {
    expect(demoCategoryOf(byId("demo-album-skz"))).toBe("album");
    expect(demoCategoryOf(byId("kum-binder"))).toBe("collect");
    expect(demoCategoryOf(byId("kum-tote"))).toBe("original");
    expect(demoCategoryOf(byId("demo-lightstick"))).toBe("merch");
  });
});

describe("order statuses", () => {
  it("maps every internal status to one of 7 customer steps or to none", () => {
    expect(CUSTOMER_STEPS).toHaveLength(7);
    for (const status of ORDER_STATUSES) {
      const step = customerStep(status);
      if (step === null) expect(status === "pending_payment" || isOffTrack(status)).toBe(true);
    }
  });

  it("follows ARCHITECTURE §4", () => {
    expect(customerStepNumber("paid")).toBe(1);
    expect(customerStepNumber("batched")).toBe(2);
    expect(customerStepNumber("ordered_from_supplier")).toBe(2);
    expect(customerStepNumber("supplier_shipped")).toBe(3);
    expect(customerStepNumber("received_at_hub")).toBe(4);
    expect(customerStepNumber("packed")).toBe(5);
    expect(customerStepNumber("handed_to_carrier")).toBe(5);
    expect(customerStepNumber("out_for_delivery")).toBe(6);
    expect(customerStepNumber("delivered")).toBe(7);
    expect(customerStepNumber("exception")).toBeNull();
  });

  it("walks the happy path", () => {
    expect(nextHappyStatus("paid")).toBe("batched");
    expect(nextHappyStatus("delivered")).toBeNull();
    expect(nextHappyStatus("cancelled")).toBeNull();
    expect(HAPPY_PATH[0]).toBe("paid");
  });
});
