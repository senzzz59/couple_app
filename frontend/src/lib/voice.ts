/** 语音消息：原生 App 暂不支持录音 / 播放（网页版用 voice.web.ts） */
export type Recording = { blob: Blob; type: string; duration: number };

export const voiceSupported = () => false;
export const playbackSupported = () => false;

export function createRecorder() {
  return {
    start: async () => {
      throw new Error('这里暂时不能录音');
    },
    stop: async (): Promise<Recording | null> => null,
    cancel: () => {},
  };
}

export async function uploadVoice(_r: Recording): Promise<{ voice: string; duration: number | null }> {
  throw new Error('这里暂时不能发语音');
}

export function playVoice(_url: string, _onState: (playing: boolean) => void) {}
export function stopVoice() {}
