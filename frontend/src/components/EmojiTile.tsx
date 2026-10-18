import { Plus } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';

import { colors } from '@/theme';

/** 用户输入里最后一个字符（按「看起来的一个字」算，组合表情、带肤色的表情都算一个） */
export function lastGlyph(text: string): string | null {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter;
  const parts = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment) : Array.from(text);
  const glyph = parts.filter((p) => p.trim()).pop();
  return glyph && glyph.length <= 16 ? glyph : null;
}

/**
 * 自定义表情：预设表情后面的一个「+」格子。点一下直接弹出键盘（格子本身就是输入框），
 * 输入或粘贴任意一个表情就选上它；选中的自定义表情显示在这个格子里。
 */
export function EmojiTile({
  value,
  presets,
  onChange,
  size,
  fontSize,
  style,
  activeStyle,
}: {
  value: string | null | undefined;
  presets: readonly string[];
  onChange: (emoji: string) => void;
  /** 不传时用 style 里的尺寸（比如按百分比排的格子） */
  size?: number;
  fontSize: number;
  style: StyleProp<ViewStyle>;
  activeStyle: StyleProp<ViewStyle>;
}) {
  const input = useRef<TextInput>(null);
  const custom = !!value && !presets.includes(value);
  return (
    <View style={[style, size ? { width: size, height: size } : null, custom && activeStyle, styles.wrap]}>
      {custom ? <Text style={{ fontSize }}>{value}</Text> : <Plus size={Math.round((size ?? fontSize * 1.6) * 0.4)} color={colors.muted} />}
      <TextInput
        ref={input}
        value=""
        accessibilityLabel="自定义表情"
        onChangeText={(t) => {
          const glyph = lastGlyph(t);
          if (!glyph) return;
          onChange(glyph);
          input.current?.blur();
        }}
        // 透明地盖住整个格子；16px 免得 iPhone 放大页面
        style={[StyleSheet.absoluteFill, styles.input]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  input: { opacity: 0.02, fontSize: 16, color: 'transparent', textAlign: 'center', outlineStyle: 'none' } as never,
});
