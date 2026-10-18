import { createReadStream } from 'node:fs';
import { PassThrough, type Readable } from 'node:stream';

/**
 * 最小的 ZIP 打包（只存储不压缩：照片和视频本身已经压缩过）。
 * 边读边写，内存占用和文件大小无关；用数据描述符，所以不需要事先算 CRC。
 * 总大小需小于 4GB、文件数少于 65535（相册批量下载足够）。
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array, prev = 0) {
  let c = ~prev >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export type ZipEntry = { name: string; path?: string; data?: Buffer; open?: () => Promise<AsyncIterable<Buffer>>; date?: Date };

/** 同名文件加上 (2)、(3)… */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return n;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? `${n.slice(0, dot)} (${count})${n.slice(dot)}` : `${n} (${count})`;
  });
}

export function zipStream(entries: ZipEntry[]): Readable {
  const out = new PassThrough();
  const write = (b: Buffer) => (out.write(b) ? Promise.resolve() : new Promise<void>((r) => out.once('drain', () => r())));

  (async () => {
    let offset = 0;
    const central: Buffer[] = [];
    for (const e of entries) {
      const name = Buffer.from(e.name, 'utf8');
      const { time, date } = dosTime(e.date ?? new Date());
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // version needed
      local.writeUInt16LE(0x0808, 6); // 数据描述符 + UTF-8 文件名
      local.writeUInt16LE(0, 8); // 存储
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt16LE(name.length, 26);
      await write(local);
      await write(name);

      let crc = 0;
      let size = 0;
      const chunks: Iterable<Buffer> | AsyncIterable<Buffer> = e.data ? [e.data] : e.open ? await e.open() : (createReadStream(e.path!) as AsyncIterable<Buffer>);
      for await (const chunk of chunks) {
        crc = crc32(chunk, crc);
        size += chunk.length;
        await write(chunk);
      }

      const desc = Buffer.alloc(16);
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(crc, 4);
      desc.writeUInt32LE(size, 8);
      desc.writeUInt32LE(size, 12);
      await write(desc);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0x0808, 8);
      cd.writeUInt16LE(0, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(size, 20);
      cd.writeUInt32LE(size, 24);
      cd.writeUInt16LE(name.length, 28);
      cd.writeUInt32LE(offset, 42);
      central.push(cd, name);
      offset += 30 + name.length + size + 16;
    }
    const cdBuf = Buffer.concat(central);
    await write(cdBuf);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cdBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    await write(end);
    out.end();
  })().catch((err) => out.destroy(err));

  return out;
}
