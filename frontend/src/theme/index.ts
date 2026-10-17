import { Platform, TextStyle } from 'react-native';
import { WithSpringConfig } from 'react-native-reanimated';

/**
 * 设计系统：克制的暖调。
 * - 大面积用暖白和纯白，粉色只给真正的重点（主按钮、选中、爱心）
 * - 文字对比度足够：正文深棕，次要信息中性灰，不再用一层层浅粉小字
 * - 层级靠字号和字重拉开，而不是靠堆说明文字和表情
 */
export const colors = {
  bg: '#FAF7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F4EFED',
  ink: '#2A1F23',
  inkSoft: '#5C4E53',
  muted: '#948A8D',
  faint: '#CDC4C6',
  line: '#ECE5E5',
  accent: '#E8698A',
  accentStrong: '#DC5378', // 按钮、加号：白字要读得清
  accentSoft: '#FCEAEF',
  danger: '#C8435F',
  white: '#FFFFFF',

  // 少量浅底色：图标底、少数重点卡片
  pink: '#FCE7ED',
  pinkInk: '#B04468',
  peach: '#FBEBE0',
  peachInk: '#99573A',
  // 旧的板块色名，映射回同一套颜色
  butter: '#FBEBE0',
  butterInk: '#99573A',
  lilac: '#FCE7ED',
  lilacInk: '#B04468',
  sky: '#F6EEEF',
  skyInk: '#8E5E68',
  sage: '#F2EEEA',
  sageInk: '#7D6A5F',
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

export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
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
  title: { fontFamily: fonts.round, fontSize: 30, lineHeight: 38, color: colors.ink },
  heading: { fontFamily: fonts.round, fontSize: 18, lineHeight: 26, color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.ink },
  bodyStrong: { fontFamily: fonts.roundMedium, fontSize: 16, lineHeight: 24, color: colors.ink },
  /** 次要信息：时间、数量、当前值 */
  secondary: { fontSize: 14, lineHeight: 20, color: colors.muted },
  caption: { fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontFamily: fonts.roundMedium, fontSize: 13, lineHeight: 18, color: colors.muted },
};

/** 可爱风的弹簧都更“Q”一点 */
export const springs = {
  soft: { damping: 15, stiffness: 170, mass: 1 } satisfies WithSpringConfig,
  snappy: { damping: 16, stiffness: 320, mass: 0.7 } satisfies WithSpringConfig,
  bouncy: { damping: 7, stiffness: 240, mass: 0.7 } satisfies WithSpringConfig,
};

export const shadow = Platform.select({
  ios: { shadowColor: '#2A1F23', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 1, shadowColor: '#2A1F23' },
  default: { boxShadow: '0 1px 2px rgba(42,31,35,0.04), 0 6px 20px rgba(42,31,35,0.05)' },
}) as object;

export const sectionTheme = {
  eats: { bg: colors.butter, ink: colors.butterInk },
  days: { bg: colors.lilac, ink: colors.lilacInk },
  moments: { bg: colors.sky, ink: colors.skyInk },
  todos: { bg: colors.sage, ink: colors.sageInk },
};
