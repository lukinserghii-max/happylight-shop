/** Головна: статичний index.html, але canonical/og/розмітка — під поточний домен, каталог у футері — з KV. */
import { loadCatalog, type Env } from '../lib/catalog';
import { indexFooterCats, indexHead, parseFaq, replaceBlock } from '../lib/seo';
import { siteCtx } from '../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  if (request.method !== 'GET') return next();
  const res = await env.ASSETS.fetch(new URL('/', request.url).toString());
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  try {
    let html = await res.text();
    const { data } = await loadCatalog(env, request.url);
    html = replaceBlock(html, 'head', indexHead(siteCtx(env, request), parseFaq(html)));
    html = replaceBlock(html, 'footer', '    ' + indexFooterCats(data));
    const headers = new Headers(res.headers);
    headers.delete('Content-Length');
    headers.delete('ETag');
    headers.set('Cache-Control', 'public, max-age=300');
    return new Response(html, { status: 200, headers });
  } catch {
    return next();
  }
};
