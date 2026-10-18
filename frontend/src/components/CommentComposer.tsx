import { ImagePlus, Send, Smile, Sticker as StickerIcon, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { pickMedia, releaseLocal, uploadMedia } from '@/lib/media';
import { invalidate } from '@/lib/store';
import { colors, radius } from '@/theme';

import { EmojiPanel, IconToggle, StickerPanel } from './ExpressionPanels';
import { toast } from './motion';
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

      {panel === 'emoji' && <EmojiPanel onPick={(e) => setText((t) => t + e)} />}
      {panel === 'sticker' && <StickerPanel disabled={!!sending} onSend={(sticker) => send({ sticker }, 'sticker')} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  replying: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', maxWidth: '100%' },
  box: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 4, height: 44 },
  input: { flex: 1, minWidth: 0, fontSize: 16, color: colors.ink, height: 44 },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
