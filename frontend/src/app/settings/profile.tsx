import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DatePicker } from '@/components/DatePicker';
import { Segmented, toast } from '@/components/motion';
import { SheetLoading, SheetScreen } from '@/components/Screen';
import { Avatar, Button, Field, PressScale, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { pickMedia, releaseLocal, uploadMedia } from '@/lib/media';
import { useCouple } from '@/lib/session';
import { invalidate } from '@/lib/store';
import type { User } from '@/lib/types';
import { useKept } from '@/lib/useKept';
import { colors } from '@/theme';

type Gender = 'male' | 'female' | 'none';

export default function Profile() {
  const { me } = useCouple();
  if (!me) return <SheetLoading title="个人资料" q={{ error: null, refresh: async () => invalidate('me') }} />;
  return <ProfileForm key={me.id} me={me} />;
}

function ProfileForm({ me }: { me: User }) {
  const [name, setName] = useKept('profile:name', me.name);
  const [gender, setGender] = useKept<Gender>('profile:gender', me.gender ?? 'none');
  const [birthday, setBirthday] = useKept<string | null>('profile:birthday', me.birthday);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const changeAvatar = async () => {
    const picked = await pickMedia({ max: 1, video: false });
    if (!picked.length) return;
    setUploading(true);
    try {
      const [m] = await uploadMedia(picked);
      await api.patch('/api/me', { avatar: m.image });
      haptic.success();
      invalidate('me');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      releaseLocal(picked);
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/me', { name: name.trim() || me.name, gender: gender === 'none' ? null : gender, birthday });
      haptic.success();
      invalidate('me');
      router.back();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScreen title="个人资料" action={<Button title="保存" onPress={save} loading={saving} style={{ height: 38, paddingHorizontal: 18 }} />}>
      <View style={styles.avatar}>
        <PressScale onPress={changeAvatar} disabled={uploading} accessibilityLabel="更换头像">
          <Avatar user={me} size={96} />
        </PressScale>
        <PressScale haptics={false} onPress={changeAvatar} disabled={uploading}>
          <Txt v="bodyStrong" color={colors.accentStrong} style={{ fontSize: 15 }}>
            {uploading ? '上传中…' : '更换头像'}
          </Txt>
        </PressScale>
      </View>
      <Field label="昵称" value={name} onChangeText={setName} maxLength={40} />
      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          性别
        </Txt>
        <Segmented
          options={[
            { key: 'female', label: '女生' },
            { key: 'male', label: '男生' },
            { key: 'none', label: '不设置' },
          ]}
          value={gender}
          onChange={setGender}
        />
      </View>
      <DatePicker label="生日" value={birthday} onChange={setBirthday} showLunar />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', gap: 12, paddingVertical: 8 },
});
