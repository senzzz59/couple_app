import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 视频兼容：iPhone 默认拍 HEVC（H.265，常常还是 10-bit HDR），安卓不一定能播；
 * 安卓偶尔会给 WebM / 3GP，iPhone 播不了。统一转成 H.264 + AAC 的 MP4（所有手机浏览器都能播）。
 * - 上传时：读出尺寸 / 时长，截一帧当封面（很快，同步完成）
 * - 转码：放进后台队列一个一个做，不拖慢上传；文件名不变，原地替换
 * - 启动时：把以前上传、还没检查过的视频也补做一遍
 * 服务器没有 ffmpeg 时全部跳过，保持原样。
 */

export type VideoProbe = {
  codec: string | null;
  pixFmt: string | null;
  width: number | null;
  height: number | null;
  rotation: number;
  audio: string | null;
  duration: number | null;
  format: string;
};

type Status = 'ok' | 'converted' | 'failed';

function exec(cmd: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return resolve({ code: -1, stdout, stderr: 'spawn failed' });
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout = (stdout + d).slice(-200_000)));
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-20_000)));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr || 'not found' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

let available: Promise<boolean> | null = null;
export function ffmpegAvailable() {
  available ??= Promise.all([exec('ffmpeg', ['-version'], 10_000), exec('ffprobe', ['-version'], 10_000)]).then(([a, b]) => a.code === 0 && b.code === 0);
  return available;
}

export async function probeVideo(file: string): Promise<VideoProbe | null> {
  const r = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height:stream_side_data=rotation:stream_tags=rotate:format=duration,format_name', '-of', 'json', file], 60_000);
  if (r.code !== 0) return null;
  try {
    const data = JSON.parse(r.stdout) as { streams?: Record<string, unknown>[]; format?: { duration?: string; format_name?: string } };
    const streams = data.streams ?? [];
    const v = streams.find((s) => s.codec_type === 'video');
    const a = streams.find((s) => s.codec_type === 'audio');
    const side = (v?.side_data_list as { rotation?: number }[] | undefined)?.find((d) => d.rotation != null)?.rotation;
    const tag = Number((v?.tags as { rotate?: string } | undefined)?.rotate ?? 0);
    const rotation = Math.abs(Number(side ?? tag) || 0) % 180 === 90 ? 90 : 0;
    const duration = Number(data.format?.duration);
    return {
      codec: (v?.codec_name as string) ?? null,
      pixFmt: (v?.pix_fmt as string) ?? null,
      width: (v?.width as number) ?? null,
      height: (v?.height as number) ?? null,
      rotation,
      audio: (a?.codec_name as string) ?? null,
      duration: Number.isFinite(duration) ? duration : null,
      format: data.format?.format_name ?? '',
    };
  } catch {
    return null;
  }
}

/** 这个视频要怎么处理：不用动 / 只换容器 / 重新编码 */
export function videoPlan(p: VideoProbe): 'ok' | 'remux' | 'transcode' {
  if (!p.codec) return 'ok';
  if (p.codec !== 'h264') return 'transcode';
  if (p.pixFmt && !['yuv420p', 'yuvj420p'].includes(p.pixFmt)) return 'transcode';
  if (p.audio && !['aac', 'mp3'].includes(p.audio)) return 'transcode';
  // ffprobe 把 MP4 / MOV / 3GP 都报成 "mov,mp4,m4a,3gp,..."；不是这一族的（WebM / MKV）才需要换容器
  if (!p.format.split(',').includes('mp4')) return 'remux';
  return 'ok';
}

