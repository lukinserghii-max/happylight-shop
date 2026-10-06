/** /tovar/<товар>/ — сторінка товару з цінами з актуального каталогу (KV). Прихований товар → 404. */
import { loadCatalog, type Env } from '../../lib/catalog';
import { renderNotFound, renderProduct } from '../../lib/seo';
import { isRead, notAllowed, respond, siteCtx, slashRedirect } from '../../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isRead(request.method)) return notAllowed();
  const redirect = slashRedirect(request);
  if (redirect) return redirect;
  const segs = (params.path as string[] | undefined) ?? [];
  const { data } = await loadCatalog(env, request.url);
  const ctx = siteCtx(env, request);
  const p = segs.length === 1 ? data.products.find(x => x.id === segs[0] && !x.hidden) : undefined;
  if (!p) return respond(renderNotFound(data, ctx, Math.max(segs.length, 0) + 1), 'html', 404, request.method);
  return respond(renderProduct(data, p, ctx), 'html', 200, request.method);
};
