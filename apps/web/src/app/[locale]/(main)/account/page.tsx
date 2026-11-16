import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { AccountView } from "./AccountView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "account"), robots: { index: false } };
}

export default async function AccountPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section narrow">
      <h1>{t(locale, "account")}</h1>
      <AccountView />
    </div>
  );
}
