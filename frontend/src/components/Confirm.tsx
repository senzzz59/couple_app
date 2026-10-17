import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ConfirmRequest, setConfirmHost } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

import { Blob } from './Mascot';
import { Sheet } from './Sheet';
import { Button, Row, Txt } from './ui';

/** 全局确认弹层：confirm() 会排队，一次只显示一个 */
export function ConfirmHost() {
  const [current, setCurrent] = useState<ConfirmRequest | null>(null);
  const [open, setOpen] = useState(false);
  const queue = useRef<ConfirmRequest[]>([]);
  const active = useRef<ConfirmRequest | null>(null);
  const showNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    const waiting = queue.current;
    const showNext = () => {
      const next = queue.current.shift() ?? null;
      active.current = next;
      if (next) {
        setCurrent(next);
        setOpen(true);
        if (next.tone === 'danger') haptic.warn();
      }
    };
    setConfirmHost((req) => {
      queue.current.push(req);
      if (!active.current) showNext();
    });
    showNextRef.current = showNext;
    return () => {
      setConfirmHost(null);
      // 卸载时把等待中的都当成取消
      active.current?.resolve(false);
      waiting.splice(0).forEach((r) => r.resolve(false));
    };
  }, []);

  const answer = (ok: boolean) => {
    const req = active.current;
    if (!req) return;
    active.current = null;
    setOpen(false);
    req.resolve(ok);
    if (ok) haptic.tap();
    // 等收起动画播完再弹下一个
    setTimeout(() => {
      if (!active.current) showNextRef.current();
    }, 260);
  };

  const danger = current?.tone !== 'normal';
  return (
    <Sheet visible={open} onClose={() => answer(false)}>
      {current && (
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <Blob who={danger ? 'her' : 'him'} size={72} mood={danger ? 'sleepy' : 'happy'} />
          <Txt v="heading" style={{ textAlign: 'center', marginTop: 6 }}>
            {current.title}
          </Txt>
          {!!current.message && (
            <Txt v="caption" style={{ textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
              {current.message}
            </Txt>
          )}
          <Row gap={10} style={{ alignSelf: 'stretch', marginTop: 14 }}>
            <Button title={current.cancelText} variant="secondary" onPress={() => answer(false)} style={{ flex: 1 }} />
            <Button
              title={current.okText}
              onPress={() => answer(true)}
              style={[{ flex: 1 }, danger && { backgroundColor: colors.pinkInk }]}
            />
          </Row>
        </View>
      )}
    </Sheet>
  );
}
