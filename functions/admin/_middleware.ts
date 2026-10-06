/** Сторінка /admin: другий рубіж після Cloudflare Access, без входу не віддаємо навіть HTML. */
import { verifyAdmin } from '../../lib/access';
import type { Env } from '../../lib/catalog';

export const onRequest: PagesFunction<Env> = async ctx => {
  const user = await verifyAdmin(ctx.request, ctx.env);
  if (!user) return new Response('Доступ лише для адміністраторів HappyLight.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const res = await ctx.next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
};
