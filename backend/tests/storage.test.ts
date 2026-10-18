import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentTypeOf, legacyKey, objectKey, parseObjectKey, s3ConfigFrom, SIGN_EXPIRES_S, SIGN_WINDOW_S, signWindow } from '../src/storage.ts';

const keys = { S3_ENDPOINT: 'cn-sy1.rains3.com', S3_BUCKET: 'couple', S3_ACCESS_KEY: 'ak', S3_SECRET_KEY: 'sk' };

test('object storage stays off until endpoint, bucket and both keys are set', () => {
  assert.equal(s3ConfigFrom({}), null);
  assert.equal(s3ConfigFrom({ ...keys, S3_SECRET_KEY: ' ' }), null);
  const cfg = s3ConfigFrom({ ...keys, S3_INTERNAL_ENDPOINT: 'cn-sy1.internal.rains3.com/', S3_PREFIX: '/couple/' })!;
  assert.equal(cfg.endpoint, 'https://cn-sy1.rains3.com');
  assert.equal(cfg.internalEndpoint, 'http://cn-sy1.internal.rains3.com');
  assert.equal(cfg.region, 'us-east-1');
  assert.equal(cfg.forcePathStyle, false);
  assert.equal(objectKey(cfg.prefix, 'thumb', 'a.jpg'), 'couple/thumbs/a.jpg');
  assert.equal(objectKey(s3ConfigFrom(keys)!.prefix, 'main', 'a.jpg'), 'photos/a.jpg');
});

test('signed links stay identical within a window and remain valid for days', () => {
  const t = Date.UTC(2026, 9, 18, 12);
  const a = signWindow(t);
  const b = signWindow(t + 3600_000);
  assert.equal(a.signingDate.getTime(), b.signingDate.getTime());
  assert.ok(a.signingDate.getTime() <= t);
  const expiresAt = a.signingDate.getTime() / 1000 + SIGN_EXPIRES_S;
  // 浏览器缓存的跳转在链接过期前很久就失效
  assert.ok(expiresAt - (t / 1000 + a.cacheSeconds) >= SIGN_EXPIRES_S - SIGN_WINDOW_S);
  assert.ok(a.cacheSeconds > 0 && a.cacheSeconds <= SIGN_WINDOW_S);
});

test('transcoded videos are stored as mp4 regardless of extension', () => {
  assert.equal(contentTypeOf('x.mov'), 'video/quicktime');
  assert.equal(contentTypeOf('x.mov', true), 'video/mp4');
  assert.equal(contentTypeOf('x.webm', true), 'video/mp4');
  assert.equal(contentTypeOf('x.jpg', true), 'image/jpeg');
  assert.equal(contentTypeOf('x.HEIC'), 'image/heic');
});

test('checksum-required requests use Content-MD5 instead of CRC32 headers (Rainyun rejects x-amz-checksum-*)', async () => {
  const http = await import('node:http');
  const { S3Client, PutBucketCorsCommand } = await import('@aws-sdk/client-s3');
  const { useContentMd5 } = await import('../src/storage.ts');
  let headers: Record<string, unknown> = {};
  const srv = http.createServer((req, res) => {
    headers = req.headers;
    req.resume();
    req.on('end', () => res.end());
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const c = useContentMd5(
    new S3Client({ endpoint: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'a', secretAccessKey: 'b' }, requestChecksumCalculation: 'WHEN_REQUIRED' })
  );
  await c.send(new PutBucketCorsCommand({ Bucket: 'b', CORSConfiguration: { CORSRules: [{ AllowedMethods: ['GET'], AllowedOrigins: ['*'] }] } }));
  srv.close();
  assert.ok(headers['content-md5']);
  assert.ok(!Object.keys(headers).some((h) => h.startsWith('x-amz-checksum') || h === 'x-amz-sdk-checksum-algorithm'));
  assert.match(String(headers['x-amz-content-sha256'] ?? headers.authorization), /./);
});

test('objects are sorted into folders by kind, and old locations are recognised', () => {
  assert.equal(objectKey('', 'main', 'a.jpg'), 'photos/a.jpg');
  assert.equal(objectKey('', 'main', 'a.MOV'), 'videos/a.MOV');
  assert.equal(objectKey('', 'thumb', 'a.mp4'), 'thumbs/a.mp4');
  assert.equal(objectKey('x/', 'orig', 'a.heic'), 'x/originals/a.heic');
  assert.equal(legacyKey('', 'main', 'a.jpg'), 'a.jpg');
  assert.equal(legacyKey('', 'orig', 'a.jpg'), 'orig/a.jpg');
  assert.deepEqual(parseObjectKey('photos/a.jpg'), { area: 'main', name: 'a.jpg', legacy: false });
  assert.deepEqual(parseObjectKey('videos/a.mov'), { area: 'main', name: 'a.mov', legacy: false });
  assert.deepEqual(parseObjectKey('thumbs/a.jpg'), { area: 'thumb', name: 'a.jpg', legacy: false });
  assert.deepEqual(parseObjectKey('originals/a.heic'), { area: 'orig', name: 'a.heic', legacy: false });
  assert.deepEqual(parseObjectKey('a.jpg'), { area: 'main', name: 'a.jpg', legacy: true });
  assert.deepEqual(parseObjectKey('thumb/a.jpg'), { area: 'thumb', name: 'a.jpg', legacy: true });
  assert.deepEqual(parseObjectKey('orig/a.jpg'), { area: 'orig', name: 'a.jpg', legacy: true });
  for (const k of ['uploading/a.jpg', 'incoming/a.jpg', 'other/a.jpg', 'photos/x/a.jpg', 'photos/', '']) assert.equal(parseObjectKey(k), null, k);
});
