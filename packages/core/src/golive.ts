import { addDays } from "./kummies";

/**
 * Go-live gate (M1 Task 13, D-043): real sales stay switched off until every condition below is
 * green. Pure rules; the API reads the settings and the admin shows the result.
 */

/** Legal pages that must be approved (by the lawyer) and published before selling (ЗЗП, GDPR). */
export const LEGAL_PAGE_IDS = [
  "terms",
  "withdrawal",
  "returns",
  "guarantee",
  "privacy",
  "complaints",
] as const;
export type LegalPageId = (typeof LEGAL_PAGE_IDS)[number];

export const GO_LIVE_CONDITION_IDS = [
  "company",
  "oss",
  "nap",
  "payment",
  "email",
  "legal",
  "delivery",
] as const;
export type GoLiveConditionId = (typeof GO_LIVE_CONDITION_IDS)[number];

/** Company fields the shop cannot sell without (A4): trader data, documents, refunds. */
export const REQUIRED_COMPANY_FIELDS = [
  "legalName",
  "eik",
  "vatNumber",
  "registeredAddress",
  "contactEmail",
  "contactPhone",
  "iban",
  "euResponsiblePerson",
] as const;
export type RequiredCompanyField = (typeof REQUIRED_COMPANY_FIELDS)[number];

export type GoLiveInput = {
  company: Record<RequiredCompanyField, string | null> & {
    ossEffectiveFrom: string | null;
    napRfNumber: string | null;
    napEShopNumber: string | null;
    napRegisteredOn: string | null;
    deliveryFeesCents: Record<"BG" | "RO" | "GR", number>;
  };
  /** Business day in Sofia (YYYY-MM-DD). */
  today: string;
  /** Configured payment provider; "fake" is the test provider. */
  paymentProvider: string;
  /** "smtp" sends real e-mails; "file" only writes them to disk. */
  emailTransport: string;
  /** Approval date per legal page, null while not approved. */
  legalApproved: Partial<Record<LegalPageId, string | null>>;
};

export type GoLiveCondition = {
  id: GoLiveConditionId;
  ok: boolean;
  /** What is still missing (field names, page ids, the OSS date…), for the admin page. */
  missing: string[];
};

/** Every condition with what is still missing. */
export function goLiveConditions(input: GoLiveInput): GoLiveCondition[] {
  const { company } = input;
  const companyMissing = REQUIRED_COMPANY_FIELDS.filter((f) => !company[f]?.trim());
  const ossMissing = !company.ossEffectiveFrom
    ? ["ossEffectiveFrom"]
    : company.ossEffectiveFrom > input.today
      ? [`ossEffectiveFrom:${company.ossEffectiveFrom}`]
      : [];
  const napMissing = (["napRfNumber", "napEShopNumber", "napRegisteredOn"] as const).filter(
    (f) => !company[f],
  );
  const legalMissing = LEGAL_PAGE_IDS.filter((page) => !input.legalApproved[page]);
  const deliveryMissing = (["BG", "RO", "GR"] as const).filter((c) => !(company.deliveryFeesCents[c] >= 0));
  return [
    { id: "company", ok: companyMissing.length === 0, missing: [...companyMissing] },
    { id: "oss", ok: ossMissing.length === 0, missing: ossMissing },
    { id: "nap", ok: napMissing.length === 0, missing: [...napMissing] },
    {
      id: "payment",
      ok: input.paymentProvider !== "fake",
      missing: input.paymentProvider === "fake" ? ["paymentProvider"] : [],
    },
    {
      id: "email",
      ok: input.emailTransport === "smtp",
      missing: input.emailTransport === "smtp" ? [] : ["emailTransport"],
    },
    { id: "legal", ok: legalMissing.length === 0, missing: [...legalMissing] },
    { id: "delivery", ok: deliveryMissing.length === 0, missing: [...deliveryMissing] },
  ];
}

export function allGreen(conditions: readonly GoLiveCondition[]): boolean {
  return conditions.every((c) => c.ok);
}

/**
 * Whether checkout may take a payment right now. Before go-live only the test provider works
 * (test payments, nothing charged); after go-live only a real provider, and only while every
 * condition stays green. Anything else — a real provider before go-live, the test provider after —
 * is refused, so the shop can never charge for real by accident or sell with fake payments.
 */
export function checkoutMode(
  salesEnabled: boolean,
  paymentProvider: string,
  conditionsGreen: boolean,
): "test" | "live" | "closed" {
  if (!salesEnabled) return paymentProvider === "fake" ? "test" : "closed";
  return paymentProvider !== "fake" && conditionsGreen ? "live" : "closed";
}

/** Changes to the facts declared in Приложение № 33 must reach НАП within 7 days. */
export const NAP_UPDATE_DAYS = 7;
export const NAP_UPDATE_KINDS = [
  "payment_provider",
  "vpos_terminal",
  "domain",
  "hosting",
  "closing",
  "other",
] as const;
export type NapUpdateKind = (typeof NAP_UPDATE_KINDS)[number];

export function napUpdateDueOn(changedOn: string): string {
  return addDays(changedOn, NAP_UPDATE_DAYS);
}

/** Days left until the deadline (negative when late). */
export function napUpdateDaysLeft(changedOn: string, today: string): number {
  const due = Date.parse(`${napUpdateDueOn(changedOn)}T00:00:00Z`);
  return Math.round((due - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
