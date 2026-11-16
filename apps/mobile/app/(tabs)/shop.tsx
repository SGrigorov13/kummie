import { CATEGORIES, categoryOf, isCategoryId, products, type CategoryId } from "@kummie/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { useBrand } from "@/components/useBrand";
import { colors, radius, sp } from "@/theme";

/** The whole catalogue, two columns, filtered by taxonomy category. */
export default function ShopTab() {
  const { locale, t, colors: c, type } = useBrand();
  const params = useLocalSearchParams<{ cat?: string }>();
  const router = useRouter();
  // The URL is the single source of the filter, so Home's category links and the chips agree.
  const cat: CategoryId | undefined = params.cat && isCategoryId(params.cat) ? params.cat : undefined;
  const setCat = (next: CategoryId | undefined) => router.setParams({ cat: next });
  const { width } = useWindowDimensions();

  const list = useMemo(
    () => products.filter((product) => !cat || categoryOf(product.subcategory).id === cat),
    [cat],
  );
  const gap = sp(3);
  const cardWidth = (Math.min(width, 720) - sp(4) * 2 - gap) / 2;

  const chip = (id: CategoryId | undefined, label: string) => {
    const active = cat === id;
    return (
      <Pressable
        key={id ?? "all"}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => setCat(id)}
        style={{
          minHeight: 44,
          justifyContent: "center",
          paddingHorizontal: sp(4),
          borderRadius: radius.pill,
          borderWidth: 2,
          borderColor: c.text,
          backgroundColor: active ? c.text : "transparent",
        }}
      >
        <Text
          style={[type.small, { fontFamily: type.strong.fontFamily, color: active ? c.background : c.text }]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={list}
      numColumns={2}
      key="grid-2"
      keyExtractor={(item) => item.id}
      columnWrapperStyle={{ gap, paddingHorizontal: sp(4) }}
      contentContainerStyle={{ gap, paddingBottom: sp(8) }}
      ListHeaderComponent={
        <View style={{ gap: sp(3), paddingTop: sp(4) }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: sp(2), paddingHorizontal: sp(4) }}
          >
            {chip(undefined, t("all"))}
            {CATEGORIES.map((category) => chip(category.id, category[locale]))}
          </ScrollView>
          <Text style={[type.small, { color: c.muted, paddingHorizontal: sp(4) }]}>
            {t("results", { count: list.length })}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={[type.body, { color: c.text, paddingHorizontal: sp(4) }]}>{t("none")}</Text>
      }
      renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      ListFooterComponent={<View style={{ height: sp(2), backgroundColor: colors.paper }} />}
    />
  );
}
