import { Plus, Smile } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { pickMedia, releaseLocal, uploadMedia } from '@/lib/media';
import { BUILTIN_STICKERS, EMOJIS } from '@/lib/stickers';
import { invalidate, useQuery } from '@/lib/store';
import type { Sticker as StickerRow } from '@/lib/types';
import { colors, radius } from '@/theme';

import { toast } from './motion';
import { Sticker } from './Sticker';
import { PressScale } from './ui';

/** 输入框旁边的小圆按钮（表情 / 表情包 / 语音） */
export function IconToggle({ icon: Icon, active, onPress, label }: { icon: typeof Smile; active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable hitSlop={4} onPress={onPress} accessibilityLabel={label} style={[styles.toggle, active && { backgroundColor: colors.accentSoft }]}>
      <Icon size={19} color={active ? colors.accentStrong : colors.inkSoft} />
    </Pressable>
  );
}

/** 表情：点一下插到输入框里 */
export function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.panel}>
      <View style={styles.emojiGrid}>
        {EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => {
              haptic.tick();
              onPick(e);
            }}
            style={({ pressed }) => [styles.emoji, pressed && { transform: [{ scale: 1.25 }] }]}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

/** 表情包：团子 + 自己添加的；点一下直接发出去，长按自己添加的可以删除 */
export function StickerPanel({ onSend, disabled }: { onSend: (sticker: string) => void; disabled?: boolean }) {
  const stickers = useQuery<StickerRow[]>('/api/stickers');

  const addSticker = async () => {
    const picked = await pickMedia({ max: 1, video: false });
    if (!picked.length) return;
    try {
      const [m] = await uploadMedia(picked);
      await api.post('/api/stickers', { file: m.image });
      haptic.success();
      invalidate('stickers');
      toast('已添加到表情');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      releaseLocal(picked);
    }
  };

  const removeSticker = async (s: StickerRow) => {
    if (!(await confirm('删除这个表情？', '已经发出去的评论和消息不受影响'))) return;
    await api.del(`/api/stickers/${s.id}`).catch((e) => toast(e.message, '⚠️'));
    invalidate('stickers');
  };

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.panel}>
      <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={styles.stickerGrid}>
        {BUILTIN_STICKERS.map((s) => (
          <PressScale key={s.id} scaleTo={0.88} disabled={disabled} onPress={() => onSend(s.id)} style={styles.stickerCell}>
            <Sticker id={s.id} size={64} />
          </PressScale>
        ))}
        {stickers.data?.map((s) => (
          <PressScale key={s.id} scaleTo={0.88} disabled={disabled} onPress={() => onSend(s.file)} onLongPress={() => removeSticker(s)} style={styles.stickerCell}>
            <Sticker id={s.file} size={64} />
          </PressScale>
        ))}
        <PressScale scaleTo={0.9} onPress={addSticker} style={[styles.stickerCell, styles.addSticker]} accessibilityLabel="添加表情">
          <Plus size={22} color={colors.accentStrong} />
        </PressScale>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toggle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emoji: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stickerCell: { width: 74, height: 78, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface },
  addSticker: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft, gap: 2 },
});
