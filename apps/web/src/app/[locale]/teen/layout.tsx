import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { localeParam } from "@/lib/paths";

/**
 * KUMMIE Teen: no promo bar, no countdowns, no pressure language, no comments, DMs or profiles,
 * and nothing that identifies the young contributor. The promo bar lives only in the (main) group,
 * so it is absent from this markup entirely.
 */
export default async function TeenLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = localeParam((await params).locale);
  return (
    <>
      <Header locale={locale} />
      <main id="main" tabIndex={-1} className="teen">
        {children}
      </main>
    </>
  );
}
