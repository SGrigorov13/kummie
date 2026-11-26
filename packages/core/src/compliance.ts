import type { Country, Localized, ProductState, Sourcing } from "./types";

/**
 * The publishing gate (GPSR Art. 19, CLAUDE.md): a product cannot be published until every field the
 * product page must render is filled. "None" is a valid answer for safety information and return
 * exceptions, but it has to be given explicitly — an empty field never passes.
 */
export type ComplianceDraft = {
  title: string;
  sourcing: Sourcing | null;
  state: Exclude<ProductState, "LIMITED"> | null;
  isLimited: boolean;
  /** Versions of the product's variants (album version, size…); at least one. */
  versions: readonly string[];
  /** Prices of the variants in cents incl. VAT. */
  pricesCents: readonly number[];
  dispatchEstimate: Partial<Localized> | null;
  deliveryRegions: readonly Country[];
  manufacturer: string | null;
  euResponsiblePerson: string | null;
  safetyInfo: Partial<Localized> | null;
  warnings: readonly Partial<Localized>[];
  /** Explicit "no specific safety information or warnings". */
  safetyNone: boolean;
  returnExceptions: readonly Partial<Localized>[];
  /** Explicit "no exceptions beyond the legal ones". */
  returnExceptionsNone: boolean;
  /**
   * Active variants without any supplier offer (D-063, B3): a product we cannot buy is not
   * published. Only the server knows the offers; left out, the check is skipped (admin preview).
   */
  variantsWithoutOffer?: number;
};

export type ComplianceField =
  | "title"
  | "sourcing"
  | "version"
  | "price"
  | "dispatchEstimate"
  | "deliveryRegions"
  | "manufacturer"
  | "euResponsiblePerson"
  | "safety"
  | "returnExceptions"
  | "supplierOffer";

const filled = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;
const bothLanguages = (value: Partial<Localized> | null | undefined) =>
  !!value && filled(value.bg) && filled(value.en);

/** Every field still missing before the product may be published (empty list = publishable). */
export function missingComplianceFields(draft: ComplianceDraft): ComplianceField[] {
  const missing: ComplianceField[] = [];
  if (!filled(draft.title)) missing.push("title");
  if (!draft.sourcing) missing.push("sourcing");
  if (draft.versions.length === 0 || !draft.versions.every(filled)) missing.push("version");
  if (draft.pricesCents.length === 0 || !draft.pricesCents.every((c) => Number.isInteger(c) && c > 0)) {
    missing.push("price");
  }
  if (!bothLanguages(draft.dispatchEstimate)) missing.push("dispatchEstimate");
  if (draft.deliveryRegions.length === 0) missing.push("deliveryRegions");
  if (!filled(draft.manufacturer)) missing.push("manufacturer");
  if (!filled(draft.euResponsiblePerson)) missing.push("euResponsiblePerson");

  const safetyGiven =
    bothLanguages(draft.safetyInfo) || (draft.warnings.length > 0 && draft.warnings.every(bothLanguages));
  const safetyBroken =
    draft.warnings.some((w) => !bothLanguages(w)) || (!!draft.safetyInfo && !bothLanguages(draft.safetyInfo));
  if (safetyBroken || (!safetyGiven && !draft.safetyNone)) missing.push("safety");

  const exceptionsGiven = draft.returnExceptions.length > 0 && draft.returnExceptions.every(bothLanguages);
  const exceptionsBroken = draft.returnExceptions.some((r) => !bothLanguages(r));
  if (exceptionsBroken || (!exceptionsGiven && !draft.returnExceptionsNone)) missing.push("returnExceptions");

  if ((draft.variantsWithoutOffer ?? 0) > 0) missing.push("supplierOffer");

  return missing;
}

/** Badge rules that hold for every saved product, published or not. */
export function badgeProblems(draft: Pick<ComplianceDraft, "state" | "isLimited">): string[] {
  const problems: string[] = [];
  // LIMITED is never a stored state — Hot Pink comes only from isLimited (badges.json rules).
  if ((draft.state as string | null) === "LIMITED")
    problems.push("LIMITED is set through isLimited, not as a state");
  return problems;
}
