import { calendar, groupById } from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "calendar") };
}

/** Sample calendar, always labelled as not official. */
export default async function CalendarPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section">
      <h1>{t(locale, "calendar")}</h1>
      <p className="notice">{t(locale, "calendarNote")}</p>
      <ul className="groups">
        {calendar.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{groupById(entry.groupId)?.name}</strong>
              <span>
                <time dateTime={entry.when} className="label">
                  {entry.when}
                </time>{" "}
                · {entry.title[locale]}
              </span>
              <span className="muted">{entry.kind[locale]}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
