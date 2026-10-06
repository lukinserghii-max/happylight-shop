/** /yak-obraty/ — гайд з порівнянням ретро-гірлянд за актуальними цінами. */
import { loadCatalog, type Env } from '../../lib/catalog';
import { renderGuide, renderNotFound } from '../../lib/seo';
import { isRead, notAllowed, respond, siteCtx, slashRedirect } from '../../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isRead(request.method)) return notAllowed();
  const redirect = slashRedirect(request);
  if (redirect) return redirect;
  const segs = (params.path as string[] | undefined) ?? [];
  const { data } = await loadCatalog(env, request.url);
  const ctx = siteCtx(env, request);
  if (segs.length) return respond(renderNotFound(data, ctx, segs.length + 1), 'html', 404, request.method);
  return respond(renderGuide(data, ctx), 'html', 200, request.method);
};
