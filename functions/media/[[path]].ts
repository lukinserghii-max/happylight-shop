/** GET /media/p/<id>.<ext> — фото, завантажені через адмінку (R2). */
import type { Env } from '../../lib/catalog';

const KEY = /^p\/[0-9a-f-]{36}\.(webp|jpg|png)$/;

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!KEY.test(key) || !env.MEDIA) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(obj.body, { headers });
};
