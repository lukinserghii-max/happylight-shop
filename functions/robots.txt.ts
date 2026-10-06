/** /robots.txt — з правильною абсолютною адресою sitemap для поточного домену. */
import type { Env } from '../lib/catalog';
import { renderRobots } from '../lib/seo';
import { isRead, notAllowed, respond, siteCtx } from '../lib/seo-http';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!isRead(request.method)) return notAllowed();
  return respond(renderRobots(siteCtx(env, request)), 'txt', 200, request.method);
};
