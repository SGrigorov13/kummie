import { colors } from "@kummie/brand";
import type { MetadataRoute } from "next";

/** PWA manifest. Bulgarian is the default locale. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KUMMIE — Your K-pop Chingu",
    short_name: "KUMMIE",
    start_url: "/bg",
    display: "standalone",
    background_color: colors.paper,
    theme_color: colors.violet,
    lang: "bg",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
