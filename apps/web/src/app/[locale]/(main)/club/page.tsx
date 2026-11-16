import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { ClubView } from "./ClubView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "club") };
}

export default async function ClubPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section">
      <h1>{t(locale, "club")}</h1>
      <p>{t(locale, "clubLead")}</p>
      <ClubView />
      <h2>{t(locale, "tombola")}</h2>
      <p>{t(locale, "tombolaBody")}</p>
    </div>
  );
}
