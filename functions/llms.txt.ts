/** /llms.txt — короткий опис магазину для AI-асистентів з актуальними цінами. */
import { loadCatalog, type Env } from '../lib/catalog';
import { renderLlms } from '../lib/seo';
import { isRead, notAllowed, respond, siteCtx } from '../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!isRead(request.method)) return notAllowed();
  const { data } = await loadCatalog(env, request.url);
  return respond(renderLlms(data, siteCtx(env, request)), 'txt', 200, request.method);
};
