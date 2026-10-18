import { StyleSheet, View } from 'react-native';

import { CHANGE_LABEL, fmtReleaseDate, type ChangeType, type Release } from '@/lib/changelog';
import { colors, radius, shadow } from '@/theme';

import { Row, Txt } from './ui';

const TAG: Record<ChangeType, { bg: string; ink: string }> = {
  new: { bg: colors.accentSoft, ink: colors.accentStrong },
  improve: { bg: colors.sage, ink: colors.sageInk },
  fix: { bg: colors.butter, ink: colors.butterInk },
};

/** 一次更新：版本号、日期、标题和每一条改动；current 是正在用的这个版本 */
export function ReleaseCard({ r, current }: { r: Release; current?: boolean }) {
  return (
    <View style={[styles.card, current && styles.cardCurrent]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          {r.version ? (
            <View style={[styles.version, current && { backgroundColor: colors.accentStrong }]}>
              <Txt v="caption" color={current ? colors.white : colors.inkSoft} style={styles.versionText}>
                v{r.version}
              </Txt>
            </View>
          ) : (
            <View style={[styles.version, { backgroundColor: colors.accentSoft }]}>
              <Txt v="caption" color={colors.accentStrong} style={styles.versionText}>
                即将发布
              </Txt>
            </View>
          )}
          {current && (
            <Txt v="caption" color={colors.accentStrong} style={{ fontWeight: '600' }}>
              正在使用
            </Txt>
          )}
        </Row>
        <Txt v="caption">{fmtReleaseDate(r.date)}</Txt>
      </Row>
      <Txt v="heading" style={{ fontSize: 17, marginTop: 10 }}>
        {r.title}
      </Txt>
      <View style={{ gap: 8, marginTop: 10 }}>
        {r.changes.map((c, i) => (
          <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
            <View style={[styles.tag, { backgroundColor: TAG[c.type].bg }]}>
              <Txt v="caption" color={TAG[c.type].ink} style={styles.tagText}>
                {CHANGE_LABEL[c.type]}
              </Txt>
            </View>
            <Txt v="body" style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>
              {c.text}
            </Txt>
          </Row>
        ))}
      </View>
    </View>
  );
}

/** 时间线：左边一串圆点连起来，右边是每次更新 */
export function ReleaseTimeline({ releases, currentVersion }: { releases: Release[]; currentVersion?: string | null }) {
  return (
    <View>
      {releases.map((r, i) => {
        const current = !!r.version && r.version === currentVersion;
        return (
          <Row key={r.id} gap={12} style={{ alignItems: 'stretch' }}>
            <View style={{ alignItems: 'center', width: 14 }}>
              <View style={[styles.dot, current && styles.dotCurrent]} />
              {i < releases.length - 1 && <View style={styles.line} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <ReleaseCard r={r} current={current} />
            </View>
          </Row>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line, ...shadow },
  cardCurrent: { borderColor: colors.accent },
  version: { paddingHorizontal: 9, height: 22, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  versionText: { fontWeight: '700', fontSize: 12 },
  tag: { paddingHorizontal: 7, height: 21, borderRadius: 7, justifyContent: 'center', marginTop: 0 },
  tagText: { fontWeight: '700', fontSize: 11 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.faint, marginTop: 20, borderWidth: 3, borderColor: colors.bg },
  dotCurrent: { backgroundColor: colors.accent, borderColor: colors.accentSoft },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 2 },
});
