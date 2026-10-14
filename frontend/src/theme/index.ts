import { Platform, TextStyle } from 'react-native';
import { WithSpringConfig } from 'react-native-reanimated';

/**
 * 设计系统：草莓牛奶（可爱简约风）。
 * - 整个 App 只用一个色系：粉色从浅到深 + 一点蜜桃色点缀
 * - 卡片以白色为主，颜色只给“主角”（首页大卡、图标底、按钮）
 * - 文字是带一点粉调的暖棕，比纯黑柔和
 * - 可爱感来自团子小人、圆体数字和果冻动画，而不是堆颜色
 */
export const colors = {
  bg: '#FFF7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#FBEEEE',
  ink: '#4B2E35',
  inkSoft: '#6E5158',
  muted: '#B48A92',
  faint: '#DBC4C8',
  line: '#F5E3E6',
  accent: '#F27B96', // 草莓粉：爱心、强调、装饰
  accentStrong: '#E5627F', // 按钮、加号：白字要读得清
  accentSoft: '#FDE2E8',
  white: '#FFFFFF',

  // 同一色系里的几个浅色，用作图标底 / 少量卡片底
  pink: '#FDE2E8',
  pinkInk: '#B9506B',
  peach: '#FCE8DA',
  peachInk: '#A0583A',
  // 下面是旧的板块色名，全部映射回粉 / 蜜桃 / 燕麦色，保证全局只有一个色系
  butter: '#FCE8DA', // 美食
  butterInk: '#A0583A',
  lilac: '#FDE2E8', // 纪念日
  lilacInk: '#B9506B',
  sky: '#F9ECEF', // 动态
  skyInk: '#9C6470',
  sage: '#F5EDE7', // 清单（燕麦色）
  sageInk: '#8A6A5C',
};

/** 小人的颜色：她是草莓粉，他是蜜桃奶油 */
export const mascot = {
  her: '#F9B4C4',
  him: '#FBD5BF',
  cheek: '#F27B96',
  eye: '#4B2E35',
  bow: '#E5627F',
  leaf: '#8FC488',
};

export const radius = { sm: 14, md: 20, lg: 26, xl: 34, pill: 999 };
export const space = (n: number) => n * 4;

export const fonts = {
  // 数字 / 英文：Nunito（圆润）
  display: 'Nunito_800ExtraBold',
  displayMedium: 'Nunito_700Bold',
  displayBold: 'Nunito_900Black',
  // 中文标题：思源柔黑子集（SIL OFL，改名为 UsRounded）
  round: 'UsRounded_Bold',
  roundMedium: 'UsRounded_Medium',
};

export const type: Record<string, TextStyle> = {
  display: { fontFamily: fonts.displayBold, fontSize: 64, lineHeight: 72, color: colors.ink },
  title: { fontFamily: fonts.round, fontSize: 28, lineHeight: 36, color: colors.ink },
  heading: { fontFamily: fonts.round, fontSize: 19, lineHeight: 26, color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  bodyStrong: { fontFamily: fonts.roundMedium, fontSize: 16, lineHeight: 23, color: colors.ink },
  caption: { fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontFamily: fonts.roundMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.3, color: colors.muted },
};

/** 可爱风的弹簧都更“Q”一点 */
export const springs = {
  soft: { damping: 15, stiffness: 170, mass: 1 } satisfies WithSpringConfig,
  snappy: { damping: 16, stiffness: 320, mass: 0.7 } satisfies WithSpringConfig,
  bouncy: { damping: 7, stiffness: 240, mass: 0.7 } satisfies WithSpringConfig,
};

export const shadow = Platform.select({
  ios: { shadowColor: '#D99AA8', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2, shadowColor: '#D99AA8' },
  default: { boxShadow: '0 6px 18px rgba(217,154,168,0.16)' },
}) as object;

export const sectionTheme = {
  eats: { bg: colors.butter, ink: colors.butterInk },
  days: { bg: colors.lilac, ink: colors.lilacInk },
  moments: { bg: colors.sky, ink: colors.skyInk },
  todos: { bg: colors.sage, ink: colors.sageInk },
};
