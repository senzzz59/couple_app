import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { appUpdates, appVersion, updateVersion, useAppUpdates } from '@/lib/updates.web';
import { colors, radius } from '@/theme';
import { toast } from './motion';
import { Button, Txt } from './ui';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function WebSettings() {
  const update = useAppUpdates();
  const installPrompt = useRef<InstallEvent | null>(null);
  const [guide, setGuide] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const detect = () => setStandalone(window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const capture = (event: Event) => { event.preventDefault(); installPrompt.current = event as InstallEvent; };
    detect();
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', detect);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', detect); };
  }, []);
  const check = async () => {
    setBusy(true);
    try {
      if (update.pending || await appUpdates.check(true)) {
        if (!await appUpdates.install()) toast('刷新失败，请重试', '⚠️');
      } else {
        const error = appUpdates.getState().error;
        toast(error ? '检查失败，请联网后重试' : '已经是最新版本', error ? '⚠️' : '✅');
      }
    } finally { setBusy(false); }
  };
  return (
    <View style={{ marginTop: 20, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 12 }}>
      <Txt v="bodyStrong">网页版 · v{appVersion}</Txt>
      <Txt v="caption">{update.pending ? '新版已准备好，刷新后生效。请先保存正在编辑的内容。' : '打开网页会获取最新版本，使用过程中不会突然刷新。'}</Txt>
      <Button title={update.pending ? '刷新使用新版' : '检查网页更新'} loading={busy} onPress={check} />
      {!standalone && <Button title="添加到主屏幕" variant="ghost" onPress={async () => {
        if (installPrompt.current) {
          await installPrompt.current.prompt();
          await installPrompt.current.userChoice;
          installPrompt.current = null;
        } else setGuide(!guide);
      }} />}
      {guide && <Txt v="body">iPhone：用 Safari 打开，点击分享，再选择「添加到主屏幕」。安卓：在浏览器菜单中选择「安装应用」或「添加到主屏幕」。</Txt>}
      <Txt v="caption">纪念日与清单可在网页内查看。网页关闭后的提醒和戳一戳通知暂未开启。</Txt>
      {updateVersion && <Txt v="caption" color={colors.faint}>当前更新：{updateVersion}</Txt>}
    </View>
  );
}
