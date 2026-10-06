/**
 * Тест функції замовлення без мережі: підміняємо ASSETS і fetch до Telegram.
 * Запуск: CATALOG=<шлях до catalog.json> npx tsx tools/order.test.ts
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/order.ts';

const catalogPath = process.env.CATALOG ?? 'public/data/catalog.json';
const catalogText = readFileSync(catalogPath, 'utf-8');
const catalog = JSON.parse(catalogText) as { products: { id: string; variants: { p: number }[]; addons: { o: { p: number }[] }[] }[] };

const sent: { url: string; body: { chat_id: string; text: string } }[] = [];
let tgStatus = 200;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  return new Response('{"ok":true}', { status: tgStatus });
}) as typeof fetch;

const env = {
  TG_BOT_TOKEN: 'test-token',
  TG_CHAT_ID: '12345',
  ASSETS: { fetch: async () => new Response(catalogText, { headers: { 'Content-Type': 'application/json' } }) }
};

const call = (body: unknown, opts: { method?: string; origin?: string; type?: string } = {}) =>
  onRequest({
    request: new Request('https://shop.example/api/order', {
      method: opts.method ?? 'POST',
      headers: { 'Content-Type': opts.type ?? 'application/json', Origin: opts.origin ?? 'https://shop.example' },
      body: opts.method === 'GET' ? undefined : JSON.stringify(body)
    }),
    env
  });

const p = catalog.products.find(x => x.variants.length > 1 && x.addons.length > 1)!;
const good = {
  items: [{ id: p.id, vi: 1, ai: p.addons.map((_, i) => (i === 0 ? 1 : 0)), q: 2 }],
  customer: { name: 'Тест Тестович', phone: '+380631234567' },
  delivery: { type: 'np', city: 'Київ', point: '12' },
  payment: 'cod', comment: '<script>x</script>', website: '', clientTotal: 1
};

const expected = (p.variants[1].p + p.addons[0].o[1].p + p.addons.slice(1).reduce((s, a) => s + a.o[0].p, 0)) * 2;

let r = await call(good);
let j = await r.json() as { ok: boolean; id: string; total: number; error?: string };
assert.equal(r.status, 200, JSON.stringify(j));
assert.equal(j.total, expected, 'сума рахується на сервері');
assert.match(j.id, /^HL-\d{6}-[A-Z0-9]{4}$/);
assert.equal(sent.length, 1);
assert.ok(sent[0].url.includes('/bottest-token/sendMessage'));
assert.ok(sent[0].body.text.includes('&lt;script&gt;'), 'HTML екранується');
assert.ok(sent[0].body.text.includes('клієнт бачив'), 'розбіжність суми позначена');

// негативні випадки
const bad = async (b: unknown, code: number, opts = {}) => { const x = await call(b, opts); assert.equal(x.status, code, JSON.stringify(b).slice(0, 80)); };
await bad({ ...good, customer: { name: 'A', phone: '+380631234567' } }, 400);
await bad({ ...good, customer: { name: 'Тест', phone: '0631234567' } }, 400);
await bad({ ...good, items: [{ id: 'nope', vi: 0, ai: [], q: 1 }] }, 400);
await bad({ ...good, items: [{ ...good.items[0], vi: 999 }] }, 400);
await bad({ ...good, items: [{ ...good.items[0], q: 0 }] }, 400);
await bad({ ...good, delivery: { type: 'pickup', city: '', point: '' }, payment: 'cod' }, 400);
await bad({ ...good, delivery: { type: 'np', city: '', point: '' } }, 400);
await bad(good, 403, { origin: 'https://evil.example' });
await bad(good, 415, { type: 'text/plain' });
await bad(good, 405, { method: 'GET' });
await bad({ ...good, comment: 'x'.repeat(20000) }, 413);
// бот-пастка: відповідь «успіх», але в Telegram нічого не йде
const before = sent.length;
r = await call({ ...good, website: 'spam' }); assert.equal(r.status, 200); assert.equal(sent.length, before);
// Telegram недоступний → 502, сайт покаже запасний сценарій
tgStatus = 500; await bad(good, 502); tgStatus = 200;
// самовивіз готівкою проходить
r = await call({ ...good, delivery: { type: 'pickup', city: '', point: '' }, payment: 'cash' }); assert.equal(r.status, 200);

console.log('order function: усі перевірки пройдено');
console.log('--- приклад повідомлення ---\n' + sent[0].body.text);
