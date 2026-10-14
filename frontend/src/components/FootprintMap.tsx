import { useEffect, useMemo, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';

import { AMAP_JS_CODE, AMAP_JS_KEY } from '@/lib/geo';
import { buildMapHtml, MapPoint } from '@/lib/mapHtml';
import { colors } from '@/theme';

export interface FootprintMapProps {
  points: MapPoint[];
  focusId: string | null;
  onSelect: (id: string | null) => void;
  onError?: (message: string) => void;
}

/** 原生端：WebView 里跑高德 JS 地图（Web 端见 FootprintMap.web.tsx） */
export function FootprintMap({ points, focusId, onSelect, onError }: FootprintMapProps) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildMapHtml(AMAP_JS_KEY ?? '', AMAP_JS_CODE), []);

  const send = (cmd: object) => ref.current?.injectJavaScript(`window.__cmd(${JSON.stringify(cmd)});true;`);
  useEffect(() => {
    if (ready) send({ type: 'points', points });
  }, [ready, points]);
  useEffect(() => {
    if (ready && focusId) send({ type: 'focus', id: focusId });
  }, [ready, focusId]);

  return (
    <WebView
      ref={ref}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://localhost/' }}
      style={{ flex: 1, backgroundColor: colors.bg }}
      onMessage={(e) => {
        try {
          const m = JSON.parse(e.nativeEvent.data);
          if (m.type === 'ready') setReady(true);
          if (m.type === 'select') onSelect(m.id);
          if (m.type === 'error') onError?.(m.message);
        } catch {}
      }}
    />
  );
}
