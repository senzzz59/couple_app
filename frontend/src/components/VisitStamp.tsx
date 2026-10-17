import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** 「吃过」的店封面上盖的章 */
export function VisitStamp({ count }: { count: number }) {
  return (
    <View style={styles.stamp} pointerEvents="none">
      <View style={styles.stampInner}>
        <Text style={styles.stampSmall}>去过</Text>
        <Text style={styles.stampBig}>{count}</Text>
        <Text style={styles.stampSmall}>次</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: { position: 'absolute', right: 12, top: 12, width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], backgroundColor: 'rgba(220,83,120,0.82)' },
  stampInner: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  stampSmall: { color: colors.white, fontFamily: fonts.round, fontSize: 9, lineHeight: 11 },
  stampBig: { color: colors.white, fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 20 },
});
