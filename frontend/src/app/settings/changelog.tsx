import { Screen } from '@/components/Screen';
import { ReleaseTimeline } from '@/components/ReleaseNotes';
import { Txt } from '@/components/ui';
import { RELEASES } from '@/lib/changelog';
import { appVersion } from '@/lib/updates';

/** 全部更新记录 */
export default function Changelog() {
  return (
    <Screen back title="更新记录">
      <Txt v="secondary" style={{ marginBottom: 16, paddingHorizontal: 4 }}>
        每个版本带来了什么
      </Txt>
      <ReleaseTimeline releases={RELEASES} currentVersion={appVersion} />
    </Screen>
  );
}
