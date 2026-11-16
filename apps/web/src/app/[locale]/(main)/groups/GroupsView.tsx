"use client";

import { GENERATIONS, groups, type Generation } from "@kummie/core";
import { useState } from "react";
import { useDemoStore } from "@/lib/demo-store";
import { useT } from "@/lib/locale";

/** Group metadata only (names, generation) — no logos, photos or artwork. */
export function GroupsView() {
  const t = useT();
  const { state, toggleFollow } = useDemoStore();
  const [gen, setGen] = useState<Generation | "all">("all");
  const list = groups.filter((group) => gen === "all" || group.generation === gen);
  return (
    <>
      <div className="filters" role="group" aria-label={t("gen")}>
        <button type="button" className="chip" aria-pressed={gen === "all"} onClick={() => setGen("all")}>
          {t("all")}
        </button>
        {GENERATIONS.map((generation) => (
          <button
            key={generation}
            type="button"
            className="chip"
            aria-pressed={gen === generation}
            onClick={() => setGen(generation)}
          >
            {t("genN", { n: generation })}
          </button>
        ))}
      </div>
      <p className="muted" role="status">
        {t("results", { count: list.length })}
      </p>
      <ul className="groups">
        {list.map((group) => {
          const following = state.follows.includes(group.id);
          return (
            <li key={group.id}>
              <div>
                <strong>{group.name}</strong>
                <span className="muted">
                  {group.aka ? `${group.aka} · ` : ""}
                  {t("genN", { n: group.generation })}
                </span>
                {group.editorialCheck ? <span className="label">{t("editorialCheck")}</span> : null}
              </div>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                aria-pressed={following}
                onClick={() => toggleFollow(group.id)}
              >
                {following ? t("following") : t("follow")}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
