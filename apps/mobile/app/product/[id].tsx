import { badgeSpec, formatMoney, groupById, productById, stateBadgeOf, subcategoryById } from "@kummie/core";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Badge } from "@/components/Badge";
import { ProductShot } from "@/components/ProductCard";
import { useBrand } from "@/components/useBrand";
import { sp } from "@/theme";

/** Product page with every GPSR Art. 19 field (same rule as the web). */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t, colors: c, type } = useBrand();
  const product = productById(id ?? "");

  if (!product) {
    return (
      <View style={{ flex: 1, padding: sp(6), backgroundColor: c.background }}>
        <Text style={[type.body, { color: c.text }]}>{t("notFound")}</Text>
      </View>
    );
  }

  const stateBadge = stateBadgeOf(product);
  const group = groupById(product.groupId);
  const { compliance } = product;
  const safety = [
    ...(compliance.safetyInfo ? [compliance.safetyInfo[locale]] : []),
    ...(compliance.warnings ?? []).map((w) => w[locale]),
  ];
  const facts: [string, string][] = [
    [t("version"), product.version],
    [t("sourcing"), `${badgeSpec(product.sourcing)[locale]} — ${t(`sourcing.${product.sourcing}`)}`],
    [t("dispatch"), product.dispatchEstimate[locale]],
    [t("regions"), product.deliveryRegions.map((country) => t(`country.${country}`)).join(", ")],
    [t("maker"), compliance.manufacturer],
    [t("responsible"), compliance.responsiblePerson],
    [t("safety"), safety.length ? safety.join("\n") : t("noWarnings")],
    [
      t("returnsNote"),
      product.returnExceptions?.length
        ? product.returnExceptions.map((r) => r[locale]).join("\n")
        : t("noReturnExceptions"),
    ],
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: sp(10) }}
    >
      <Stack.Screen options={{ title: product.title }} />
      <ProductShot large />
      <View style={{ padding: sp(5), gap: sp(3) }}>
        <Text style={[type.label, { color: c.muted }]}>
          {subcategoryById(product.subcategory)[locale]}
          {group ? ` · ${group.name}` : ""}
        </Text>
        <Text style={[type.h2, { color: c.text }]}>{product.title}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp(2) }}>
          <Badge id={product.sourcing} locale={locale} />
          {stateBadge ? <Badge id={stateBadge} locale={locale} /> : null}
        </View>
        <Text style={[type.small, { color: c.muted }]}>{t("demo")}</Text>
        <Text style={[type.h2, { color: c.text }]}>
          {formatMoney(product.priceCents, locale)}{" "}
          <Text style={[type.small, { color: c.muted }]}>{t("vat")}</Text>
        </Text>
        <Text style={[type.small, { color: c.muted }]}>
          {t("priceNote")} {t("deliveryFrom")}
        </Text>
        <Text style={[type.body, { color: c.text }]}>{product.summary[locale]}</Text>
        <Text style={[type.small, { color: c.muted }]}>{t("mobile.buyOnWeb")}</Text>

        <Text style={[type.h3, { color: c.text, marginTop: sp(4) }]}>{t("facts")}</Text>
        {facts.map(([label, value]) => (
          <View
            key={label}
            style={{ paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: c.border, gap: sp(1) }}
          >
            <Text style={[type.label, { color: c.muted }]}>{label}</Text>
            <Text style={[type.body, { color: c.text }]}>{value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
