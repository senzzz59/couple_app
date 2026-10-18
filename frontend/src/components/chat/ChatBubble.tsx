import { Image } from 'expo-image';
import { ImageOff, Pause, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { chatPreview } from '@/lib/chat';
import { mediaUrl } from '@/lib/media';
import type { ChatMessage, User } from '@/lib/types';
import { openViewer, openViewerById } from '@/lib/viewer';
import { playbackSupported, playVoice } from '@/lib/voice';
import { colors, radius } from '@/theme';

import { MediaThumb } from '../Media';
import { toast } from '../motion';
import { Sticker } from '../Sticker';
import { Avatar, PressScale, Row, Txt } from '../ui';

// ---- 听过的语音（只记在这台设备上）
const HEARD_KEY = 'us.chat.heard';
let heard: Set<string> | null = null;
function heardSet() {
  if (heard) return heard;
  try {
    heard = new Set(JSON.parse(globalThis.localStorage?.getItem(HEARD_KEY) ?? '[]'));
  } catch {
    heard = new Set();
  }
  return heard;
}
function markHeard(id: string) {
  const s = heardSet();
  s.add(id);
  try {
    globalThis.localStorage?.setItem(HEARD_KEY, JSON.stringify([...s].slice(-300)));
  } catch {}
}

function VoiceBody({ m, mine, onLongPress }: { m: ChatMessage; mine: boolean; onLongPress: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [unheard, setUnheard] = useState(() => !mine && !heardSet().has(m.id));
  const secs = Math.max(1, Math.round(m.duration ?? 1));
  const width = 86 + Math.min(secs, 60) * 2.4;
  useEffect(() => () => setPlaying(false), []);
  const play = () => {
    if (!playbackSupported()) return toast('请在网页版里收听语音', 'ℹ️');
    markHeard(m.id);
    setUnheard(false);
    playVoice(mediaUrl(m.voice)!, setPlaying);
  };
  const Icon = playing ? Pause : Play;
  return (
    <Row gap={6}>
      <PressScale onPress={play} onLongPress={onLongPress} delayLongPress={350} scaleTo={0.96} accessibilityLabel={`语音 ${secs} 秒`} style={[styles.bubble, mine ? styles.mine : styles.theirs, { width, flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }]}>
        <Icon size={16} color={mine ? colors.white : colors.ink} fill={mine ? colors.white : colors.ink} />
        <Txt v="bodyStrong" color={mine ? colors.white : colors.ink}>
          {`${secs}″`}
        </Txt>
      </PressScale>
      {unheard && <View style={styles.unheard} />}
    </Row>
  );
}

function PhotoCard({ m, mine, onLongPress }: { m: ChatMessage; mine: boolean; onLongPress: () => void }) {
  const g = m.gallery;
  if (!g)
    return (
      <PressScale haptics={false} scaleTo={1} onLongPress={onLongPress} delayLongPress={350} style={[styles.card, styles.cardGone]}>
        <ImageOff size={18} color={colors.muted} />
        <Txt v="secondary">这张照片已删除</Txt>
      </PressScale>
    );
  return (
    <PressScale scaleTo={0.97} onLongPress={onLongPress} delayLongPress={350} onPress={() => openViewerById(g.id).catch((e) => toast((e as Error).message, '⚠️'))} style={styles.card} accessibilityLabel="打开这张照片">
      <MediaThumb item={{ kind: g.kind, image: g.image, video: g.video, duration: g.duration }} size={180} radius={14} />
      <Txt v="caption" style={{ paddingHorizontal: 4, paddingTop: 6 }}>
        👉 {mine ? '给 TA 看了这张' : '给你看这张'}
      </Txt>
    </PressScale>
  );
}

/** 一条消息（不含头像）：mine 在右边、粉色 */
function Body({ m, mine, onLongPress }: { m: ChatMessage; mine: boolean; onLongPress: () => void }) {
  const hold = { onLongPress, delayLongPress: 350 };
  if (m.kind === 'sticker' && m.sticker)
    return (
      <PressScale haptics={false} scaleTo={1} {...hold}>
        <Sticker id={m.sticker} size={110} />
      </PressScale>
    );
  if (m.kind === 'image' && m.image)
    return (
      <PressScale scaleTo={0.97} {...hold} onPress={() => openViewer([{ kind: 'image', image: m.image }], 0, { mode: 'plain' })} accessibilityLabel="查看图片">
        <Image source={mediaUrl(m.image, 'thumb')} style={styles.image} contentFit="cover" transition={150} />
      </PressScale>
    );
  if (m.kind === 'voice' && m.voice) return <VoiceBody m={m} mine={mine} onLongPress={onLongPress} />;
  if (m.kind === 'photo') return <PhotoCard m={m} mine={mine} onLongPress={onLongPress} />;
  return (
    <PressScale haptics={false} scaleTo={1} {...hold} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <Txt v="body" color={mine ? colors.white : colors.ink}>
        {m.content}
      </Txt>
    </PressScale>
  );
}

export function ChatBubble({ m, mine, author, authorName, onLongPress, read }: { m: ChatMessage; mine: boolean; author?: User | null; authorName: (id: string | null) => string; onLongPress: () => void; read?: boolean }) {
  const quote = m.replyToId ? (m.replyTo ? `${authorName(m.replyTo.createdBy)}：${chatPreview(m.replyTo)}` : '消息已撤回') : null;
  return (
    <View style={[styles.row, mine && { flexDirection: 'row-reverse' }]}>
      {!mine && <Avatar user={author} size={34} />}
      <View style={{ maxWidth: '76%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
        <Body m={m} mine={mine} onLongPress={onLongPress} />
        {quote && (
          <View style={styles.quote}>
            <Txt v="caption" numberOfLines={2}>
              {quote}
            </Txt>
          </View>
        )}
        {read && (
          <Txt v="caption" style={{ fontSize: 11 }}>
            已读
          </Txt>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mine: { backgroundColor: colors.accentStrong, borderTopRightRadius: 6 },
  theirs: { backgroundColor: colors.surface, borderTopLeftRadius: 6 },
  image: { width: 180, height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 6 },
  cardGone: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  quote: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  unheard: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
});
