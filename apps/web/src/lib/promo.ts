/** localStorage key that remembers a dismissed promo bar on this device. */
export const PROMO_DISMISSED_KEY = "kummie-promo-dismissed";

/**
 * Runs before first paint and marks <html data-promo="off"> when the bar was dismissed, so the
 * bar never flashes in and then jumps away (CLS). Essential UI preference only — no tracking.
 */
export const promoBootScript = `try{if(localStorage.getItem(${JSON.stringify(PROMO_DISMISSED_KEY)})==="1")document.documentElement.dataset.promo="off"}catch(e){}`;
