import { badgeSpec, type Locale, type ProductState, type Sourcing } from "@kummie/core";

/**
 * The one badge component. Enum-driven only (docs/brand/badges.json) — there is no free-text
 * badge. Colours come from tokens via `.badge--<ID>` in globals.css.
 */
export function Badge({ id, locale }: { id: Sourcing | ProductState; locale: Locale }) {
  const spec = badgeSpec(id);
  return <span className={`badge badge--${id}`}>{spec[locale]}</span>;
}
