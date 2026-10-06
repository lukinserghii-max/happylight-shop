/** /sitemap.xml — з актуального каталогу (приховані товари не потрапляють). */
import { loadCatalog, type Env } from '../lib/catalog';
import { renderSitemap } from '../lib/seo';
import { isRead, notAllowed, respond, siteCtx } from '../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!isRead(request.method)) return notAllowed();
  const { data } = await loadCatalog(env, request.url);
  return respond(renderSitemap(data, siteCtx(env, request)), 'xml', 200, request.method);
};
