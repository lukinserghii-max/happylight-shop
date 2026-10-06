/**
 * Перевірка входу в адмінку через Cloudflare Access.
 * Access сам пускає лише дозволені e-mail; тут повторно перевіряємо підпис JWT, aud, iss, строк і список ADMIN_EMAILS.
 */
import type { Env } from './catalog';

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let jwksCache: { at: number; team: string; keys: Jwk[] } | null = null;

const b64urlToBytes = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as T;

async function jwks(team: string, fetcher: typeof fetch): Promise<Jwk[]> {
  if (jwksCache && jwksCache.team === team && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const res = await fetcher(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('certs ' + res.status);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), team, keys: body.keys };
  return body.keys;
}

export interface AdminUser { email: string }

/** Повертає користувача або null. fetcher можна підмінити в тестах. */
export async function verifyAdmin(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<AdminUser | null> {
  const host = new URL(request.url).hostname;
  // локальна розробка: лише на localhost і лише з явним прапорцем у .dev.vars
  if (env.DEV_NO_ACCESS === '1' && (host === 'localhost' || host === '127.0.0.1')) return { email: 'dev@localhost' };
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  const allowed = (env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!team || !aud || !allowed.length) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson<{ kid: string; alg: string }>(parts[0]);
    const payload = decodeJson<{ aud: string | string[]; exp: number; nbf?: number; iss: string; email?: string }>(parts[1]);
    if (header.alg !== 'RS256') return null;
    const jwk = (await jwks(team, fetcher)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud) || payload.exp < now || (payload.nbf && payload.nbf > now + 60)) return null;
    if (payload.iss !== `https://${team}`) return null;
    const email = (payload.email || '').toLowerCase();
    if (!allowed.includes(email)) return null;
    return { email };
  } catch {
    return null;
  }
}

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Захист від запитів з чужих сайтів для змін (POST/PUT). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || new URL(origin).host === new URL(request.url).host;
}
