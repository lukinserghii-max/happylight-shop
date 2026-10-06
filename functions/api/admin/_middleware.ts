/** Усі /api/admin/* лише для входу через Cloudflare Access; зміни лише з нашого ж сайту. */
import { verifyAdmin, json, sameOrigin } from '../../../lib/access';
import type { Env } from '../../../lib/catalog';

export const onRequest: PagesFunction<Env, string, { user: { email: string } }> = async ctx => {
  const user = await verifyAdmin(ctx.request, ctx.env);
  if (!user) return json(401, { ok: false, error: 'unauthorized' });
  if (ctx.request.method !== 'GET' && !sameOrigin(ctx.request)) return json(403, { ok: false, error: 'origin' });
  ctx.data.user = user;
  return ctx.next();
};
