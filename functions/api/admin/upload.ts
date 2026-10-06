/** POST тіло = зображення (WebP/JPEG/PNG до 3 МБ) → R2, повертає відносний шлях media/p/<id>.<ext>. */
import type { Env } from '../../../lib/catalog';
import { json } from '../../../lib/access';

const MAX = 3 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  'image/webp': { ext: 'webp', magic: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MEDIA) return json(500, { ok: false, error: 'R2 MEDIA не підключено' });
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  const t = TYPES[type];
  if (!t) return json(415, { ok: false, error: 'лише WebP, JPEG або PNG' });
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX) return json(413, { ok: false, error: 'файл більший за 3 МБ' });
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > MAX || buf.length < 16) return json(413, { ok: false, error: 'розмір файлу' });
  if (!t.magic(buf)) return json(415, { ok: false, error: 'вміст не схожий на зображення' });
  const key = `p/${crypto.randomUUID()}.${t.ext}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  return json(200, { ok: true, url: `media/${key}` });
};
