import { ApiError, getBaseUrl, getToken } from './api';

/**
 * 语音消息（网页）：MediaRecorder 录音。iPhone 录出来是 mp4，安卓 / 电脑 Chrome 是 webm，
 * 服务器统一转成 m4a，两边都能播。
 */
export type Recording = { blob: Blob; type: string; duration: number };

const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export const voiceSupported = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export const playbackSupported = () => typeof window !== 'undefined' && typeof window.Audio !== 'undefined';

function pickType() {
  for (const t of TYPES) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}

export function createRecorder() {
  let stream: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let cancelled = false;

  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  return {
    /** 要麦克风权限；第一次会弹出系统询问 */
    async start() {
      cancelled = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const name = (e as { name?: string }).name;
        throw new Error(name === 'NotAllowedError' ? '没有麦克风权限：在浏览器设置里允许使用麦克风' : '打不开麦克风');
      }
      if (cancelled) return release();
      const type = pickType();
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250);
      startedAt = Date.now();
    },
    /** 停下来，返回录好的声音；没开始录或已取消返回 null */
    stop(): Promise<Recording | null> {
      const r = rec;
      if (!r || r.state === 'inactive') {
        cancelled = true;
        release();
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        r.onstop = () => {
          release();
          const type = r.mimeType || chunks[0]?.type || 'audio/webm';
          resolve(chunks.length ? { blob: new Blob(chunks, { type }), type, duration: (Date.now() - startedAt) / 1000 } : null);
        };
        r.stop();
      });
    },
    cancel() {
      cancelled = true;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      rec = null;
      release();
    },
  };
}

export async function uploadVoice(r: Recording): Promise<{ voice: string; duration: number | null }> {
  const form = new FormData();
  const ext = r.type.includes('mp4') ? 'm4a' : r.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('file', new File([r.blob], `voice.${ext}`, { type: r.type.split(';')[0] }));
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/api/chat/voice`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('连不上服务器，检查一下网络', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? `发送失败 (${res.status})`, res.status);
  return data;
}

// ---- 播放：同一时间只播一条
let audio: HTMLAudioElement | null = null;
let notify: ((playing: boolean) => void) | null = null;

export function stopVoice() {
  audio?.pause();
  audio = null;
  notify?.(false);
  notify = null;
}

export function playVoice(url: string, onState: (playing: boolean) => void) {
  stopVoice();
  const a = new Audio(url);
  audio = a;
  notify = onState;
  a.onended = () => audio === a && stopVoice();
  a.onerror = () => audio === a && stopVoice();
  onState(true);
  a.play().catch(() => audio === a && stopVoice());
}
