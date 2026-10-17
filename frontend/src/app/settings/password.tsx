import { router } from 'expo-router';
import { useState } from 'react';

import { toast } from '@/components/motion';
import { SheetScreen } from '@/components/Screen';
import { Button, Field, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

export default function Password() {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [saving, setSaving] = useState(false);
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = again.length > 0 && again !== pw;
  const ok = pw.length >= 8 && again === pw;

  const save = async () => {
    if (!ok) return;
    setSaving(true);
    try {
      await api.patch('/api/me', { password: pw });
      haptic.success();
      toast('密码已修改');
      router.back();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScreen title="修改密码" action={<Button title="保存" onPress={save} loading={saving} disabled={!ok} style={{ height: 38, paddingHorizontal: 18 }} />}>
      <Field label="新密码" value={pw} onChangeText={setPw} secureTextEntry autoFocus placeholder="至少 8 位" />
      <Field label="再输入一次" value={again} onChangeText={setAgain} secureTextEntry onSubmitEditing={save} />
      {(tooShort || mismatch) && (
        <Txt v="secondary" color={colors.danger} style={{ marginLeft: 4, marginTop: -8 }}>
          {tooShort ? '至少需要 8 位' : '两次输入的不一样'}
        </Txt>
      )}
    </SheetScreen>
  );
}