/** 显示尺寸（考虑竖拍视频的旋转） */
export function displaySize(p: VideoProbe) {
  if (!p.width || !p.height) return { width: null, height: null };
  return p.rotation ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/** 截一帧当封面（ffmpeg 会自动按旋转摆正） */
export async function makePoster(file: string, out: string) {
  const r = await exec('ffmpeg', ['-v', 'error', '-y', '-ss', '0.1', '-i', file, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', out], 60_000);
  if (r.code === 0) return true;
  // 特别短的视频 0.1 秒处可能没有画面，从头再截一次
  const again = await exec('ffmpeg', ['-v', 'error', '-y', '-i', file, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', out], 60_000);
  return again.code === 0;
}

const SCALE = "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'";

export function transcodeArgs(input: string, output: string, plan: 'remux' | 'transcode') {
  if (plan === 'remux') return ['-v', 'error', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', output];
  return [
    '-v', 'error', '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-vf', SCALE,
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart', '-threads', '2', '-f', 'mp4', output,
  ];
}

// ---------- 后台队列 + 记录哪些文件处理过 ----------
let dir = '';
let indexFile = '';
let index: Record<string, Status> = {};
const queue: string[] = [];
let running = false;

export async function initVideoPipeline(uploadDir: string, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }) {
  dir = uploadDir;
  indexFile = path.join(uploadDir, '.video-index.json');
  index = await fs
    .readFile(indexFile, 'utf8')
    .then((t) => JSON.parse(t) as Record<string, Status>)
    .catch(() => ({}));
  if (!(await ffmpegAvailable())) {
    log.warn({}, 'ffmpeg not found: videos are stored as uploaded (no HEVC conversion, no server posters)');
    return;
  }
  // 补做以前上传的视频
  const files = await fs.readdir(uploadDir).catch(() => [] as string[]);
  const pending = files.filter((f) => /^[0-9a-f-]{36}\.(mp4|mov|webm|m4v|3gp)$/.test(f) && !index[f]);
  if (pending.length) log.info({ count: pending.length }, 'checking previously uploaded videos for compatibility');
  for (const f of pending) enqueueVideo(f, log);
}

async function saveIndex() {
  if (!indexFile) return;
  const tmp = `${indexFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(index));
  await fs.rename(tmp, indexFile);
}

/** 文件已经确认是所有设备都能播的格式（可以长期缓存） */
export const videoSettled = (name: string) => index[name] === 'ok' || index[name] === 'converted' || index[name] === 'failed';
/** 文件内容是 MP4（转码后扩展名可能还是 .mov / .webm） */
export const videoIsMp4 = (name: string) => index[name] === 'converted' || /\.(mp4|mov|m4v)$/.test(name);

export function enqueueVideo(name: string, log?: { warn: (o: object, m: string) => void }) {
  if (!dir || queue.includes(name)) return;
  queue.push(name);
  if (!running) void drain(log);
}

async function drain(log?: { warn: (o: object, m: string) => void }) {
  running = true;
  while (queue.length) {
    const name = queue.shift()!;
    const file = path.join(dir, name);
    try {
      const exists = await fs.stat(file).catch(() => null);
      if (!exists) continue;
      const probe = await probeVideo(file);
      const plan = probe ? videoPlan(probe) : 'ok';
      if (plan === 'ok') {
        index[name] = 'ok';
      } else {
        const tmp = path.join(dir, `.${name}.tmp.mp4`);
        // 低优先级运行，别抢 API 的 CPU；没有 nice 命令就直接跑
        let r = await exec('nice', ['-n', '10', 'ffmpeg', ...transcodeArgs(file, tmp, plan)], 60 * 60_000);
        if (r.code === -1) r = await exec('ffmpeg', transcodeArgs(file, tmp, plan), 60 * 60_000);
        if (r.code === 0) {
          await fs.rename(tmp, file);
          index[name] = 'converted';
        } else {
          await fs.rm(tmp, { force: true });
          index[name] = 'failed';
          log?.warn({ name, error: r.stderr.slice(-500) }, 'video conversion failed');
        }
      }
    } catch (e) {
      index[name] = 'failed';
      log?.warn({ name, err: e }, 'video conversion failed');
    }
    await saveIndex().catch(() => {});
  }
  running = false;
}

/** 测试用：等队列空 */
export async function waitForVideoQueue(timeoutMs = 120_000) {
  const t0 = Date.now();
  while ((running || queue.length) && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 200));
}
