import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { OrderView } from "./OrderView";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "order"), robots: { index: false } };
}

/** Demo orders live in the browser only, so this page is rendered on demand and filled client-side. */
export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  return <OrderView id={id} />;
}
