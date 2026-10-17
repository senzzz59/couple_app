import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { fileUrl } from "@/lib/api";
import {
  categoryEmoji,
  categoryTone,
  placeArea,
  type PlaceImage,
  stableRandom,
} from "@/lib/food";
import { haptic } from "@/lib/haptics";
import { fmtKm } from "@/lib/location";
import type { Place } from "@/lib/types";
import { colors, fonts } from "@/theme";

import { PressScale } from "./ui";

const TAPES = [
  "rgba(252,214,224,0.82)",
  "rgba(251,228,206,0.85)",
  "rgba(226,238,224,0.85)",
  "rgba(225,235,245,0.85)",
  "rgba(236,229,245,0.85)",
];

/** 照片区域：自己拍的 / 高德的店铺图；都没有就用菜系颜色 + 大图标 */
export function PlaceArt({
  p,
  image,
  emojiSize,
  thumb = true,
}: {
  p: Place;
  image: PlaceImage;
  emojiSize: number;
  thumb?: boolean;
}) {
  const tone = categoryTone(p.category ?? p.name);
  if (image?.kind === "file")
    return (
      <Image
        source={fileUrl(image.name, thumb)}
        placeholder={thumb ? undefined : fileUrl(image.name, true)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={250}
      />
    );
  if (image?.kind === "url")
    return (
      <Image
        source={image.url}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={250}
      />
    );
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.blank,
        { backgroundColor: tone.bg },
      ]}
    >
      <Text
        style={{
          fontSize: emojiSize,
          transform: [{ rotate: `${(stableRandom(p.id, 3) - 0.5) * 24}deg` }],
        }}
      >
        {categoryEmoji(p.category)}
      </Text>
    </View>
  );
}

/**
 * 「想去」的店是一张贴在墙上的拍立得：
 * 照片 = 店铺图（没有就用菜系颜色 + 图标），左下角一直贴着菜系标签；
 * 白边下面写店名，再写人均和区域 / 距离，两家同类的店也分得开。
 * 每张的倾斜角度和胶带颜色按店算，刷新不会变。长按看简介。
 */
export function PlacePolaroid({
  p,
  image,
  width,
  km,
  onPress,
  onLongPress,
}: {
  p: Place;
  image: PlaceImage;
  width: number;
  km?: number | null;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const tilt = (stableRandom(p.id) - 0.5) * 5;
  const tape = TAPES[Math.floor(stableRandom(p.id, 7) * TAPES.length)];
  const photo = width - 16;
  const place = km != null ? fmtKm(km) : (placeArea(p) ?? p.city);
  const meta = [p.price ? `¥${p.price}/人` : null, place]
    .filter(Boolean)
    .join(" · ");
  // 倾斜放在外层：PressScale 自己的缩放动画会覆盖同一层的 transform
  return (
    <View style={{ width, transform: [{ rotate: `${tilt}deg` }] }}>
      <PressScale
        onPress={onPress}
        onLongPress={() => {
          haptic.medium();
          onLongPress();
        }}
        delayLongPress={350}
        scaleTo={0.95}
        accessibilityLabel={p.name}
        accessibilityHint="长按看简介"
        style={styles.frame}
      >
        <View style={[styles.photo, { width: photo, height: photo }]}>
          <PlaceArt p={p} image={image} emojiSize={photo * 0.4} />
          {!!p.category && (
            <View style={styles.tag}>
              <Text style={styles.tagText} numberOfLines={1}>
                {categoryEmoji(p.category)} {p.category}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.caption}>
          <Text style={styles.name} numberOfLines={1}>
            {p.name}
          </Text>
          {!!meta && (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.tape,
            {
              backgroundColor: tape,
              left: width / 2 - 28,
              transform: [{ rotate: `${-tilt * 1.6 - 3}deg` }],
            },
          ]}
        />
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.white,
    padding: 8,
    paddingBottom: 4,
    borderRadius: 4,
    boxShadow: "0 1px 2px rgba(42,31,35,0.08), 0 10px 24px rgba(42,31,35,0.08)",
  },
  photo: {
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
    borderRadius: 2,
  },
  blank: { alignItems: "center", justifyContent: "center" },
  tag: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: "86%",
    paddingHorizontal: 9,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  tagText: { fontSize: 12, fontWeight: "600", color: colors.ink },
  caption: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 2,
    alignItems: "center",
    gap: 2,
  },
  name: {
    fontFamily: fonts.round,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    maxWidth: "100%",
  },
  meta: { fontSize: 13, lineHeight: 18, color: colors.muted, maxWidth: "100%" },
  tape: {
    position: "absolute",
    top: -9,
    width: 56,
    height: 20,
    borderRadius: 2,
  },
});
