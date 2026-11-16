"use client";

import Link from "next/link";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";

export default function NotFound() {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="wrap section">
      <h1>404</h1>
      <p>{t("notFound")}</p>
      <Link className="btn" href={href(locale, "/shop")}>
        {t("heroCta")}
      </Link>
    </div>
  );
}
