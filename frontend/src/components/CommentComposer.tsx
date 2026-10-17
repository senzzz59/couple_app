import { ImagePlus, Plus, Send, Smile, Sticker as StickerIcon, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

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
import { PressScale, Row, Txt } from './ui';

type Panel = 'emoji' | 'sticker' | null;

/**
 * 评论输入框：文字 + 表情，表情包（团子 + 自己添加的），图片。
 * replyTo：正在回复哪条评论（显示「回复 小雨」）。
 */
export function CommentComposer({
  momentId,
  replyTo,
  onCancelReply,
  onSent,
}: {
  momentId: string;
  replyTo?: { id: string; name: string } | null;
  onCancelReply?: () => void;
  onSent?: () => void;
}) {
  const [text, setText] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [sending, setSending] = useState<'text' | 'image' | 'sticker' | null>(null);
  const stickers = useQuery<StickerRow[]>(panel === 'sticker' ? '/api/stickers' : null);
  const input = useRef<TextInput>(null);

  const send = async (body: { content?: string; image?: string; sticker?: string }, kind: 'text' | 'image' | 'sticker') => {
    setSending(kind);
    try {
      await api.post('/api/comments', { momentId, replyToId: replyTo?.id ?? null, content: body.content ?? '', image: body.image ?? null, sticker: body.sticker ?? null });
      haptic.success();
      invalidate('moments');
      if (kind === 'text') setText('');
      setPanel(null);
      onSent?.();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSending(null);
    }
  };

  const sendText = () => {
    const content = text.trim();
    if (content) send({ content }, 'text');
  };

  const sendImage = async () => {
    const picked = await pickMedia({ max: 1, video: false });
    if (!picked.length) return;
    setSending('image');
    try {
      const [m] = await uploadMedia(picked);
      await send({ image: m.image ?? undefined, content: text.trim() || undefined }, 'image');
      setText('');
    } catch (e) {
      toast((e as Error).message, '⚠️');
      setSending(null);
    } finally {
      releaseLocal(picked);
    }
  };

  const addSticker = async () => {
    const picked = await pickMedia({ max: 1, video: false });
    if (!picked.length) return;
    try {
      const [m] = await uploadMedia(picked);
      await api.post('/api/stickers', { file: m.image });
      haptic.success();
      invalidate('stickers');
      toast('添加到表情包啦', '🎀', '你们俩都能用');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      releaseLocal(picked);
    }
  };

  const removeSticker = async (s: StickerRow) => {
    if (!(await confirm('删除这个表情？', '已经发出去的评论不受影响'))) return;
    await api.del(`/api/stickers/${s.id}`).catch((e) => toast(e.message, '⚠️'));
    invalidate('stickers');
  };

  const toggle = (p: Panel) => {
    haptic.tick();
    setPanel((cur) => (cur === p ? null : p));
    if (p !== 'emoji') input.current?.blur();
  };

  return (
    <Animated.View entering={FadeIn.duration(150)} style={{ marginTop: 10, gap: 8 }}>
      {replyTo && (
        <Animated.View entering={FadeInDown.duration(150)} exiting={FadeOut.duration(120)}>
          <Row gap={6} style={styles.replying}>
            <Txt v="caption" style={{ flex: 1 }} numberOfLines={1}>
              回复 <Txt v="caption" style={{ fontWeight: '700' }} color={colors.ink}>{replyTo.name}</Txt>
            </Txt>
            <Pressable hitSlop={8} onPress={onCancelReply} accessibilityLabel="取消回复">
              <X size={14} color={colors.muted} />
            </Pressable>
          </Row>
        </Animated.View>
      )}
      <Row gap={4} style={styles.box}>
        <TextInput
          ref={input}
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder={replyTo ? `回复 ${replyTo.name}…` : '说点什么…'}
          placeholderTextColor={colors.faint}
          style={styles.input}
          onSubmitEditing={sendText}
          onFocus={() => panel === 'sticker' && setPanel(null)}
          returnKeyType="send"
          maxLength={500}
        />
        <IconToggle icon={Smile} active={panel === 'emoji'} onPress={() => toggle('emoji')} label="表情" />
        <IconToggle icon={StickerIcon} active={panel === 'sticker'} onPress={() => toggle('sticker')} label="表情包" />
        {text.trim() ? (
          <PressScale onPress={sendText} disabled={!!sending} style={styles.send} accessibilityLabel="发送">
            {sending === 'text' ? <ActivityIndicator size="small" color={colors.white} /> : <Send size={16} color={colors.white} />}
          </PressScale>
        ) : (
          <PressScale onPress={sendImage} disabled={!!sending} style={[styles.send, { backgroundColor: colors.surface }]} accessibilityLabel="发图片">
            {sending === 'image' ? <ActivityIndicator size="small" color={colors.accent} /> : <ImagePlus size={17} color={colors.inkSoft} />}
          </PressScale>
        )}
      </Row>

      {panel === 'emoji' && (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.panel}>
          <View style={styles.emojiGrid}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  haptic.tick();
                  setText((t) => t + e);
                }}
                style={({ pressed }) => [styles.emoji, pressed && { transform: [{ scale: 1.25 }] }]}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      {panel === 'sticker' && (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.panel}>
          <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={styles.stickerGrid}>
            {BUILTIN_STICKERS.map((s) => (
              <PressScale key={s.id} scaleTo={0.88} disabled={!!sending} onPress={() => send({ sticker: s.id }, 'sticker')} style={styles.stickerCell}>
                <Sticker id={s.id} size={64} />
              </PressScale>
            ))}
            {stickers.data?.map((s) => (
              <PressScale key={s.id} scaleTo={0.88} disabled={!!sending} onPress={() => send({ sticker: s.file }, 'sticker')} onLongPress={() => removeSticker(s)} style={styles.stickerCell}>
                <Sticker id={s.file} size={64} />
              </PressScale>
            ))}
            <PressScale scaleTo={0.9} onPress={addSticker} style={[styles.stickerCell, styles.addSticker]} accessibilityLabel="添加表情">
              <Plus size={22} color={colors.accentStrong} />
              <Txt v="caption" color={colors.pinkInk} style={{ fontSize: 10 }}>
                添加
              </Txt>
            </PressScale>
          </ScrollView>
          <Txt v="caption" style={{ fontSize: 10, textAlign: 'center', marginTop: 4 }}>
            点一下直接发送 · 长按自己添加的表情可以删除
          </Txt>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function IconToggle({ icon: Icon, active, onPress, label }: { icon: typeof Smile; active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable hitSlop={4} onPress={onPress} accessibilityLabel={label} style={[styles.toggle, active && { backgroundColor: colors.accentSoft }]}>
      <Icon size={19} color={active ? colors.accentStrong : colors.inkSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  replying: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', maxWidth: '100%' },
  box: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 4, height: 44 },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: colors.ink, height: 44 },
  toggle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emoji: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stickerCell: { width: 74, height: 78, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface },
  addSticker: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft, gap: 2 },
});
