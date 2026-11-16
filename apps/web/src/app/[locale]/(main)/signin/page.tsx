import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { SignInView } from "@/components/AuthViews";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "auth.signIn"), robots: { index: false } };
}

export default async function SignInPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section narrow">
      <h1>{t(locale, "auth.signIn")}</h1>
      <SignInView />
    </div>
  );
}
