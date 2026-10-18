import { ImagePlus, Keyboard, Mic, Send, Smile, Sticker as StickerIcon, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { api } from '@/lib/api';
import { chatPreview } from '@/lib/chat';
import { haptic } from '@/lib/haptics';
import { pickMedia, releaseLocal, uploadMedia } from '@/lib/media';
import { setQueryData } from '@/lib/store';
import type { ChatMessage } from '@/lib/types';
import { createRecorder, uploadVoice, voiceSupported } from '@/lib/voice';
import { colors, radius } from '@/theme';

import { EmojiPanel, IconToggle, StickerPanel } from '../ExpressionPanels';
import { toast } from '../motion';
import { PressScale, Row, Txt } from '../ui';

type Panel = 'emoji' | 'sticker' | null;
export type ReplyTarget = { id: string; name: string; message: Pick<ChatMessage, 'kind' | 'content'> };
type Body = { kind: ChatMessage['kind']; content?: string; image?: string | null; sticker?: string; voice?: string; duration?: number | null };

const MAX_SECONDS = 60;

/** 发出去后先放进列表，实时通道再刷新一次 */
export async function sendChat(body: Body & { replyToId?: string | null }) {
  const msg = await api.post<ChatMessage>('/api/chat/messages', body);
  setQueryData<ChatMessage[]>('/api/chat/messages', (prev) => [msg, ...(prev ?? []).filter((m) => m.id !== msg.id)]);
  return msg;
}

/** 聊天输入框：文字 + 表情、表情包、图片、按住说话 */
export function ChatComposer({ replyTo, onCancelReply, onSent, focusSignal = 0 }: { replyTo: ReplyTarget | null; onCancelReply: () => void; onSent?: () => void; focusSignal?: number }) {
  const [text, setText] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [voice, setVoice] = useState(false);
  const [sending, setSending] = useState<'text' | 'image' | 'sticker' | 'voice' | null>(null);
  const input = useRef<TextInput>(null);
  const canVoice = voiceSupported();

  // 选了「回复」：切回打字并把光标放进输入框
  useEffect(() => {
    if (!focusSignal) return;
    const t = setTimeout(() => {
      setVoice(false);
      setPanel(null);
      setTimeout(() => input.current?.focus(), 30);
    }, 0);
    return () => clearTimeout(t);
  }, [focusSignal]);

  const send = async (body: Body, kind: NonNullable<typeof sending>) => {
    setSending(kind);
    try {
      await sendChat({ ...body, replyToId: replyTo?.id ?? null });
      haptic.success();
      if (kind === 'text') setText('');
      if (kind === 'sticker') setPanel(null);
      onCancelReply();
      onSent?.();
      return true;
    } catch (e) {
      toast((e as Error).message, '⚠️');
      return false;
    } finally {
      setSending(null);
    }
  };

  const sendText = () => {
    const content = text.trim();
    if (content && !sending) send({ kind: 'text', content }, 'text');
  };

  const sendImage = async () => {
    const picked = await pickMedia({ max: 1, video: false });
    if (!picked.length) return;
    setSending('image');
    try {
      const [m] = await uploadMedia(picked);
      await send({ kind: 'image', image: m.image }, 'image');
    } catch (e) {
      toast((e as Error).message, '⚠️');
      setSending(null);
    } finally {
      releaseLocal(picked);
    }
  };

  const toggle = (p: Panel) => {
    haptic.tick();
    setVoice(false);
    setPanel((cur) => (cur === p ? null : p));
    if (p !== 'emoji') input.current?.blur();
  };

  return (
    <View style={{ gap: 8 }}>
      {replyTo && (
        <Animated.View entering={FadeInDown.duration(150)} exiting={FadeOut.duration(120)}>
          <Row gap={6} style={styles.replying}>
            <Txt v="caption" style={{ flex: 1 }} numberOfLines={1}>
              回复 <Txt v="caption" style={{ fontWeight: '700' }} color={colors.ink}>{replyTo.name}</Txt>：{chatPreview(replyTo.message)}
            </Txt>
            <Pressable hitSlop={8} onPress={onCancelReply} accessibilityLabel="取消回复">
              <X size={14} color={colors.muted} />
            </Pressable>
          </Row>
        </Animated.View>
      )}
      <Row gap={4} style={styles.box}>
        {canVoice && (
          <IconToggle
            icon={voice ? Keyboard : Mic}
            active={false}
            onPress={() => {
              haptic.tick();
              setPanel(null);
              setVoice((v) => !v);
              if (voice) setTimeout(() => input.current?.focus(), 50);
            }}
            label={voice ? '打字' : '语音'}
          />
        )}
        {voice ? (
          <HoldToTalk busy={sending === 'voice'} onRecorded={(r) => send({ kind: 'voice', voice: r.voice, duration: r.duration }, 'voice')} onBusy={(b) => setSending(b ? 'voice' : null)} />
        ) : (
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder={replyTo ? `回复 ${replyTo.name}…` : '说点什么…'}
            placeholderTextColor={colors.faint}
            style={[styles.input, !canVoice && { marginLeft: 10 }]}
            onSubmitEditing={sendText}
            onFocus={() => panel === 'sticker' && setPanel(null)}
            returnKeyType="send"
            submitBehavior="submit"
            maxLength={1000}
          />
        )}
        <IconToggle icon={Smile} active={panel === 'emoji'} onPress={() => toggle('emoji')} label="表情" />
        <IconToggle icon={StickerIcon} active={panel === 'sticker'} onPress={() => toggle('sticker')} label="表情包" />
        {text.trim() && !voice ? (
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
      {panel === 'sticker' && <StickerPanel disabled={!!sending} onSend={(sticker) => send({ kind: 'sticker', sticker }, 'sticker')} />}
    </View>
  );
}

/** 按住说话：上滑取消，最长 60 秒，松开发送 */
function HoldToTalk({ busy, onRecorded, onBusy }: { busy: boolean; onRecorded: (r: { voice: string; duration: number | null }) => Promise<boolean>; onBusy: (b: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'cancel'>('idle');
  const [secs, setSecs] = useState(0);
  const recorder = useRef<ReturnType<typeof createRecorder> | null>(null);
  const startY = useRef(0);
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => {
    clearInterval(tick.current);
    recorder.current?.cancel();
  }, []);

  const finish = async (keep: boolean) => {
    clearInterval(tick.current);
    const rec = recorder.current;
    recorder.current = null;
    setState('idle');
    if (!rec) return;
    if (!keep) {
      rec.cancel();
      return;
    }
    const wasStarted = started.current;
    const r = await rec.stop();
    if (!wasStarted || !r) return toast('按住说话，松开发送', '🎤');
    if (r.duration < 1) return toast('说话时间太短', '🎤');
    onBusy(true);
    try {
      const up = await uploadVoice(r);
      await onRecorded({ voice: up.voice, duration: up.duration ?? Math.round(r.duration * 10) / 10 });
    } catch (e) {
      toast((e as Error).message, '⚠️');
      onBusy(false);
    }
  };

  const begin = (y: number) => {
    if (busy) return;
    startY.current = y;
    started.current = false;
    setReady(false);
    setSecs(0);
    setState('recording');
    haptic.medium();
    const rec = createRecorder();
    recorder.current = rec;
    rec
      .start()
      .then(() => {
        if (recorder.current !== rec) return;
        started.current = true;
        setReady(true);
        const t0 = Date.now();
        tick.current = setInterval(() => {
          const s = Math.floor((Date.now() - t0) / 1000);
          setSecs(s);
          if (s >= MAX_SECONDS) finish(stateRef.current !== 'cancel');
        }, 250);
      })
      .catch((e) => {
        if (recorder.current === rec) recorder.current = null;
        setState('idle');
        toast((e as Error).message, '⚠️');
      });
  };

  const label = busy ? '发送中…' : state === 'idle' ? '按住 说话' : state === 'cancel' ? '松开手指，取消发送' : '松开 发送';
  return (
    <View style={{ flex: 1 }}>
      <View
        accessibilityRole="button"
        accessibilityLabel="按住说话"
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => begin(e.nativeEvent.pageY)}
        onResponderMove={(e) => state !== 'idle' && setState(e.nativeEvent.pageY < startY.current - 60 ? 'cancel' : 'recording')}
        onResponderRelease={() => finish(stateRef.current === 'recording')}
        onResponderTerminate={() => finish(false)}
        style={[styles.hold, state !== 'idle' && styles.holdOn, Platform.OS === 'web' && ({ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' } as object)]}>
        {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Txt v="bodyStrong" color={state === 'cancel' ? colors.danger : colors.inkSoft}>{label}</Txt>}
      </View>
      {state !== 'idle' && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} pointerEvents="none" style={[styles.recording, state === 'cancel' && { backgroundColor: colors.danger }]}>
          <Mic size={28} color={colors.white} />
          <Txt v="title" color={colors.white} style={{ fontSize: 24 }}>
            {`0:${String(secs).padStart(2, '0')}`}
          </Txt>
          <Txt v="caption" color="rgba(255,255,255,0.85)">
            {state === 'cancel' ? '松开手指，取消发送' : ready ? `上滑取消 · 最长 ${MAX_SECONDS} 秒` : '准备麦克风…'}
          </Txt>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  replying: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', maxWidth: '100%' },
  box: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 4, height: 46 },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: colors.ink, height: 46 },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  hold: { height: 36, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  holdOn: { backgroundColor: colors.faint },
  recording: { position: 'absolute', bottom: 70, alignSelf: 'center', width: 190, paddingVertical: 18, borderRadius: radius.lg, backgroundColor: 'rgba(42,31,35,0.88)', alignItems: 'center', gap: 6 },
});
