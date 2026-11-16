import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { GroupsView } from "./GroupsView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "groups") };
}

export default async function GroupsPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section">
      <h1>{t(locale, "groups")}</h1>
      <GroupsView />
    </div>
  );
}
