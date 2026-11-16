import { formatMoney, groupById, stateBadgeOf, type Product } from "@kummie/core";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { colors, radius, sp } from "@/theme";
import { Badge } from "./Badge";
import { Star } from "./Star";
import { useBrand } from "./useBrand";

/** 3:4 image · title (2 lines) · one sourcing badge · price · at most one state badge. */
export function ProductCard({ product, width }: { product: Product; width: number }) {
  const { locale, t, colors: c, type } = useBrand();
  const stateBadge = stateBadgeOf(product);
  const group = groupById(product.groupId);
  return (
    <Link href={{ pathname: "/product/[id]", params: { id: product.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${product.title}, ${formatMoney(product.priceCents, locale)}`}
        style={({ pressed }) => ({
          width,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          overflow: "hidden",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <ProductShot />
        <View style={{ padding: sp(3), gap: sp(2) }}>
          {group ? <Text style={[type.label, { color: c.muted, fontSize: 10 }]}>{group.name}</Text> : null}
          <Text numberOfLines={2} style={[type.strong, { color: c.cardText, fontSize: 15, lineHeight: 20 }]}>
            {product.title}
          </Text>
          <Badge id={product.sourcing} locale={locale} />
          <Text style={[type.strong, { color: c.cardText }]}>
            {formatMoney(product.priceCents, locale)}{" "}
            <Text style={[type.small, { color: c.muted }]}>{t("vat")}</Text>
          </Text>
          {stateBadge ? <Badge id={stateBadge} locale={locale} /> : null}
        </View>
      </Pressable>
    </Link>
  );
}

/** Placeholder where the product photo will go — never artist photos, logos or album art. */
export function ProductShot({ large = false }: { large?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        aspectRatio: 3 / 4,
        backgroundColor: colors.hairline,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Star size={large ? 140 : 64} color={colors.violet} />
    </View>
  );
}
