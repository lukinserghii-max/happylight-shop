/** /katalog/ і /katalog/<розділ>/ — HTML без JavaScript з актуального каталогу (KV). */
import { loadCatalog, type Env } from '../../lib/catalog';
import { inCat, renderCatalogIndex, renderCategory, renderNotFound } from '../../lib/seo';
import { isRead, notAllowed, respond, siteCtx, slashRedirect } from '../../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isRead(request.method)) return notAllowed();
  const redirect = slashRedirect(request);
  if (redirect) return redirect;
  const segs = (params.path as string[] | undefined) ?? [];
  const { data } = await loadCatalog(env, request.url);
  const ctx = siteCtx(env, request);
  if (segs.length === 0) return respond(renderCatalogIndex(data, ctx), 'html', 200, request.method);
  const cat = segs.length === 1 ? data.cats.find(c => c.id === segs[0]) : undefined;
  if (!cat || !inCat(data, cat.id).length) return respond(renderNotFound(data, ctx, segs.length + 1), 'html', 404, request.method);
  return respond(renderCategory(data, cat, ctx), 'html', 200, request.method);
};
