import { groupById } from "../groups";
import { formatMoney, parseEuroToCents } from "../money";
import type { Localized } from "../types";
import { unitGrossCents } from "../vat";
import { calendar } from "./content";
import { products } from "./products";

/** @demo Rule-based Ask KUMMIE reply. Always labelled as a recommendation. */
export type AssistantReply = {
  answer: Localized;
  productIds: string[];
};

const disclaimer: Localized = {
  bg: "Локална препоръка. Не показвам реална наличност и не измислям официални дати.",
  en: "A local recommendation. It does not show real stock and does not invent official dates.",
};

function withDisclaimer(body: Localized, productIds: string[]): AssistantReply {
  return {
    answer: {
      bg: `${body.bg} ${disclaimer.bg}`,
      en: `${body.en} ${disclaimer.en}`,
    },
    productIds,
  };
}

function budgetCents(q: string): number | undefined {
  const match =
    q.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euro|евро)/i) ?? q.match(/(?:€)\s*(\d+(?:[.,]\d{1,2})?)/);
  if (match?.[1]) return parseEuroToCents(match[1]);
  return q.includes("40") ? 4000 : undefined;
}

/** @demo Answers a few question types from the demo catalogue. Never invents stock or dates. */
export function askKummie(query: string, date: Date = new Date()): AssistantReply {
  const q = query.toLowerCase();
  const budget = budgetCents(q);
  const talksMoney =
    q.includes("куп") || q.includes("buy") || q.includes("взе") || q.includes("бюджет") || q.includes("имам");

  if (budget !== undefined && (talksMoney || /€|eur|евро/.test(q))) {
    const picks = products
      .filter((product) => unitGrossCents(product.priceExVatCents, "BG", date) <= budget)
      .slice(0, 3);
    const names = picks.map((product) => product.title).join(", ");
    return withDisclaimer(
      {
        bg: names
          ? `Под ${formatMoney(budget, "bg")} с ДДС за България в демо каталога влизат: ${names}.`
          : `Под ${formatMoney(budget, "bg")} с ДДС за България няма артикул в демо каталога.`,
        en: names
          ? `Under ${formatMoney(budget, "en")} including Bulgarian VAT, the demo catalogue includes: ${names}.`
          : `Nothing in the demo catalogue sits under ${formatMoney(budget, "en")} including Bulgarian VAT.`,
      },
      picks.map((product) => product.id),
    );
  }

  if (
    q.includes("фотокарт") ||
    q.includes("photocard") ||
    q.includes("photo card") ||
    q.includes("класьор") ||
    q.includes("binder") ||
    q.includes("sleeve")
  ) {
    return withDisclaimer(
      {
        bg: "За карти ти трябват джоб и, ако вече са много, класьор. Твърдият протектор е само за тези, които вадиш често.",
        en: "For cards you want a sleeve and, once you have a few, a binder. A rigid toploader is only for the ones you take out often.",
      },
      ["kum-sleeves", "kum-binder", "kum-toploader"],
    );
  }

  if (
    q.includes("камбек") ||
    q.includes("comeback") ||
    q.includes("календар") ||
    q.includes("calendar") ||
    q.includes("release")
  ) {
    const lines = calendar
      .map((entry) => `${entry.when}: ${groupById(entry.groupId)?.name ?? ""}`)
      .join("; ");
    return withDisclaimer(
      {
        bg: `Примерният календар, не официален график: ${lines}.`,
        en: `The sample calendar, not an official schedule: ${lines}.`,
      },
      [],
    );
  }

  if (q.includes("подар") || q.includes("gift")) {
    return withDisclaimer(
      {
        bg: "За подарък без чужди лога: стикерите, чантата или класьорът. Ако бюджетът е по-малък, стикерите са най-малкият артикул.",
        en: "For a gift with no one else's logo: the stickers, the tote, or the binder. On a smaller budget, the stickers are the smallest item.",
      },
      ["kum-stickers", "kum-tote", "kum-binder"],
    );
  }

  if (q.includes("лайт") || q.includes("lightstick")) {
    return withDisclaimer(
      {
        bg: "Лайтстикът е официална концертна пръчка на група. В демото има само кутия без лого, с бадж за директна доставка. Истински лайтстик не е качен.",
        en: "A lightstick is a group's official concert light. The demo only has an unbranded case with a supplier-direct badge. A real lightstick is not listed.",
      },
      ["demo-lightstick"],
    );
  }

  return withDisclaimer(
    {
      bg: "Мога да сравня демо артикули по бюджет, да покажа аксесоари за фотокарти, примерен календар или идея за подарък. Питай конкретно.",
      en: "I can compare demo items by budget, show photocard accessories, the sample calendar, or a gift idea. Ask for one of those.",
    },
    [],
  );
}
