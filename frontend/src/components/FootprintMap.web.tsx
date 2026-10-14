import { useEffect, useMemo, useRef, useState } from 'react';

import { AMAP_JS_CODE, AMAP_JS_KEY } from '@/lib/geo';
import { buildMapHtml } from '@/lib/mapHtml';

import type { FootprintMapProps } from './FootprintMap';

/** Web 端：iframe 代替 WebView，协议相同 */
export function FootprintMap({ points, focusId, onSelect, onError }: FootprintMapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildMapHtml(AMAP_JS_KEY ?? '', AMAP_JS_CODE), []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === 'ready') setReady(true);
        if (m.type === 'select') onSelect(m.id);
        if (m.type === 'error') onError?.(m.message);
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onSelect, onError]);

  useEffect(() => {
    if (ready) ref.current?.contentWindow?.postMessage(JSON.stringify({ type: 'points', points }), '*');
  }, [ready, points]);
  useEffect(() => {
    if (ready && focusId) ref.current?.contentWindow?.postMessage(JSON.stringify({ type: 'focus', id: focusId }), '*');
  }, [ready, focusId]);

  return <iframe ref={ref} srcDoc={html} title="footprints" style={{ border: 0, width: '100%', height: '100%' }} />;
}
