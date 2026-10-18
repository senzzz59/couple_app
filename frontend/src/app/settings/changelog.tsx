import { Screen } from '@/components/Screen';
import { ReleaseTimeline } from '@/components/ReleaseNotes';
import { RELEASES } from '@/lib/changelog';
import { appVersion } from '@/lib/updates';

/** 全部更新记录 */
export default function Changelog() {
  return (
    <Screen back title="更新记录">
      <ReleaseTimeline releases={RELEASES} currentVersion={appVersion} />
    </Screen>
  );
}
