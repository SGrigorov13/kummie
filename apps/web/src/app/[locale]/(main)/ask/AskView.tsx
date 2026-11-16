"use client";

import { Equaliser } from "@kummie/brand/react";
import { askKummie, productById, type AssistantReply, type Product } from "@kummie/core";
import { useState, type FormEvent } from "react";
import { ProductCard } from "@/components/ProductCard";
import { useLocale, useT } from "@/lib/locale";

/** Ask KUMMIE (rule-based demo). Answers are labelled as recommendations. */
export function AskView() {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setReply(askKummie(query));
  }

  const picks = (reply?.productIds ?? [])
    .map((id) => productById(id))
    .filter((product): product is Product => product !== undefined);

  return (
    <>
      <form className="ask" onSubmit={submit}>
        <label className="sr-only" htmlFor="ask-input">
          {t("ask")}
        </label>
        <input
          id="ask-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("askPh")}
        />
        <button className="btn" type="submit">
          <Equaliser compact height={16} />
          {t("ask")}
        </button>
      </form>
      <div aria-live="polite">
        {reply ? (
          <div className="panel">
            <p className="label">{t("askLabel")}</p>
            <p>{reply.answer[locale]}</p>
          </div>
        ) : null}
      </div>
      {picks.length > 0 ? (
        <div className="grid">
          {picks.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      ) : null}
    </>
  );
}
