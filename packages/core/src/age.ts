/**
 * Age gate at sign-up (CLAUDE.md "Minors", M1 spec A2). The minimum age is a setting — the owner is
 * confirming it with a lawyer — so it is passed in; 14 is the default until then.
 * Dates are ISO calendar days ("YYYY-MM-DD"); "today" is the business day in Sofia.
 */

export const DEFAULT_MINIMUM_AGE = 14;
export const ADULT_AGE = 18;
/** Anything older is treated as a typing mistake. */
const MAX_AGE = 120;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses an ISO day, rejecting impossible dates such as 2026-02-30. */
function parseDay(value: string): [number, number, number] | null {
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return [y, m, d];
}

/** Whole years between the birth date and today (birthday counts from that day; 29 Feb → 1 Mar). */
export function ageOn(birthDate: string, today: string): number | null {
  const born = parseDay(birthDate);
  const now = parseDay(today);
  if (!born || !now) return null;
  let years = now[0] - born[0];
  if (now[1] < born[1] || (now[1] === born[1] && now[2] < born[2])) years -= 1;
  return years;
}

export type AgeCheck =
  | { ok: true; age: number; minor: boolean }
  | { ok: false; reason: "invalid" | "too_young"; minimumAge: number };

/** Sign-up decision: allowed at `minimumAge` or older; under 18 is allowed but restricted. */
export function checkAge(birthDate: string, today: string, minimumAge = DEFAULT_MINIMUM_AGE): AgeCheck {
  const age = ageOn(birthDate, today);
  if (age === null || age < 0 || age > MAX_AGE) return { ok: false, reason: "invalid", minimumAge };
  if (age < minimumAge) return { ok: false, reason: "too_young", minimumAge };
  return { ok: true, age, minor: age < ADULT_AGE };
}

/** True while the customer is under 18 — the restrictions below apply. */
export function isMinor(birthDate: string, today: string): boolean {
  const age = ageOn(birthDate, today);
  return age !== null && age < ADULT_AGE;
}

/**
 * What changes for under-18 accounts (CLAUDE.md): no personalised advertising, no public profile,
 * no tombola entry without parental consent. Order and account e-mails are unaffected.
 */
export const MINOR_RESTRICTIONS = {
  personalisedAds: false,
  publicProfile: false,
  tombolaNeedsParentalConsent: true,
} as const;
