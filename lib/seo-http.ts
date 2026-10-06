/** Спільне для функцій SEO-сторінок: адреса сайту, відповіді з заголовками, «/» в кінці адреси. */
import type { Env } from './catalog';
import type { Ctx } from './seo';

const CSP = "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'";

/** База для абсолютних адрес: змінна SITE_URL (лише https) або origin запиту. */
export function siteCtx(env: Env, request: Request): Ctx {
  if (env.SITE_URL) {
    try {
      const u = new URL(env.SITE_URL);
      if (u.protocol === 'https:') return { base: u.origin + (u.pathname.endsWith('/') ? u.pathname : u.pathname + '/') };
    } catch { /* невірна змінна — беремо адресу запиту */ }
  }
  return { base: new URL(request.url).origin + '/' };
}

export function respond(body: string, type: 'html' | 'xml' | 'txt', status = 200, method = 'GET'): Response {
  const ct = { html: 'text/html; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8' }[type];
  const headers: Record<string, string> = {
    'Content-Type': ct,
    'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (type === 'html') headers['Content-Security-Policy'] = CSP;
  return new Response(method === 'HEAD' ? null : body, { status, headers });
}

/** Сторінки мають відносні посилання, тому адреса повинна закінчуватися на «/». */
export function slashRedirect(request: Request): Response | null {
  const u = new URL(request.url);
  if (u.pathname.endsWith('/')) return null;
  return Response.redirect(u.origin + u.pathname + '/' + u.search, 301);
}

export const notAllowed = (): Response => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
export const isRead = (m: string): boolean => m === 'GET' || m === 'HEAD';
