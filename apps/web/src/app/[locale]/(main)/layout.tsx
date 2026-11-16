import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { PromoBar } from "@/components/PromoBar";
import { localeParam } from "@/lib/paths";

/** Every non-Teen page: promo bar above the header. */
export default async function MainLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = localeParam((await params).locale);
  return (
    <>
      <PromoBar />
      <Header locale={locale} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
