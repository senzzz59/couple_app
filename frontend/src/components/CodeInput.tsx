import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';

import { colors, radius } from '@/theme';

function Caret() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.set(withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1));
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.caret, style]} />;
}

/** 6 位验证码输入：隐藏的输入框 + 6 个格子，输入时数字弹出 */
export function CodeInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={styles.row}>
      {Array.from({ length }, (_, i) => {
        const ch = value[i];
        const isActive = focused && i === active && value.length < length + 1;
        return (
          <View key={i} style={[styles.cell, isActive && styles.cellActive, !!ch && styles.cellFilled]}>
            {ch ? (
              <Animated.View key={ch + i} entering={ZoomIn.springify().damping(12)}>
                <Text style={styles.char}>{ch}</Text>
              </Animated.View>
            ) : isActive ? (
              <Caret />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, height: 56, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  cellActive: { borderColor: colors.ink, borderWidth: 1.5 },
  cellFilled: { borderColor: colors.inkSoft },
  char: { fontSize: 24, fontWeight: '600', color: colors.ink },
  caret: { width: 2, height: 24, borderRadius: 1, backgroundColor: colors.ink },
  hidden: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0.01, color: 'transparent' },
});
