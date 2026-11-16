import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { OrderView } from "./OrderView";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "order"), robots: { index: false } };
}

/** Filled client-side: guests open it with the key in the link fragment, accounts with their session. */
export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  return <OrderView id={id} />;
}
