/** Тест перевірки входу Cloudflare Access: справжній підпис RS256, aud, iss, строк, список e-mail, dev-обхід лише на localhost. */
import assert from 'node:assert/strict';
import { verifyAdmin } from '../lib/access.ts';

const TEAM = 'happylight.cloudflareaccess.com', AUD = 'test-aud-123';
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
const fetcher = (async () => new Response(JSON.stringify({ keys: [{ kid: 'k1', kty: 'RSA', n: pub.n, e: pub.e }] }))) as unknown as typeof fetch;
const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function token(payload: Record<string, unknown>, kid = 'k1', key = kp.privateKey) {
  const h = b64({ alg: 'RS256', kid }), p = b64(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + Buffer.from(sig).toString('base64url');
}
const now = Math.floor(Date.now() / 1000);
const good = { aud: [AUD], iss: `https://${TEAM}`, exp: now + 600, email: 'Bogdan@Example.com' };
const env = { ASSETS: {} as Fetcher, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: 'bogdan@example.com, serg@example.com' };
const req = (t?: string, url = 'https://shop.example/api/admin/catalog') => new Request(url, { headers: t ? { 'Cf-Access-Jwt-Assertion': t } : {} });

assert.deepEqual(await verifyAdmin(req(await token(good)), env, fetcher), { email: 'bogdan@example.com' });
assert.equal(await verifyAdmin(req(), env, fetcher), null, 'без токена');
assert.equal(await verifyAdmin(req(await token({ ...good, aud: ['other'] })), env, fetcher), null, 'чужий aud');
assert.equal(await verifyAdmin(req(await token({ ...good, iss: 'https://evil.cloudflareaccess.com' })), env, fetcher), null, 'чужий iss');
assert.equal(await verifyAdmin(req(await token({ ...good, exp: now - 10 })), env, fetcher), null, 'прострочений');
assert.equal(await verifyAdmin(req(await token({ ...good, email: 'hacker@example.com' })), env, fetcher), null, 'не в списку');
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
assert.equal(await verifyAdmin(req(await token(good, 'k1', other.privateKey)), env, fetcher), null, 'підробний підпис');
const t = await token(good); const parts = t.split('.'); parts[1] = b64({ ...good, email: 'serg@example.com' });
assert.equal(await verifyAdmin(req(parts.join('.')), env, fetcher), null, 'змінений payload');
assert.equal(await verifyAdmin(req(undefined, 'https://shop.example/x'), { ...env, DEV_NO_ACCESS: '1' }, fetcher), null, 'dev-обхід не діє в продакшені');
assert.deepEqual(await verifyAdmin(req(undefined, 'http://127.0.0.1:8788/x'), { ...env, DEV_NO_ACCESS: '1' }, fetcher), { email: 'dev@localhost' });
assert.equal(await verifyAdmin(req(await token(good)), { ...env, ADMIN_EMAILS: '' }, fetcher), null, 'порожній список адмінів = нікого');
console.log('access: усі перевірки пройдено');
