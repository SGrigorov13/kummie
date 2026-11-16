import { CATEGORIES, productById, type Product } from "@kummie/core";
import { Link } from "expo-router";
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { Star } from "@/components/Star";
import { useBrand } from "@/components/useBrand";
import { colors, radius, sp } from "@/theme";

const PICKS = ["kum-binder", "kum-sleeves", "kum-toploader", "demo-album-skz", "kum-box"];

/** Home = the shop's front window: brand welcome, KUMMIE Picks and the categories. */
export default function HomeTab() {
  const { locale, t, colors: c, type } = useBrand();
  const { width } = useWindowDimensions();
  const picks = PICKS.map((id) => productById(id)).filter((p): p is Product => p !== undefined);
  const cardWidth = Math.min(200, width * 0.44);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: sp(8) }}
    >
      <View style={{ backgroundColor: colors.violet, padding: sp(6), gap: sp(3), overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -30, top: -10 }}>
          <Star size={170} color={colors.pink} />
        </View>
        <Text style={[type.label, { color: colors.glow }]}>Your K-pop Chingu</Text>
        <Text style={[type.display, { color: colors.white, maxWidth: "75%" }]}>{t("heroTitle")}</Text>
        <Text style={[type.body, { color: colors.white, maxWidth: "80%" }]}>{t("mobile.homeLead")}</Text>
        <Link href="/shop" asChild>
          <Pressable
            accessibilityRole="button"
            style={{
              alignSelf: "flex-start",
              minHeight: 48,
              justifyContent: "center",
              paddingHorizontal: sp(6),
              borderRadius: radius.pill,
              backgroundColor: colors.glow,
            }}
          >
            <Text style={[type.strong, { color: colors.ink }]}>{t("mobile.allShop")}</Text>
          </Pressable>
        </Link>
      </View>

      <View style={{ paddingHorizontal: sp(4), paddingTop: sp(6), gap: sp(1) }}>
        <Text style={[type.h2, { color: c.text }]}>{t("picks")}</Text>
        <Text style={[type.small, { color: c.muted }]}>{t("bundleHint")}</Text>
      </View>
      <FlatList
        horizontal
        data={picks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
        contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(3) }}
        showsHorizontalScrollIndicator={false}
      />

      <View style={{ paddingHorizontal: sp(4), gap: sp(3) }}>
        <Text style={[type.h2, { color: c.text }]}>{t("categoriesTitle")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp(2) }}>
          {CATEGORIES.map((category) => (
            <Link key={category.id} href={{ pathname: "/shop", params: { cat: category.id } }} asChild>
              <Pressable
                accessibilityRole="link"
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: sp(4),
                  borderRadius: radius.pill,
                  borderWidth: 2,
                  borderColor: c.text,
                }}
              >
                <Text style={[type.small, { color: c.text, fontFamily: type.strong.fontFamily }]}>
                  {category[locale]}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
        <Text style={[type.small, { color: c.muted, marginTop: sp(2) }]}>{t("mobile.buyOnWeb")}</Text>
      </View>
    </ScrollView>
  );
}
